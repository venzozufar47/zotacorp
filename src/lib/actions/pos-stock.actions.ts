"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./_supabase-admin";
import { verifyShiftCashier } from "@/lib/pos/shift-data";
import {
  requireAdminOrPosAssignee,
  type ActionResult,
} from "./_gates";
import {
  jakartaDateString,
  jakartaDateMinusDays,
  jakartaHHMM,
} from "@/lib/utils/jakarta";
import {
  listOperationAuthorizers,
  verifyOperationPin,
} from "@/lib/pos/authorizers";
import {
  emptyPosAuthorizerMap,
  type PosAuthorizerMap,
} from "@/lib/pos-pin-format";
import {
  isWithdrawalReason,
  WITHDRAWAL_REASON_META,
  type WithdrawalReason,
} from "@/lib/pos/withdrawal-reasons";
// Primitif mesin stok tinggal di modul biasa supaya cron (tanpa sesi)
// bisa memakainya juga — file ini "use server" dan tidak boleh
// mengekspor fungsi non-async. Lihat header stock-engine.ts.
import {
  computeExpectedCounts,
  jakartaHourIso,
  listActiveSkus,
  loadBaselineAt,
  loadStockEventStream,
  sampleReadiness,
  skuKey,
  type PosDbClient,
  type Sku,
  type SkuKey,
} from "@/lib/pos/stock-engine";

/**
 * POS stock opname subsystem.
 *
 * Invariant per (product, variant):
 *   expected = lastOpname.physical
 *            + Σ(production qty where created_at > lastOpname.created_at)
 *            − Σ(withdrawal qty where created_at > lastOpname.created_at)
 *            − Σ(sale qty where pos_sales.created_at > lastOpname.created_at
 *                          and voided_at is null)
 *
 * Cut-off pakai `created_at` (bukan movement_date / sale_date) supaya
 * multi-opname per hari tetap valid — snapshot dipotong di momen persis
 * opname sebelumnya dibuat.
 */

export type StockMovementType = "production" | "withdrawal";

export interface StockOnHand {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  onHand: number;
  lastOpnameAt: string | null;
}

export interface StockMovementRow {
  id: string;
  type: StockMovementType;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  qty: number;
  notes: string | null;
  /** Hanya terisi untuk `withdrawal`; null = produksi, atau baris lama. */
  withdrawalReason: WithdrawalReason | null;
  movementDate: string;
  movementTime: string | null;
}

export interface StockOpnameSummary {
  id: string;
  opnameDate: string;
  opnameTime: string | null;
  totalDiffQty: number;
  totalDiffValue: number;
  itemCount: number;
}

export interface StockOpnameItemDetail {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  physicalCount: number;
  expectedCount: number;
  diffQty: number;
  diffValue: number;
}

export interface StockOpnameDetail {
  summary: StockOpnameSummary;
  notes: string | null;
  items: StockOpnameItemDetail[];
}

/** Baseline "sebelum sekarang" — pembungkus tipis `loadBaselineAt`. */
async function loadBaseline(
  supabase: PosDbClient,
  bankAccountId: string,
  aggregateProductIds?: Set<string>
): Promise<{
  cutoffIso: string | null;
  baseline: Map<SkuKey, number>;
  opnameId: string | null;
  itemCount: number;
}> {
  return loadBaselineAt(supabase, bankAccountId, new Date().toISOString(), aggregateProductIds);
}

export async function listStockOnHand(
  bankAccountId: string
): Promise<StockOnHand[]> {
  // Defense-in-depth (audit 2026-07): RLS sudah membatasi baris, tapi
  // gate eksplisit menolak caller non-assignee sebelum query berjalan.
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const supabase = await createClient();
  // Berurutan (bukan Promise.all): baseline butuh aggregateProductIds dari
  // listActiveSkus supaya baris legacy ber-variant_id di produk mode-agregat
  // ikut ter-collapse (lihat komentar loadBaselineAt).
  const { skus, aggregateProductIds } = await listActiveSkus(supabase, bankAccountId);
  const baseline = await loadBaseline(supabase, bankAccountId, aggregateProductIds);
  const now = new Date().toISOString();
  const expected = await computeExpectedCounts(
    supabase,
    bankAccountId,
    baseline.cutoffIso,
    now,
    skus,
    baseline.baseline,
    aggregateProductIds
  );
  return skus.map((s) => ({
    productId: s.productId,
    variantId: s.variantId,
    productName: s.productName,
    variantName: s.variantName,
    unitPrice: s.unitPrice,
    onHand: expected.get(skuKey(s.productId, s.variantId)) ?? 0,
    lastOpnameAt: baseline.cutoffIso,
  }));
}

export async function listStockMovements(
  bankAccountId: string,
  limit = 100
): Promise<StockMovementRow[]> {
  // Defense-in-depth (audit 2026-07) — lihat listStockOnHand.
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_stock_movements")
    .select(
      "id, type, product_id, variant_id, qty, notes, withdrawal_reason, movement_date, movement_time"
    )
    .eq("bank_account_id", bankAccountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
  const variantIds = Array.from(
    new Set(rows.map((r) => r.variant_id).filter((v): v is string => !!v))
  );
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase.from("pos_products").select("id, name").in("id", productIds),
    variantIds.length
      ? supabase.from("pos_product_variants").select("id, name").in("id", variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const pName = new Map((products ?? []).map((p) => [p.id, p.name]));
  const vName = new Map((variants ?? []).map((v) => [v.id, v.name]));

  return rows.map((r) => ({
    id: r.id,
    type: r.type as StockMovementType,
    productId: r.product_id,
    variantId: r.variant_id,
    productName: pName.get(r.product_id) ?? "(produk terhapus)",
    variantName: r.variant_id ? vName.get(r.variant_id) ?? null : null,
    qty: r.qty,
    notes: r.notes,
    withdrawalReason: isWithdrawalReason(r.withdrawal_reason)
      ? r.withdrawal_reason
      : null,
    movementDate: r.movement_date,
    movementTime: r.movement_time,
  }));
}

export async function listStockOpnames(
  bankAccountId: string,
  limit = 50
): Promise<StockOpnameSummary[]> {
  // Defense-in-depth (audit 2026-07) — lihat listStockOnHand.
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data: headers } = await supabase
    .from("pos_stock_opnames")
    .select("id, opname_date, opname_time")
    .eq("bank_account_id", bankAccountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const list = headers ?? [];
  if (list.length === 0) return [];

  const ids = list.map((h) => h.id);
  const { data: items } = await supabase
    .from("pos_stock_opname_items")
    .select("opname_id, physical_count, expected_count, unit_price_snapshot")
    .in("opname_id", ids);

  const agg = new Map<string, { diffQty: number; diffValue: number; count: number }>();
  for (const it of items ?? []) {
    const diff = it.physical_count - it.expected_count;
    const prev = agg.get(it.opname_id) ?? { diffQty: 0, diffValue: 0, count: 0 };
    prev.diffQty += diff;
    prev.diffValue += diff * Number(it.unit_price_snapshot);
    prev.count += 1;
    agg.set(it.opname_id, prev);
  }

  return list.map((h) => {
    const a = agg.get(h.id) ?? { diffQty: 0, diffValue: 0, count: 0 };
    return {
      id: h.id,
      opnameDate: h.opname_date,
      opnameTime: h.opname_time,
      totalDiffQty: a.diffQty,
      totalDiffValue: a.diffValue,
      itemCount: a.count,
    };
  });
}

export async function getStockOpname(
  opnameId: string
): Promise<ActionResult<StockOpnameDetail>> {
  const supabase = await createClient();
  const { data: header } = await supabase
    .from("pos_stock_opnames")
    .select("id, bank_account_id, opname_date, opname_time, notes")
    .eq("id", opnameId)
    .maybeSingle();
  if (!header) return { ok: false, error: "Opname tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(header.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: items } = await supabase
    .from("pos_stock_opname_items")
    .select(
      "product_id, variant_id, product_name_snapshot, variant_name_snapshot, unit_price_snapshot, physical_count, expected_count"
    )
    .eq("opname_id", opnameId);

  const detailItems: StockOpnameItemDetail[] = (items ?? []).map((it) => {
    const diffQty = it.physical_count - it.expected_count;
    const price = Number(it.unit_price_snapshot);
    return {
      productId: it.product_id,
      variantId: it.variant_id,
      productName: it.product_name_snapshot,
      variantName: it.variant_name_snapshot,
      unitPrice: price,
      physicalCount: it.physical_count,
      expectedCount: it.expected_count,
      diffQty,
      diffValue: diffQty * price,
    };
  });

  const totalDiffQty = detailItems.reduce((s, i) => s + i.diffQty, 0);
  const totalDiffValue = detailItems.reduce((s, i) => s + i.diffValue, 0);

  return {
    ok: true,
    data: {
      summary: {
        id: header.id,
        opnameDate: header.opname_date,
        opnameTime: header.opname_time,
        totalDiffQty,
        totalDiffValue,
        itemCount: detailItems.length,
      },
      notes: header.notes,
      items: detailItems,
    },
  };
}

/** Satu baris SKU dalam batch produksi/penarikan. */
export interface StockMovementLine {
  productId: string;
  variantId?: string | null;
  qty: number;
  /**
   * Wajib untuk `type='withdrawal'`, diabaikan untuk produksi.
   *
   * Per-BARIS, bukan per-batch seperti `notes`: audit catatan lama
   * menemukan submit beralasan campur (`rusak, exp, tester`,
   * `expired dan testing`). Kalau alasan dipasang di level batch, baris
   * seperti itu terpaksa dipukul rata ke satu kategori dan metrik susut
   * ikut melenceng.
   */
  reason?: WithdrawalReason | null;
}

/**
 * Catat produksi/penarikan untuk satu ATAU banyak SKU sekaligus — satu
 * submit, satu verifikasi PIN. Dipakai dialog Produksi/Penarikan di POS
 * supaya kasir tak perlu buka modal berulang untuk tiap produk.
 *
 * Validasi dilakukan untuk SEMUA baris lebih dulu; kalau ada satu saja
 * yang tidak valid, tidak ada baris yang ditulis (all-or-nothing pada
 * tahap validasi). Insert-nya sendiri satu batch.
 */
export async function createStockMovements(input: {
  bankAccountId: string;
  type: StockMovementType;
  lines: StockMovementLine[];
  notes?: string;
  /** PIN authorizer — diverifikasi SEKALI untuk seluruh batch. */
  pin?: string;
}): Promise<ActionResult<{ count: number }>> {
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Array.isArray(input.lines) || input.lines.length === 0)
    return { ok: false, error: "Minimal 1 produk" };
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0)
      return { ok: false, error: "Qty harus bilangan bulat > 0" };
  }

  // Alasan divalidasi SEBELUM verifikasi PIN supaya kasir tidak diminta
  // PIN lalu ditolak karena hal yang bisa dicek lebih awal.
  if (input.type === "withdrawal") {
    for (const l of input.lines) {
      if (!isWithdrawalReason(l.reason))
        return { ok: false, error: "Pilih alasan penarikan untuk tiap produk" };
    }
    const needsNote = input.lines.some(
      (l) =>
        isWithdrawalReason(l.reason) &&
        WITHDRAWAL_REASON_META[l.reason].requiresNote
    );
    if (needsNote && !input.notes?.trim())
      return {
        ok: false,
        error: 'Alasan "Lainnya" wajib disertai catatan',
      };
  }

  const auth = await verifyOperationPin(
    input.bankAccountId,
    input.type,
    input.pin
  );
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();

  // Ambil metadata semua produk sekali jalan (hindari N query).
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const { data: products } = await supabase
    .from("pos_products")
    .select("id, name, stock_aggregate_variants, track_stock")
    .in("id", productIds);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  for (const id of productIds) {
    const p = byId.get(id);
    if (!p) return { ok: false, error: "Produk tidak ditemukan" };
    if (!p.track_stock)
      return {
        ok: false,
        error: `${p.name} tidak dihitung di sistem stok`,
      };
  }

  const now = new Date();
  const movementDate = jakartaDateString(now);
  const movementTime = jakartaHHMM(now);
  const notes = input.notes?.trim() || null;

  const rows = input.lines.map((l) => ({
    bank_account_id: input.bankAccountId,
    product_id: l.productId,
    // Aggregate mode: paksa variant_id=null — sama seperti versi single.
    variant_id: byId.get(l.productId)?.stock_aggregate_variants
      ? null
      : l.variantId ?? null,
    type: input.type,
    qty: l.qty,
    notes,
    // CHECK di DB menolak alasan pada baris produksi — paksa null di sini
    // supaya caller yang salah kirim tidak menggagalkan seluruh batch.
    withdrawal_reason:
      input.type === "withdrawal" && isWithdrawalReason(l.reason)
        ? l.reason
        : null,
    movement_date: movementDate,
    movement_time: movementTime,
    created_by: gate.userId,
  }));

  const { data, error } = await supabase
    .from("pos_stock_movements")
    .insert(rows)
    .select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true, data: { count: data?.length ?? rows.length } };
}

/**
 * Daftar authorizer per operasi untuk satu rekening. Halaman POS
 * meneruskannya ke StockMovementDialog / StockOpnameForm supaya mereka
 * tahu perlu-tidaknya membuka modal PIN dan nama siapa yang disebut.
 *
 * Digerbang (audit 2026-08): daftar ini berisi nama karyawan, dan
 * membacanya lewat service-role di `listOperationAuthorizers` berarti
 * RLS tidak lagi menyaring. Array kosong untuk caller yang tidak berhak,
 * mengikuti konvensi baca POS lain di file ini.
 */
export async function getPosAuthorizers(
  bankAccountId: string
): Promise<PosAuthorizerMap> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return emptyPosAuthorizerMap();
  return listOperationAuthorizers(bankAccountId);
}

/**
 * Hard-delete a single produksi/penarikan entry. Stock balance is the
 * sum of movements + last opname, so removing an entry simply rolls
 * its qty out of the running tally — no soft-delete needed.
 */
export async function deleteStockMovement(input: {
  bankAccountId: string;
  movementId: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_stock_movements")
    .delete()
    .eq("id", input.movementId)
    .eq("bank_account_id", input.bankAccountId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true, data: { id: input.movementId } };
}

export type OpnameDiscrepancyKind = "shortfall" | "surplus";

export interface OpnameDiscrepancyResult {
  kind: OpnameDiscrepancyKind;
  /** Total nilai Rp shortfall (untuk kind="shortfall"). Surplus
   *  return 0 — kami tidak reveal nominal supaya tidak silently
   *  menutupi error produksi yang belum tercatat. */
  shortfallValue: number;
}

export async function createStockOpname(input: {
  bankAccountId: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string | null;
    physicalCount: number;
  }>;
  /** Authorizer's PIN. Required when rekening has `opname_authorizer_id` set. */
  pin?: string;
  /**
   * Opname di dalam buka/tutup shift: kasir shift (yang PIN-nya diverifikasi di sini) otomatis berhak
   * mengopname — tidak harus authorizer opname. Menggantikan `pin` di atas. Dicatat di `performed_by`.
   */
  shiftCashier?: { userId: string; pin: string };
  /** Set true setelah admin/kasir konfirmasi modal discrepancy.
   *  Tanpa flag ini, opname dengan selisih akan ditolak supaya
   *  kasir tidak sembarangan commit selisih. */
  allowDiscrepancy?: boolean;
  /** Set true bersama allowDiscrepancy untuk shortfall — insert
   *  cashflow_transactions di rekening Cash sale (credit =
   *  shortfallValue, category Penyesuaian) sebagai pembayaran
   *  selisih oleh kasir. */
  payShortfallCash?: boolean;
}): Promise<
  ActionResult<{
    opnameId?: string;
    discrepancy?: OpnameDiscrepancyResult;
  }>
> {
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (input.items.length === 0)
    return { ok: false, error: "Minimal satu SKU harus diisi" };
  for (const it of input.items) {
    if (!Number.isInteger(it.physicalCount) || it.physicalCount < 0)
      return { ok: false, error: "Jumlah fisik harus bilangan bulat ≥ 0" };
  }
  let performedBy: string | null = null;
  if (input.shiftCashier) {
    const cashier = await verifyShiftCashier(
      createAdminClient(),
      input.bankAccountId,
      input.shiftCashier.userId,
      input.shiftCashier.pin
    );
    if (!cashier.ok) return { ok: false, error: cashier.error };
    performedBy = input.shiftCashier.userId;
  } else {
    const auth = await verifyOperationPin(input.bankAccountId, "opname", input.pin);
    if (!auth.ok) return { ok: false, error: auth.error };
  }

  const supabase = await createClient();

  // Resolve snapshot name + price dari katalog saat ini.
  const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
  const variantIds = Array.from(
    new Set(input.items.map((i) => i.variantId).filter((v): v is string => !!v))
  );
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .from("pos_products")
      .select(
        "id, bank_account_id, name, price, stock_aggregate_variants, created_at"
      )
      .in("id", productIds),
    variantIds.length
      ? supabase
          .from("pos_product_variants")
          .select("id, product_id, name, price, created_at")
          .in("id", variantIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            product_id: string;
            name: string;
            price: number;
            created_at: string;
          }>,
        }),
  ]);
  const pById = new Map((products ?? []).map((p) => [p.id, p]));
  const vById = new Map((variants ?? []).map((v) => [v.id, v]));

  // Validasi: semua produk belong ke rekening yang tepat.
  for (const it of input.items) {
    const p = pById.get(it.productId);
    if (!p) return { ok: false, error: `Produk tidak ditemukan: ${it.productId}` };
    if (p.bank_account_id !== input.bankAccountId)
      return { ok: false, error: "Produk bukan milik rekening ini" };
    if (it.variantId) {
      const v = vById.get(it.variantId);
      if (!v || v.product_id !== it.productId)
        return { ok: false, error: "Varian tidak cocok dengan produk" };
    }
  }

  // Compute expected per SKU pakai cut-off = now.
  const skus: Sku[] = input.items.map((it) => {
    const p = pById.get(it.productId)!;
    const v = it.variantId ? vById.get(it.variantId) ?? null : null;
    return {
      productId: it.productId,
      variantId: it.variantId ?? null,
      productName: p.name,
      variantName: v?.name ?? null,
      unitPrice: Number(v ? v.price : p.price),
      // Tidak dipakai computeExpectedCounts, tapi bagian dari kontrak Sku
      // — metrik Service Level memakainya untuk membatasi awal hidup SKU.
      createdAt: v && v.created_at > p.created_at ? v.created_at : p.created_at,
    };
  });
  // Aggregate-mode set — dibutuhkan baseline (collapse baris legacy
  // ber-variant_id, lihat loadBaselineAt) SEBELUM di-load, bukan sesudah.
  const aggregateProductIds = new Set(
    (products ?? []).filter((p) => p.stock_aggregate_variants).map((p) => p.id)
  );
  const baseline = await loadBaseline(supabase, input.bankAccountId, aggregateProductIds);
  const now = new Date();
  const nowIso = now.toISOString();
  const expected = await computeExpectedCounts(
    supabase,
    input.bankAccountId,
    baseline.cutoffIso,
    nowIso,
    skus,
    baseline.baseline,
    aggregateProductIds
  );

  // Hitung selisih per SKU. Surplus = phisik > expected (mungkin
  // produksi belum tercatat). Shortfall = fisik < expected (loss /
  // ada hilang). Modal client menampilkan ringkasan minimal.
  let shortfallValue = 0;
  let hasSurplus = false;
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const sku = skus[i];
    const exp = expected.get(skuKey(it.productId, it.variantId ?? null)) ?? 0;
    const diff = it.physicalCount - exp;
    if (diff < 0) shortfallValue += -diff * sku.unitPrice;
    else if (diff > 0) hasSurplus = true;
  }

  // Surplus jangan tutupi error produksi — paksa kasir hitung ulang
  // tanpa opsi bayar. Tidak reveal nilai supaya admin tidak bisa
  // back-compute expected count.
  if (hasSurplus && !input.allowDiscrepancy) {
    // ok:true + discrepancy supaya klien bisa render modal khusus;
    // bukan error karena ini gate-konfirmasi, bukan kegagalan.
    return {
      ok: true,
      data: { discrepancy: { kind: "surplus", shortfallValue: 0 } },
    };
  }

  // Shortfall → blok submit kecuali user explicit konfirmasi via
  // modal "Bayar selisih" / "Hitung ulang".
  if (shortfallValue > 0 && !input.allowDiscrepancy) {
    return {
      ok: true,
      data: { discrepancy: { kind: "shortfall", shortfallValue } },
    };
  }

  // Insert header.
  const { data: header, error: headErr } = await supabase
    .from("pos_stock_opnames")
    .insert({
      bank_account_id: input.bankAccountId,
      opname_date: jakartaDateString(now),
      opname_time: jakartaHHMM(now),
      notes: input.notes?.trim() || null,
      created_by: gate.userId,
      performed_by: performedBy,
    })
    .select("id")
    .single();
  if (headErr || !header) return { ok: false, error: headErr?.message ?? "Gagal" };

  // Insert items.
  const itemRows = input.items.map((it, i) => {
    const sku = skus[i];
    return {
      opname_id: header.id,
      product_id: it.productId,
      variant_id: it.variantId ?? null,
      product_name_snapshot: sku.productName,
      variant_name_snapshot: sku.variantName,
      unit_price_snapshot: sku.unitPrice,
      physical_count: it.physicalCount,
      expected_count: expected.get(skuKey(it.productId, it.variantId ?? null)) ?? 0,
    };
  });
  const { error: itemErr } = await supabase
    .from("pos_stock_opname_items")
    .insert(itemRows);
  if (itemErr) {
    // Best-effort rollback supaya header tidak orphan.
    await supabase.from("pos_stock_opnames").delete().eq("id", header.id);
    return { ok: false, error: itemErr.message };
  }

  // Bayar selisih cash: insert cashflow_transactions credit di
  // rekening sale (yang biasanya rekening cash POS) supaya saldo
  // kas fisik bertambah sesuai uang yang kasir setor. Category
  // "Penyesuaian" — standar untuk koreksi cash drawer.
  if (input.payShortfallCash && shortfallValue > 0) {
    const opnameDate = jakartaDateString(now);
    const opnameTime = jakartaHHMM(now);
    const [yStr, mStr] = opnameDate.split("-");
    const periodYear = Number(yStr);
    const periodMonth = Number(mStr);

    const { data: account } = await supabase
      .from("bank_accounts")
      .select("default_branch, ledger_account_id")
      .eq("id", input.bankAccountId)
      .single();
    // Rekening POS Mamaya membukukan ke buku rekening induknya (Semarang).
    const ledgerAccountId = account?.ledger_account_id ?? input.bankAccountId;

    const { data: existingStmt } = await supabase
      .from("cashflow_statements")
      .select("id")
      .eq("bank_account_id", ledgerAccountId)
      .eq("period_year", periodYear)
      .eq("period_month", periodMonth)
      .maybeSingle();
    let statementId: string;
    if (existingStmt) {
      statementId = existingStmt.id;
    } else {
      const { data: newStmt } = await supabase
        .from("cashflow_statements")
        .insert({
          bank_account_id: ledgerAccountId,
          period_month: periodMonth,
          period_year: periodYear,
          opening_balance: 0,
          closing_balance: 0,
          status: "draft",
          created_by: gate.userId,
        })
        .select("id")
        .single();
      statementId = newStmt?.id ?? "";
    }

    if (statementId) {
      const { data: maxRow } = await supabase
        .from("cashflow_transactions")
        .select("sort_order")
        .eq("statement_id", statementId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

      await supabase.from("cashflow_transactions").insert({
        statement_id: statementId,
        transaction_date: opnameDate,
        transaction_time: opnameTime,
        description: `POS Opname Selisih: bayar selisih Rp ${shortfallValue.toLocaleString("id-ID")}`,
        debit: 0,
        credit: shortfallValue,
        running_balance: null,
        category: "Penyesuaian",
        branch: account?.default_branch ?? "Pare",
        sort_order: nextSortOrder,
      });
    }
  }

  revalidatePath("/pos", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { opnameId: header.id } };
}

export interface OpnameFormSku {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
}

/** Daftar SKU aktif untuk form opname (blind — tidak expose on-hand). */
export async function listOpnameFormSkus(
  bankAccountId: string
): Promise<OpnameFormSku[]> {
  const supabase = await createClient();
  const { skus } = await listActiveSkus(supabase, bankAccountId);
  return skus;
}

export interface ExcludedStockProduct {
  productId: string;
  productName: string;
}

/** Produk yang di-exclude dari perhitungan stok (track_stock=false). */
export async function listExcludedStockProducts(
  bankAccountId: string
): Promise<ExcludedStockProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_products")
    .select("id, name")
    .eq("bank_account_id", bankAccountId)
    .eq("active", true)
    .eq("track_stock", false)
    .order("name", { ascending: true });
  return (data ?? []).map((p) => ({ productId: p.id, productName: p.name }));
}

/**
 * Toggle apakah produk dihitung di sistem stok. Saat di-exclude (track=false),
 * semua jejak stok produk tsb (opname_items + stock_movements) dihapus supaya
 * tidak muncul lagi di history — user secara eksplisit bilang tidak mau hitung.
 * Restore (track=true) tidak mengembalikan data yang sudah di-purge.
 */
export async function setProductStockTracking(input: {
  productId: string;
  track: boolean;
}): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("pos_products")
    .select("id, bank_account_id")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Produk tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(product.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!input.track) {
    await supabase
      .from("pos_stock_opname_items")
      .delete()
      .eq("product_id", input.productId);
    await supabase
      .from("pos_stock_movements")
      .delete()
      .eq("product_id", input.productId)
      .eq("bank_account_id", product.bank_account_id);
  }

  const { error } = await supabase
    .from("pos_products")
    .update({ track_stock: input.track })
    .eq("id", input.productId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true, data: undefined };
}

/**
 * Toggle mode aggregate-variants untuk produk. Saat diaktifkan (Croissant
 * plain di produksi, varian di penjualan):
 * - Movement lama yang punya variant_id di-collapse di compute (variant_id
 *   tetap tersimpan untuk audit, tapi masuk bucket level-produk).
 * - Opname lama yang per-varian sudah immutable, baseline tetap — tapi
 *   opname berikutnya akan di-SKU level-produk.
 * Flip off mengembalikan perilaku per-varian tanpa menyentuh data lama.
 */
export async function setProductStockAggregateVariants(input: {
  productId: string;
  aggregate: boolean;
}): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("pos_products")
    .select("id, bank_account_id")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Produk tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(product.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await supabase
    .from("pos_products")
    .update({ stock_aggregate_variants: input.aggregate })
    .eq("id", input.productId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos", "layout");
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────
//  Pantauan tab — point-in-time readiness snapshot + day-over-day series
// ─────────────────────────────────────────────────────────────────────

export interface StockReadinessRow {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  qty: number;
  ready: boolean;
}

export interface StockReadinessSnapshot {
  /** Echoed back — bisa di-clamp kalau caller pass masa depan. */
  atIso: string;
  rows: StockReadinessRow[];
  counts: { ready: number; habis: number; total: number };
}

export interface StockReadinessSeriesPoint {
  /** YYYY-MM-DD WIB. */
  date: string;
  /** ISO timestamp jam yang dipilih pada tanggal tsb. null = di masa
   *  depan (jam X belum lewat untuk tanggal hari ini). */
  atIso: string | null;
  /** null = hari di masa depan. */
  ready: number | null;
  total: number;
}

export interface StockReadinessSeries {
  hourLocal: number;
  series: StockReadinessSeriesPoint[];
}

/**
 * Internal: hitung snapshot setelah `listActiveSkus` di-hoist oleh
 * caller. Dipakai oleh `getStockReadinessAtTime` (single point) dan
 * `getStockReadinessSeries` (parallel per-hari dengan SKU set yang
 * sama). Tidak melakukan gate — caller wajib gate sendiri.
 */
async function readinessAtInternal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankAccountId: string,
  atIso: string,
  skus: Sku[],
  aggregateProductIds: Set<string>
): Promise<StockReadinessSnapshot> {
  const baseline = await loadBaselineAt(supabase, bankAccountId, atIso, aggregateProductIds);
  const expected = await computeExpectedCounts(
    supabase,
    bankAccountId,
    baseline.cutoffIso,
    atIso,
    skus,
    baseline.baseline,
    aggregateProductIds
  );
  const rows: StockReadinessRow[] = skus.map((s) => {
    const qty = expected.get(skuKey(s.productId, s.variantId)) ?? 0;
    return {
      productId: s.productId,
      variantId: s.variantId,
      productName: s.productName,
      variantName: s.variantName,
      qty,
      ready: qty > 0,
    };
  });
  const ready = rows.reduce((n, r) => n + (r.ready ? 1 : 0), 0);
  return {
    atIso,
    rows,
    counts: { ready, habis: rows.length - ready, total: rows.length },
  };
}

/**
 * Snapshot SKU ready/habis pada satu titik waktu. Mirror On-hand tab,
 * tapi `untilIso` arbitrary (bisa historis). Caller pass `atIso` di
 * UTC ISO; server clamp ke now kalau masa depan.
 */
export async function getStockReadinessAtTime(
  bankAccountId: string,
  atIso: string
): Promise<ActionResult<StockReadinessSnapshot>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const clampedIso = atIso > nowIso ? nowIso : atIso;

  const { skus, aggregateProductIds } = await listActiveSkus(
    supabase,
    bankAccountId
  );
  const snap = await readinessAtInternal(
    supabase,
    bankAccountId,
    clampedIso,
    skus,
    aggregateProductIds
  );
  return { ok: true, data: snap };
}

/**
 * Day-over-day series: untuk satu jam WIB tertentu, hitung jumlah SKU
 * ready pada N hari ke belakang (termasuk hari ini).
 *
 * Sweep-nya tinggal di `@/lib/pos/stock-engine`: satu muatan event
 * berpaginasi (`loadStockEventStream`) lalu satu lintasan maju
 * (`sampleReadiness`). Sebelumnya logika itu ditulis inline di sini dan
 * memindai ulang seluruh array delta untuk SETIAP titik — plus query-nya
 * tanpa paginasi sehingga terpotong diam-diam di 1000 baris.
 */
export async function getStockReadinessSeries(
  bankAccountId: string,
  hourLocal: number,
  days: number
): Promise<ActionResult<StockReadinessSeries>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const hour = Math.max(0, Math.min(23, Math.floor(hourLocal)));
  const span = Math.max(1, Math.min(30, Math.floor(days)));
  const today = jakartaDateString(new Date());
  const nowIso = new Date().toISOString();

  // Grid menaik; titik di masa depan dikeluarkan dari sampling tapi
  // tetap muncul di seri dengan ready=null supaya sumbu-X tak berlubang.
  const items = Array.from({ length: span }, (_, i) => {
    const date = jakartaDateMinusDays(today, span - 1 - i);
    const atIso = jakartaHourIso(date, hour);
    return { date, atIso, future: atIso > nowIso };
  });
  const past = items.filter((it) => !it.future);
  const latestAtIso = past.length > 0 ? past[past.length - 1].atIso : nowIso;

  // Jangkar ke opname terakhir sebelum titik paling awal — tanpa ini
  // seluruh riwayat rekening ikut termuat.
  const earliestAtIso = past.length > 0 ? past[0].atIso : latestAtIso;
  const anchor = await loadBaselineAt(supabase, bankAccountId, earliestAtIso);
  const stream = await loadStockEventStream(supabase, bankAccountId, {
    anchorIso: anchor.cutoffIso,
    toIso: latestAtIso,
  });
  const { samples } = sampleReadiness(
    stream,
    past.map((it) => it.atIso)
  );
  const readyByIso = new Map(samples.map((s) => [s.atIso, s.ready]));
  const total = stream.skuKeys.length;

  const points: StockReadinessSeriesPoint[] = items.map((it) =>
    it.future
      ? { date: it.date, atIso: null, ready: null, total }
      : {
          date: it.date,
          atIso: it.atIso,
          ready: readyByIso.get(it.atIso) ?? 0,
          total,
        }
  );
  return { ok: true, data: { hourLocal: hour, series: points } };
}
