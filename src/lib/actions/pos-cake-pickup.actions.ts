"use server";

/**
 * Pengambilan custom cake ditandai kasir POS cabang.
 *
 * Kenapa ada: yang tahu kue benar-benar diserahkan adalah orang yang
 * berhadapan dengan customer. Sebelumnya yang menandai justru staf cake
 * yang tinggal di kota lain, dan itu sumber miskom yang berulang.
 *
 * Board staf sudah tidak bisa menandai pickup — lihat tiga lapis kunci
 * di `CakeOrdersBoard` (tombol + drag) dan `setCakeOrderStatus` (server).
 *
 * OTORISASI. Kasir POS TIDAK punya `cake_access_assignments`, jadi RLS
 * `cake_orders` (SELECT butuh baris itu) menolaknya dan
 * `requireCakeOrderAccess` juga menolaknya. Modul ini karena itu
 * memakai service-role SETELAH `requireAdminOrPosAssignee` — pola yang
 * sama dengan `pos-pesanan.actions.ts`.
 *
 * Yang tidak biasa dan disengaja: `markCakePickedUpAtPos` TIDAK
 * menerima `bankAccountId` dari klien. Cabang diambil dari baris
 * order → dipetakan ke akun POS cabang itu → baru digerbang. Dengan
 * begitu klien tidak pernah bisa menunjuk akun mana yang diperiksa,
 * sehingga kasir Semarang mustahil menutup order Pare — bukan karena
 * ada perbandingan yang bisa keliru, tapi karena secara konstruksi
 * tidak ada jalannya.
 *
 * CATATAN: `requireAdminOrPosAssignee` meloloskan `role='admin'`,
 * padahal `requireCakeOrderAccess` sengaja menolak admin. Jadi lewat
 * jalur ini admin BISA menandai pengambilan — satu-satunya tulis cake
 * yang bisa ia lakukan. Ini pilihan sadar (admin berdiri di kasir itu
 * skenario nyata), bukan kelalaian.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { requireAdminOrPosAssignee } from "@/lib/actions/_gates";
import { insertCakePaymentLeg } from "@/lib/cake-orders/payment-write";
import { summarizeCakePayment } from "@/lib/cake-orders/payment-summary";
import { CAKE_SETTLEMENT_CASH_CATEGORY } from "@/lib/cashflow/categories";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";
import type { CakeBranch } from "@/lib/cake-orders/types";
// Tipe tinggal di modul terpisah — file ini "use server", dan repo ini
// pernah kehilangan build gara-gara export tipe dari file semacam itu.
import type {
  CakePickupOrder,
  MarkPickupInput,
} from "@/lib/pos/cake-pickup-types";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** `bank_accounts.default_branch` ("Pare") → `cake_orders.branch` ("pare"). */
function posBranchToCakeBranch(v: string | null): CakeBranch | null {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "pare") return "pare";
  if (s === "semarang") return "semarang";
  return null;
}

/** `cake_orders.branch` ("pare") → `bank_accounts.default_branch` ("Pare"). */
function cakeBranchToPosBranch(b: CakeBranch): string {
  return b === "pare" ? "Pare" : "Semarang";
}

/**
 * Metode pembayaran yang boleh diterima kasir saat serah-terima.
 * Bank Jago sengaja TIDAK termasuk — transfer bank tidak terjadi di
 * konter dan pencatatannya tetap lewat staf cake.
 */
function classifyPaymentMethod(label: string): "cash" | "qris" | null {
  const s = label.trim().toLowerCase();
  if (s.includes("qris")) return "qris";
  if (s.includes("cash") || s.includes("tunai")) return "cash";
  return null;
}

type OrderRow = {
  id: string;
  branch: string;
  customer_name: string;
  customer_phone: string | null;
  scheduled_at: string;
  base_cake_option_id: string | null;
  shape_option_id: string | null;
  shape_custom: string | null;
  dimension_cm: number | null;
  filling_option_id: string | null;
  greeting_card: string | null;
  total_idr: number;
  paid_idr: number;
  refund_idr: number;
  free_claim: boolean;
  delivery_option_id: string | null;
  status: string;
  picked_up_at: string | null;
};

type OptionRow = {
  id: string;
  kind: string;
  label: string;
  needs_address: boolean;
};

/** Semua opsi (termasuk yang non-aktif) — order lama bisa menunjuk
 *  opsi yang sudah dinonaktifkan, dan itu tetap harus resolve. */
async function loadOptions(
  db: ReturnType<typeof createAdminClient>
): Promise<OptionRow[]> {
  const { data } = await db
    .from("cake_options" as never)
    .select("id, kind, label, needs_address");
  return (data ?? []) as unknown as OptionRow[];
}

/**
 * Kue pickup yang siap diambil di cabang rekening POS ini.
 *
 * Mengikuti konvensi baca POS: gerbang gagal → array kosong, bukan
 * lempar error. Halaman tetap render, sekadar tanpa kartu.
 */
export async function listCakePickupsForPos(
  bankAccountId: string
): Promise<CakePickupOrder[]> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];

  const db = createAdminClient();

  const { data: accRaw } = await db
    .from("bank_accounts")
    .select("id, business_unit, default_branch, pos_enabled, is_active")
    .eq("id", bankAccountId)
    .maybeSingle();
  const acc = accRaw as unknown as {
    business_unit: string;
    default_branch: string | null;
    pos_enabled: boolean | null;
    is_active: boolean | null;
  } | null;
  if (!acc || acc.business_unit !== "Haengbocake") return [];
  if (!acc.pos_enabled || !acc.is_active) return [];
  const branch = posBranchToCakeBranch(acc.default_branch);
  if (!branch) return [];

  const options = await loadOptions(db);
  const pickupIds = options
    .filter((o) => o.kind === "delivery" && o.needs_address === false)
    .map((o) => o.id);
  if (pickupIds.length === 0) return [];
  const labelOf = (id: string | null) =>
    (id && options.find((o) => o.id === id)?.label) || null;

  const { data: rowsRaw } = await db
    .from("cake_orders" as never)
    .select(
      "id, branch, customer_name, customer_phone, scheduled_at, base_cake_option_id, shape_option_id, shape_custom, dimension_cm, filling_option_id, greeting_card, total_idr, paid_idr, refund_idr, free_claim, delivery_option_id, status, picked_up_at"
    )
    .eq("branch", branch)
    .eq("status", "ready")
    .is("archived_at", null)
    .in("delivery_option_id", pickupIds)
    .order("scheduled_at", { ascending: true });

  const rows = (rowsRaw ?? []) as unknown as OrderRow[];
  return rows.map((r) => {
    const pay = summarizeCakePayment({
      totalIdr: r.total_idr,
      netPaidIdr: r.paid_idr,
      refundIdr: r.refund_idr,
      freeClaim: r.free_claim,
    });
    return {
      id: r.id,
      branch: (r.branch as CakeBranch) ?? branch,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      scheduledAt: r.scheduled_at,
      baseLabel: labelOf(r.base_cake_option_id) ?? "—",
      shapeLabel: labelOf(r.shape_option_id) ?? "—",
      shapeCustom: r.shape_custom,
      dimensionCm: r.dimension_cm,
      fillingLabel: labelOf(r.filling_option_id),
      greetingCard: r.greeting_card,
      totalIdr: r.total_idr,
      netPaidIdr: r.paid_idr,
      refundIdr: r.refund_idr,
      remainingIdr: pay.remaining,
      paymentLabel: pay.label,
      paymentState: pay.state,
      freeClaim: r.free_claim,
      hasOutstanding: pay.hasOutstanding,
    };
  });
}

export async function markCakePickedUpAtPos(
  input: MarkPickupInput
): Promise<
  ActionResult<{
    orderId: string;
    recordedIdr: number;
    remainingIdr: number;
    /** true kalau perangkat lain sudah menandai lebih dulu. */
    alreadyPickedUp: boolean;
  }>
> {
  if (!input?.orderId) return { ok: false, error: "orderId wajib" };
  const db = createAdminClient();

  const { data: rowRaw } = await db
    .from("cake_orders" as never)
    .select(
      "id, branch, customer_name, status, archived_at, delivery_option_id, total_idr, paid_idr, refund_idr, free_claim, picked_up_at"
    )
    .eq("id", input.orderId)
    .maybeSingle();
  const order = rowRaw as unknown as OrderRow | null;
  if (!order) return { ok: false, error: "Pesanan tidak ditemukan" };

  const options = await loadOptions(db);
  const delivery = options.find((o) => o.id === order.delivery_option_id);
  if (!delivery || delivery.needs_address !== false) {
    return { ok: false, error: "Pesanan ini pengiriman, bukan pickup" };
  }

  const cakeBranch = posBranchToCakeBranch(order.branch);
  if (!cakeBranch) return { ok: false, error: "Cabang pesanan tidak dikenal" };

  // Akun POS diturunkan dari cabang order — BUKAN dari klien.
  const { data: accRaw } = await db
    .from("bank_accounts")
    .select("id, default_branch")
    .eq("business_unit", "Haengbocake")
    .eq("default_branch", cakeBranchToPosBranch(cakeBranch))
    .eq("pos_enabled", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const account = accRaw as unknown as { id: string; default_branch: string | null } | null;
  if (!account) {
    return { ok: false, error: "Rekening POS cabang ini belum disiapkan" };
  }

  const gate = await requireAdminOrPosAssignee(account.id);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Status: pesan spesifik supaya kasir tahu harus berbuat apa.
  if (order.picked_up_at) {
    return { ok: false, error: "Pesanan sudah ditandai diambil" };
  }
  if (order.status !== "ready") {
    if (order.status === "done")
      return { ok: false, error: "Pesanan sudah ditandai diambil" };
    if (order.status === "cancelled" || order.status === "discarded")
      return { ok: false, error: "Pesanan sudah dibatalkan" };
    return {
      ok: false,
      error: "Kue belum ditandai siap oleh bagian produksi",
    };
  }

  const before = summarizeCakePayment({
    totalIdr: order.total_idr,
    netPaidIdr: order.paid_idr,
    refundIdr: order.refund_idr,
    freeClaim: order.free_claim,
  });

  let recordedIdr = 0;
  let settleMethod: "cash" | "qris" | null = null;
  let paymentId: string | null = null;

  if (input.settlement) {
    const amount = Math.round(input.settlement.amountIdr || 0);
    if (amount <= 0) return { ok: false, error: "Nominal pelunasan harus > 0" };
    if (amount > before.remaining) {
      return {
        ok: false,
        error: `Nominal melebihi sisa tagihan Rp ${before.remaining.toLocaleString("id-ID")}`,
      };
    }
    const opt = options.find(
      (o) => o.id === input.settlement!.paymentOptionId && o.kind === "payment_method"
    );
    if (!opt) return { ok: false, error: "Metode pembayaran tidak valid" };
    settleMethod = classifyPaymentMethod(opt.label);
    if (!settleMethod) {
      return {
        ok: false,
        error: `Metode "${opt.label}" tidak bisa diterima di kasir — pakai QRIS atau Tunai`,
      };
    }
    recordedIdr = amount;
  }

  const remainingAfter = Math.max(0, before.remaining - recordedIdr);
  if (remainingAfter > 0 && !input.acknowledgeUnpaid) {
    return {
      ok: false,
      error: `Masih kurang Rp ${remainingAfter.toLocaleString("id-ID")} — centang konfirmasi dulu`,
    };
  }

  // Pembayaran DULU, status BELAKANGAN. Kalau status berhasil lalu
  // pembayaran gagal, uang riil hilang catatan. Urutan sebaliknya
  // jinak: pembayaran tercatat tapi status belum pindah, dan sync
  // berikutnya / kasir bisa mengulang tanpa kehilangan apa pun.
  if (input.settlement && recordedIdr > 0) {
    const res = await insertCakePaymentLeg(
      db,
      {
        orderId: order.id,
        kind: "pelunasan",
        amountIdr: recordedIdr,
        paymentOptionId: input.settlement.paymentOptionId,
        label: `Pelunasan (Kasir ${cakeBranchToPosBranch(cakeBranch)})`,
        notes: input.settlement.notes?.trim() || null,
      },
      gate.userId
    );
    if (!res.ok) return { ok: false, error: res.error };
    paymentId = res.paymentId;

    // Tunai masuk laci fisik → wajib tercatat di kas cabang, kalau
    // tidak tutup shift selalu selisih lebih. QRIS TIDAK menulis baris
    // kas: uangnya tidak pernah menyentuh laci. Asimetri ini disengaja.
    if (settleMethod === "cash") {
      const cashRes = await recordCakeCashSettlement({
        bankAccountId: account.id,
        branchLabel: account.default_branch ?? cakeBranchToPosBranch(cakeBranch),
        amountIdr: recordedIdr,
        customerName: order.customer_name,
        orderId: order.id,
        paymentId,
        userId: gate.userId,
      });
      if (!cashRes.ok) {
        // Pembayaran cake sudah tercatat; yang gagal cuma cermin
        // kasnya. Dilaporkan supaya bisa dibetulkan manual, TIDAK
        // di-rollback — menghapus leg pembayaran yang sah lebih
        // berbahaya daripada satu baris kas yang hilang.
        return {
          ok: false,
          error: `Pelunasan tercatat, tapi gagal menulis kas cabang: ${cashRes.error}. Catat manual di rekening kas.`,
        };
      }
    }
  }

  // Guard konkuren: dua tablet kasir bisa menekan bersamaan.
  const { data: updatedRaw } = await db
    .from("cake_orders" as never)
    .update({
      status: "done",
      picked_up_at: new Date().toISOString(),
      picked_up_by: gate.userId,
      picked_up_via: "pos",
    } as never)
    .eq("id", order.id)
    .eq("status", "ready")
    .is("picked_up_at", null)
    .select("id");
  const alreadyPickedUp = ((updatedRaw ?? []) as unknown[]).length === 0;

  revalidatePath("/pos", "layout");
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");

  return {
    ok: true,
    data: {
      orderId: order.id,
      recordedIdr,
      remainingIdr: remainingAfter,
      alreadyPickedUp,
    },
  };
}

/**
 * Cermin pelunasan tunai ke rekening kas cabang.
 *
 * Kategori non-operasional supaya TIDAK dobel di PnL (pendapatannya
 * sudah diakui lewat akrual cake dari scheduled_at), tapi
 * `custom_cake_included = true` supaya TETAP terhitung sebagai omset
 * custom cake untuk bonus admin. Dua sasaran itu lewat dua mekanisme
 * berbeda — jangan disatukan.
 *
 * Statement bulanan find-or-create: bulan yang ada pelunasan tapi
 * belum ada transaksi kas lain belum tentu punya statement.
 */
async function recordCakeCashSettlement(args: {
  bankAccountId: string;
  branchLabel: string;
  amountIdr: number;
  customerName: string;
  orderId: string;
  paymentId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const now = new Date();
  const date = jakartaDateString(now);
  const time = jakartaHHMM(now);
  const [yStr, mStr] = date.split("-");
  const periodYear = Number(yStr);
  const periodMonth = Number(mStr);

  const { data: existing } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", args.bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existing) {
    statementId = existing.id;
  } else {
    const { data: created, error: stmtErr } = await supabase
      .from("cashflow_statements")
      .insert({
        bank_account_id: args.bankAccountId,
        period_month: periodMonth,
        period_year: periodYear,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: args.userId,
      })
      .select("id")
      .single();
    if (stmtErr || !created)
      return { ok: false, error: stmtErr?.message ?? "gagal membuat statement" };
    statementId = created.id;
  }

  const { data: maxRow } = await supabase
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: txErr } = await supabase.from("cashflow_transactions").insert({
    statement_id: statementId,
    transaction_date: date,
    transaction_time: time,
    description: `Pelunasan cake — ${args.customerName}`,
    debit: 0,
    credit: args.amountIdr,
    running_balance: null,
    category: CAKE_SETTLEMENT_CASH_CATEGORY,
    branch: args.branchLabel,
    // Penanda telusur + idempotensi kalau nanti perlu rekonsiliasi.
    notes: `Pelunasan custom cake diterima kasir · cake:${args.orderId}:${args.paymentId}`,
    // Non-operasional (keluar dari PnL) TAPI tetap omset custom cake:
    // override ini yang memaksa masuk basis bonus, karena kategorinya
    // sendiri otomatis dikecualikan oleh isNonSalesCategory.
    custom_cake_included: true,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  });
  if (txErr) return { ok: false, error: txErr.message };

  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}
