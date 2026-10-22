"use server";

/**
 * Nota belanja Pengadaan & Pengeluaran.
 *
 * Satu nota = satu foto + beberapa baris (bahan baku atau pengeluaran lain). Setiap baris menulis SATU baris buku
 * kas (kategori laporan keuangan, foto nota terlampir, `drawer_neutral` karena uangnya dibawa tim pengadaan,
 * bukan uang laci); baris bahan baku juga menulis barang masuk (`costing_material_receipts`) dan memperbarui
 * harga acuan bahan dengan rata-rata tertimbang. Penyimpanan atomik: gagal di tengah jalan → semua dibatalkan.
 *
 * Semua tulis lewat service-role di balik gate `requireProcurementForBu` — `business_unit` tidak pernah
 * dipercaya dari payload untuk bahan (diverifikasi terhadap master bahan di server).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import {
  requireAdmin,
  requireAdminOrPosAssignee,
  requireProcurementForBu,
  type ActionResult,
} from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { findOpenShift } from "@/lib/pos/shift-data";
import { posAccountFilterForCostingBrand } from "@/lib/costing/brands";
import { num } from "@/lib/costing/rows";
import { fetchUnitsMap } from "@/lib/costing/rows";
import { loadBrandProcurement } from "@/lib/procurement/rows";
import { EXPENSE_CATEGORY_VALUES } from "@/lib/procurement/categories";
import {
  convertQty,
  needsPriceReview,
  priceDeviation,
  unitChoices,
  unitPriceUsage,
  weightedAveragePurchasePrice,
} from "@/lib/procurement/purchase-math";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

type Admin = ReturnType<typeof createAdminClient>;

const TMP_BUCKET = "cash-closing-photos";
const RECEIPT_BUCKET = "cashflow-receipts";
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const RECEIPT_MAX = 5 * 1024 * 1024;
const MAX_LINES = 40;
/** Boleh mencatat nota susulan paling lama sekian hari ke belakang. */
const MAX_BACKDATE_DAYS = 7;
const round2 = (n: number) => Math.round(n * 100) / 100;

function revalidateAll() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
  revalidatePath("/admin/finance", "layout");
}

/** Rekening kas Haengbocake untuk brand costing ("Haengbocake Pare" → Cash Haengbocake Pare). */
async function resolveCashAccount(
  admin: Admin,
  businessUnit: string
): Promise<{ id: string; branch: string | null } | null> {
  const f = posAccountFilterForCostingBrand(businessUnit);
  let q = admin
    .from("bank_accounts")
    .select("id, default_branch")
    .eq("business_unit", f.businessUnit)
    .eq("bank", "cash");
  if (f.branch) q = q.eq("default_branch", f.branch);
  const { data } = await q.limit(1).maybeSingle();
  return data ? { id: data.id, branch: data.default_branch ?? f.branch ?? null } : null;
}

export type MoneySource = "pengadaan" | "laci";

/** Akses seseorang ke form nota di satu cabang. */
interface PurchaseAuth {
  userId: string;
  isAdmin: boolean;
  /** Petugas pengadaan cabang ini (atau admin): boleh uang pengadaan + bahan baku. */
  isStaff: boolean;
  acct: { id: string; branch: string | null };
  /** Shift yang sedang terbuka di cabang ini (null = tidak ada). */
  shift: { id: string; cashierName: string; openedAt: string } | null;
}

/**
 * Siapa boleh apa:
 *  - uang PENGADAAN : hanya petugas pengadaan cabang itu (atau admin);
 *  - uang LACI      : harus ada shift terbuka; boleh petugas pengadaan ATAU asisten POS cabang itu
 *                     (akun kasir) — pengeluaran laci mengurangi kas laci, jadi hanya saat shift berjalan.
 */
async function authorizePurchaseAccess(
  businessUnit: string
): Promise<{ ok: true; auth: PurchaseAuth } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient();
  const acct = await resolveCashAccount(admin, businessUnit);
  if (!acct) return { ok: false, error: "Rekening kas cabang ini tidak ditemukan" };
  const staff = await requireProcurementForBu(businessUnit);
  let isStaff = staff.ok;
  const isAdmin = staff.ok && staff.isAdmin;
  if (!isStaff) {
    const pos = await requireAdminOrPosAssignee(acct.id);
    if (!pos.ok) return { ok: false, error: "Forbidden" };
    isStaff = false;
  }
  const shift = await findOpenShift(admin, acct.id);
  return {
    ok: true,
    auth: {
      userId: user.id,
      isAdmin,
      isStaff,
      acct,
      shift: shift ? { id: shift.id, cashierName: shift.cashierName, openedAt: shift.openedAt } : null,
    },
  };
}

/** Cabang Haengbocake (brand costing) tempat akun ini asisten POS — boleh mencatat pengeluaran uang laci. */
export async function getMyDrawerExpenseBrands(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: asg } = await admin
    .from("bank_account_assignees")
    .select("bank_account_id, scope")
    .eq("user_id", user.id)
    .in("scope", ["full", "pos_only"]);
  const ids = [...new Set((asg ?? []).map((a) => a.bank_account_id))];
  if (ids.length === 0) return [];
  const { data: accts } = await admin
    .from("bank_accounts")
    .select("default_branch")
    .in("id", ids)
    .eq("business_unit", "Haengbocake")
    .eq("bank", "cash");
  const brands = (accts ?? [])
    .map((a) => a.default_branch)
    .filter((b): b is string => b === "Pare" || b === "Semarang")
    .map((b) => `Haengbocake ${b}`);
  return [...new Set(brands)];
}

// ─────────────────────────────────────────────────────────────────────
//  Data untuk form
// ─────────────────────────────────────────────────────────────────────

export interface PurchaseMaterialOption {
  id: string;
  name: string;
  category: string | null;
  purchaseUnit: string;
  purchasePrice: number;
  contentPerPurchase: number;
  usageUnit: string;
  /** Diajukan petugas, belum ditinjau admin. */
  pending: boolean;
  /** Satuan yang boleh diketik untuk bahan ini. */
  unitChoices: string[];
}

export interface PurchaseFormData {
  businessUnit: string;
  materials: PurchaseMaterialOption[];
  /** Toko/supplier yang pernah dipakai, terbaru dulu — untuk isian cepat. */
  vendors: string[];
  /** Satuan pakai yang boleh dipilih saat mengajukan bahan baru. */
  usageUnits: { code: string; label: string }[];
  /** Sumber uang yang boleh dipakai pengguna ini di cabang ini. */
  access: {
    pengadaan: boolean;
    laci: boolean;
    /** Alasan "uang laci" belum bisa dipakai (mis. tidak ada shift terbuka). */
    laciReason: string | null;
    /** Kasir shift yang sedang berjalan (untuk keterangan). */
    shiftCashier: string | null;
    /** Petugas non-pengadaan: hanya pengeluaran lain (tanpa bahan baku). */
    lainOnly: boolean;
  };
}

export async function getPurchaseFormData(businessUnit: string): Promise<ActionResult<PurchaseFormData>> {
  const access = await authorizePurchaseAccess(businessUnit);
  if (!access.ok) return { ok: false, error: access.error };
  const { auth } = access;
  const admin = createAdminClient();
  const accessInfo: PurchaseFormData["access"] = {
    pengadaan: auth.isStaff,
    laci: auth.shift != null,
    laciReason: auth.shift ? null : "Tidak ada shift yang terbuka di cabang ini",
    shiftCashier: auth.shift?.cashierName ?? null,
    lainOnly: !auth.isStaff,
  };
  // Petugas non-pengadaan (akun kasir): tanpa master bahan / harga acuan — hanya pengeluaran laci.
  if (!auth.isStaff) {
    return {
      ok: true,
      data: {
        businessUnit,
        materials: [],
        vendors: [],
        usageUnits: [],
        access: accessInfo,
      },
    };
  }
  const [{ data: mats }, units, { data: vend }] = await Promise.all([
    admin
      .from("costing_materials" as never)
      .select("id, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, review_status")
      .eq("business_unit", businessUnit)
      .eq("is_active", true)
      .order("name"),
    fetchUnitsMap(admin),
    admin
      .from("procurement_purchases" as never)
      .select("vendor")
      .eq("business_unit", businessUnit)
      .not("vendor", "is", null)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  const materials = ((mats ?? []) as Record<string, unknown>[]).map((r) => {
    const m = {
      purchaseUnit: r.purchase_unit as string,
      contentPerPurchase: num(r.content_per_purchase),
      usageUnit: r.usage_unit as string,
    };
    return {
      id: r.id as string,
      name: r.name as string,
      category: (r.category as string | null) ?? null,
      purchaseUnit: m.purchaseUnit,
      purchasePrice: num(r.purchase_price),
      contentPerPurchase: m.contentPerPurchase,
      usageUnit: m.usageUnit,
      pending: r.review_status === "pending",
      unitChoices: unitChoices(m, units),
    } satisfies PurchaseMaterialOption;
  });
  const vendors = [
    ...new Set(((vend ?? []) as Record<string, unknown>[]).map((v) => String(v.vendor ?? "").trim()).filter(Boolean)),
  ].slice(0, 12);
  return {
    ok: true,
    data: {
      businessUnit,
      materials,
      vendors,
      usageUnits: [
        { code: "gram", label: "gram" },
        { code: "ml", label: "ml" },
        { code: "pcs", label: "pcs" },
      ],
      access: accessInfo,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Foto nota + bahan baru
// ─────────────────────────────────────────────────────────────────────

/** Unggah foto nota ke bucket sementara; dipindah ke lampiran buku kas saat nota disimpan. */
export async function uploadPurchaseReceipt(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const businessUnit = formData.get("businessUnit");
  const file = formData.get("file");
  if (typeof businessUnit !== "string" || !businessUnit) return { ok: false, error: "Unit bisnis wajib" };
  if (!(file instanceof File)) return { ok: false, error: "File wajib" };
  const access = await authorizePurchaseAccess(businessUnit);
  if (!access.ok) return { ok: false, error: access.error };
  const gate = { userId: access.auth.userId };
  if (!RECEIPT_TYPES.includes(file.type)) return { ok: false, error: "Foto harus JPG, PNG, atau WEBP" };
  if (file.size > RECEIPT_MAX) return { ok: false, error: "Foto maksimal 5 MB" };
  const admin = createAdminClient();
  const acct = access.auth.acct;
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${acct.id}/purchase-tmp/${gate.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await admin.storage.from(TMP_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { path } };
}

export async function discardPurchaseReceipt(input: { businessUnit: string; path: string }): Promise<ActionResult> {
  const access = await authorizePurchaseAccess(input.businessUnit);
  if (!access.ok) return { ok: false, error: access.error };
  const gate = { userId: access.auth.userId };
  if (input.path.includes("..") || !input.path.startsWith(`${access.auth.acct.id}/purchase-tmp/${gate.userId}-`))
    return { ok: false, error: "Berkas bukan milikmu" };
  await createAdminClient().storage.from(TMP_BUCKET).remove([input.path]);
  return { ok: true };
}

/**
 * Ajukan bahan baru dari form belanja. Langsung bisa dipakai di nota, berstatus `pending` sampai admin
 * meninjau (merapikan nama/satuan/susut) — sebelum itu jangan dipakai di resep. Nama kembar (tanpa
 * memandang huruf besar/kecil) di brand yang sama mengembalikan bahan yang sudah ada.
 */
export async function proposeMaterial(input: {
  businessUnit: string;
  name: string;
  purchaseUnit: string;
  contentPerPurchase: number;
  usageUnit: string;
  purchasePrice: number;
}): Promise<ActionResult<{ id: string; existed: boolean }>> {
  const gate = await requireProcurementForBu(input.businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const name = input.name.trim().replace(/\s+/g, " ");
  const purchaseUnit = input.purchaseUnit.trim();
  const usageUnit = input.usageUnit.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Nama bahan 2–80 huruf" };
  if (!purchaseUnit || purchaseUnit.length > 20) return { ok: false, error: "Satuan beli wajib (mis. sak, dus, pack)" };
  if (!["gram", "ml", "pcs"].includes(usageUnit)) return { ok: false, error: "Satuan pakai harus gram, ml, atau pcs" };
  if (!(input.contentPerPurchase > 0)) return { ok: false, error: "Isi per satuan beli harus > 0" };
  if (!(input.purchasePrice > 0)) return { ok: false, error: "Harga beli harus > 0" };

  const admin = createAdminClient();
  const { data: dup } = await admin
    .from("costing_materials" as never)
    .select("id")
    .eq("business_unit", input.businessUnit)
    // % dan _ pada nama bukan wildcard: di-escape supaya "tepung_" tidak cocok dengan "tepung terigu".
    .ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle();
  if (dup) return { ok: true, data: { id: (dup as { id: string }).id, existed: true } };

  const { data, error } = await admin
    .from("costing_materials" as never)
    .insert({
      business_unit: input.businessUnit,
      name,
      category: null,
      purchase_unit: purchaseUnit,
      purchase_price: round2(input.purchasePrice),
      content_per_purchase: input.contentPerPurchase,
      usage_unit: usageUnit,
      review_status: "pending",
      proposed_by: gate.userId,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal mengajukan bahan" };
  revalidateAll();
  return { ok: true, data: { id: (data as { id: string }).id, existed: false } };
}

// ─────────────────────────────────────────────────────────────────────
//  Simpan nota
// ─────────────────────────────────────────────────────────────────────

export type PurchaseLineInput =
  | { kind: "bahan"; materialId: string; qty: number; unit: string; total: number }
  | { kind: "lain"; category: string; description: string; total: number };

export interface CreatePurchaseInput {
  businessUnit: string;
  /** Kunci idempotensi dari klien (UUID): kirim ulang karena timeout/klik ganda tidak membuat nota kembar. */
  clientId?: string;
  /** Wajib dipilih eksplisit: dari mana uangnya. */
  moneySource: MoneySource;
  receiptPath: string;
  purchaseDate?: string;
  vendor?: string | null;
  notes?: string | null;
  lines: PurchaseLineInput[];
}

interface Created {
  txIds: string[];
  txFiles: string[];
  receiptIds: string[];
  filePaths: string[];
}

export async function createPurchase(
  input: CreatePurchaseInput
): Promise<ActionResult<{ id: string; total: number; flagged: number }>> {
  if (input.moneySource !== "pengadaan" && input.moneySource !== "laci")
    return { ok: false, error: "Pilih sumber uangnya dulu" };
  const access = await authorizePurchaseAccess(input.businessUnit);
  if (!access.ok) return { ok: false, error: access.error };
  const { auth } = access;
  const gate = { userId: auth.userId };
  if (input.moneySource === "pengadaan" && !auth.isStaff) return { ok: false, error: "Forbidden" };
  if (input.moneySource === "laci" && !auth.shift)
    return {
      ok: false,
      error: "Tidak ada shift yang terbuka — uang laci hanya dicatat saat shift berjalan",
    };
  if (!auth.isStaff && input.lines.some((l) => l.kind === "bahan"))
    return { ok: false, error: "Bahan baku dicatat oleh petugas pengadaan" };
  if (!Array.isArray(input.lines) || input.lines.length === 0) return { ok: false, error: "Isi minimal satu baris" };
  if (input.lines.length > MAX_LINES) return { ok: false, error: `Maksimal ${MAX_LINES} baris per nota` };

  const admin = createAdminClient();
  const acct = auth.acct;
  if (
    !input.receiptPath ||
    input.receiptPath.includes("..") ||
    !input.receiptPath.startsWith(`${acct.id}/purchase-tmp/${gate.userId}-`)
  ) {
    return { ok: false, error: "Foto nota wajib — ambil foto notanya dulu" };
  }

  const now = new Date();
  const today = jakartaDateString(now);
  const date = input.purchaseDate || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Tanggal tidak valid" };
  if (date > today) return { ok: false, error: "Tanggal nota tidak boleh di masa depan" };
  // Uang laci selalu "hari ini": kas laci dihitung dari saat dicatat (shift berjalan). Nota susulan dengan tanggal
  // kemarin akan terhitung di hitungan shift hari ini dan memunculkan selisih palsu.
  if (input.moneySource === "laci" && date !== today)
    return { ok: false, error: "Pengeluaran uang laci hanya bisa dicatat untuk hari ini" };
  const oldest = jakartaDateString(new Date(now.getTime() - MAX_BACKDATE_DAYS * 86_400_000));
  if (date < oldest) return { ok: false, error: `Nota susulan maksimal ${MAX_BACKDATE_DAYS} hari ke belakang` };

  // Validasi + hitung ulang tiap baris di server.
  const units = await fetchUnitsMap(admin);
  const matIds = [...new Set(input.lines.flatMap((l) => (l.kind === "bahan" ? [l.materialId] : [])))];
  const matById = new Map<string, Record<string, unknown>>();
  if (matIds.length > 0) {
    const { data: mats } = await admin
      .from("costing_materials" as never)
      .select("id, business_unit, name, purchase_unit, purchase_price, content_per_purchase, usage_unit, is_active, review_status, shopee_url")
      .in("id", matIds);
    for (const m of (mats ?? []) as Record<string, unknown>[]) matById.set(m.id as string, m);
  }
  const procRows = matIds.length
    ? new Map(
        (await loadBrandProcurement(admin, { businessUnit: input.businessUnit, includeUntracked: true })).rows.map((r) => [
          r.material.id,
          r,
        ])
      )
    : new Map();

  interface Calc {
    sort: number;
    kind: "bahan" | "lain";
    category: string;
    description: string;
    total: number;
    materialId: string | null;
    qtyInput: number | null;
    unitInput: string | null;
    qtyPurchase: number | null;
    qtyUsage: number | null;
    unitPriceUsage: number | null;
    mat: Record<string, unknown> | null;
    qtyLabel: string | null;
  }
  const calcs: Calc[] = [];
  let sort = 0;
  for (const l of input.lines) {
    const total = round2(Number(l.total));
    if (!Number.isFinite(total) || total <= 0) return { ok: false, error: "Total tiap baris harus > 0" };
    if (total > 500_000_000) return { ok: false, error: "Nominal terlalu besar — periksa lagi" };
    if (l.kind === "lain") {
      if (!EXPENSE_CATEGORY_VALUES.includes(l.category)) return { ok: false, error: "Kategori tidak dikenal" };
      const description = l.description.trim();
      if (description.length < 2 || description.length > 120) return { ok: false, error: "Keterangan 2–120 huruf" };
      calcs.push({
        sort: sort++,
        kind: "lain",
        category: l.category,
        description,
        total,
        materialId: null,
        qtyInput: null,
        unitInput: null,
        qtyPurchase: null,
        qtyUsage: null,
        unitPriceUsage: null,
        mat: null,
        qtyLabel: null,
      });
    } else {
      const mat = matById.get(l.materialId);
      // Bahan dari brand lain diperlakukan sama dengan "tidak ada" — jangan jadi oracle.
      if (!mat || mat.business_unit !== input.businessUnit || mat.is_active !== true)
        return { ok: false, error: "Ada bahan yang tidak valid untuk cabang ini" };
      const mu = {
        purchaseUnit: mat.purchase_unit as string,
        contentPerPurchase: num(mat.content_per_purchase),
        usageUnit: mat.usage_unit as string,
      };
      const conv = convertQty(Number(l.qty), l.unit, mu, units);
      if (!conv) return { ok: false, error: `Jumlah/satuan "${mat.name}" tidak bisa dikonversi` };
      calcs.push({
        sort: sort++,
        kind: "bahan",
        category: "Cost of Goods Sold",
        description: `Beli ${mat.name} ${Number(l.qty).toLocaleString("id-ID")} ${l.unit}`,
        total,
        materialId: l.materialId,
        qtyInput: Number(l.qty),
        unitInput: l.unit,
        qtyPurchase: conv.qtyPurchaseUnits,
        qtyUsage: conv.qtyUsageUnits,
        unitPriceUsage: unitPriceUsage(total, conv.qtyUsageUnits),
        mat,
        qtyLabel: `${Number(l.qty).toLocaleString("id-ID")} ${l.unit}`,
      });
    }
  }
  const grandTotal = round2(calcs.reduce((s, c) => s + c.total, 0));

  // ── Tulis ──
  const created: Created = { txIds: [], txFiles: [], receiptIds: [], filePaths: [] };
  const priceUndo: { materialId: string; before: number; after: number; priceUpdatedAt: string }[] = [];
  const clientId = input.clientId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.clientId) ? input.clientId : null;
  if (clientId) {
    const { data: existing } = await admin
      .from("procurement_purchases" as never)
      .select("id, total, created_by")
      .eq("id", clientId)
      .maybeSingle();
    const ex = existing as { id: string; total: number | string; created_by: string | null } | null;
    // Sudah tersimpan (percobaan sebelumnya berhasil): jawab sukses, jangan menulis ulang.
    if (ex && ex.created_by === gate.userId) return { ok: true, data: { id: ex.id, total: num(ex.total), flagged: 0 } };
    if (ex) return { ok: false, error: "Nota dengan kode ini sudah ada" };
  }
  const purchaseId = clientId ?? crypto.randomUUID();
  const rollback = async () => {
    for (const u of priceUndo.reverse()) {
      await admin
        .from("costing_materials" as never)
        .update({ purchase_price: u.before, price_updated_at: u.priceUpdatedAt } as never)
        .eq("id", u.materialId);
    }
    if (created.receiptIds.length) await admin.from("costing_material_receipts" as never).delete().in("id", created.receiptIds);
    if (created.txIds.length) await admin.from("cashflow_transactions").delete().in("id", created.txIds);
    await admin.from("procurement_purchases" as never).delete().eq("id", purchaseId);
    const files = [...created.txFiles, ...created.filePaths];
    if (files.length) await admin.storage.from(RECEIPT_BUCKET).remove(files);
  };

  const { data: blob, error: dlErr } = await admin.storage.from(TMP_BUCKET).download(input.receiptPath);
  if (dlErr || !blob) return { ok: false, error: "Foto nota tidak ditemukan — ambil ulang fotonya" };
  const bytes = Buffer.from(await blob.arrayBuffer());
  const ext = input.receiptPath.split(".").pop() ?? "jpg";
  const contentType = blob.type || "image/jpeg";
  const upload = async (path: string) =>
    admin.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType, upsert: true });

  const mainPath = `${acct.id}/purchase-${purchaseId}/${Date.now()}.${ext}`;
  const up0 = await upload(mainPath);
  if (up0.error) return { ok: false, error: up0.error.message };
  created.filePaths.push(mainPath);

  const { error: hErr } = await admin.from("procurement_purchases" as never).insert({
    id: purchaseId,
    business_unit: input.businessUnit,
    bank_account_id: acct.id,
    purchase_date: date,
    purchase_time: jakartaHHMM(now),
    vendor: input.vendor?.trim() || null,
    total: grandTotal,
    receipt_path: mainPath,
    notes: input.notes?.trim() || null,
    money_source: input.moneySource,
    created_by: gate.userId,
  } as never);
  if (hErr) {
    await rollback();
    return { ok: false, error: hErr.message };
  }

  // Statement kas bulan nota.
  const [y, m] = date.split("-").map(Number);
  const { data: stmt } = await admin
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", acct.id)
    .eq("period_year", y)
    .eq("period_month", m)
    .maybeSingle();
  let statementId = stmt?.id ?? null;
  if (!statementId) {
    const { data: ns, error } = await admin
      .from("cashflow_statements")
      .insert({
        bank_account_id: acct.id,
        period_month: m,
        period_year: y,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: gate.userId,
      })
      .select("id")
      .single();
    if (error || !ns) {
      await rollback();
      return { ok: false, error: error?.message ?? "Gagal membuat statement kas" };
    }
    statementId = ns.id;
  }
  const { data: maxRow } = await admin
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let txSort = (maxRow?.sort_order ?? -1) + 1;

  // Shift bisa ditutup sejak form dibuka: uang laci hanya sah selama shift yang sama masih berjalan.
  if (input.moneySource === "laci") {
    const nowShift = await findOpenShift(admin, acct.id);
    if (!nowShift || nowShift.id !== auth.shift?.id) {
      await rollback();
      return { ok: false, error: "Shift sudah ditutup — uang laci tidak bisa dicatat lagi. Pakai uang pengadaan atau minta owner." };
    }
  }

  const { data: me } = await admin.from("profiles").select("full_name, nickname").eq("id", gate.userId).maybeSingle();
  const actor = me?.nickname || me?.full_name || "petugas pengadaan";
  const vendorLabel = input.vendor?.trim() ? ` · ${input.vendor.trim()}` : "";

  // Tahan harga per bahan di memori supaya beberapa baris bahan yang sama saling menyambung.
  const runningPrice = new Map<string, number>();
  const runningStock = new Map<string, number | null>();
  let flagged = 0;

  for (const c of calcs) {
    const { data: tx, error: txErr } = await admin
      .from("cashflow_transactions")
      .insert({
        statement_id: statementId,
        transaction_date: date,
        transaction_time: jakartaHHMM(now),
        description: `${c.description}${vendorLabel}`,
        notes:
          input.moneySource === "laci"
            ? `Pengeluaran uang laci · dicatat ${actor}${auth.shift ? ` · kasir shift ${auth.shift.cashierName}` : ""} — nota terlampir`
            : `Nota pengadaan · dicatat ${actor} — nota terlampir`,
        debit: c.total,
        credit: 0,
        running_balance: null,
        category: c.category,
        branch: acct.branch,
        sort_order: txSort++,
        // Uang pengadaan dibawa tim pengadaan (tidak menyentuh laci); uang laci mengurangi kas laci shift ini.
        drawer_neutral: input.moneySource === "pengadaan",
      })
      .select("id")
      .single();
    if (txErr || !tx) {
      await rollback();
      return { ok: false, error: txErr?.message ?? "Gagal mencatat ke buku kas" };
    }
    created.txIds.push(tx.id);
    const txFile = `${acct.id}/${tx.id}-${Date.now()}.${ext}`;
    const up = await upload(txFile);
    if (up.error) {
      await rollback();
      return { ok: false, error: up.error.message };
    }
    created.txFiles.push(txFile);
    const { error: attErr } = await admin.from("cashflow_transactions").update({ attachment_path: txFile }).eq("id", tx.id);
    if (attErr) {
      await rollback();
      return { ok: false, error: attErr.message };
    }

    let receiptId: string | null = null;
    let refBefore: number | null = null;
    let refAfter: number | null = null;
    let flag: "ok" | "tinjau" = "ok";

    if (c.kind === "bahan" && c.mat && c.materialId && c.qtyPurchase && c.qtyUsage) {
      const content = num(c.mat.content_per_purchase);
      const paidPerPurchase = c.total / c.qtyPurchase;
      const ref = runningPrice.get(c.materialId) ?? num(c.mat.purchase_price);
      const pending = c.mat.review_status === "pending";
      const dev = pending ? null : priceDeviation(c.unitPriceUsage ?? 0, ref / content);
      const stock = runningStock.has(c.materialId)
        ? runningStock.get(c.materialId)!
        : (procRows.get(c.materialId)?.metrics.onHand ?? null);

      refBefore = round2(ref);
      if (needsPriceReview(dev)) {
        flag = "tinjau";
        flagged++;
        refAfter = refBefore; // harga acuan tidak diubah otomatis
      } else {
        refAfter = round2(
          pending
            ? paidPerPurchase
            : weightedAveragePurchasePrice({
                stockUsage: stock,
                contentPerPurchase: content,
                refPricePerPurchase: ref,
                boughtPurchaseUnits: c.qtyPurchase,
                paidPerPurchaseUnit: paidPerPurchase,
              })
        );
      }
      runningPrice.set(c.materialId, refAfter);
      runningStock.set(c.materialId, (stock ?? 0) + c.qtyUsage);

      const { data: rec, error: recErr } = await admin
        .from("costing_material_receipts" as never)
        .insert({
          business_unit: input.businessUnit,
          material_id: c.materialId,
          qty_purchase_units: c.qtyPurchase,
          content_per_purchase_snapshot: content,
          qty_usage_units: c.qtyUsage,
          unit_price_paid: round2(paidPerPurchase),
          total_paid: c.total,
          supplier: input.vendor?.trim() || null,
          purchase_url_snapshot: (c.mat.shopee_url as string | null) ?? null,
          receipt_date: date,
          receipt_time: jakartaHHMM(now),
          notes: "Dari nota belanja pengadaan",
          created_by: gate.userId,
        } as never)
        .select("id")
        .single();
      if (recErr || !rec) {
        await rollback();
        return { ok: false, error: recErr?.message ?? "Gagal mencatat barang masuk" };
      }
      receiptId = (rec as { id: string }).id;
      created.receiptIds.push(receiptId);
    }

    const { data: line, error: lineErr } = await admin
      .from("procurement_purchase_lines" as never)
      .insert({
        purchase_id: purchaseId,
        sort_order: c.sort,
        kind: c.kind,
        material_id: c.materialId,
        qty_input: c.qtyInput,
        unit_input: c.unitInput,
        qty_purchase_units: c.qtyPurchase,
        qty_usage_units: c.qtyUsage,
        unit_price_usage: c.unitPriceUsage,
        total: c.total,
        category: c.category,
        description: c.description,
        cashflow_transaction_id: tx.id,
        receipt_id: receiptId,
        ref_price_before: refBefore,
        ref_price_after: refAfter,
        price_flag: flag,
      } as never)
      .select("id")
      .single();
    if (lineErr || !line) {
      await rollback();
      return { ok: false, error: lineErr?.message ?? "Gagal menyimpan baris nota" };
    }
    if (receiptId) {
      const { error: linkErr } = await admin
        .from("costing_material_receipts" as never)
        .update({ purchase_line_id: (line as { id: string }).id } as never)
        .eq("id", receiptId);
      if (linkErr) {
        await rollback();
        return { ok: false, error: linkErr.message };
      }
    }
  }

  // Harga acuan baru diterapkan TERAKHIR (setelah semua tulis berhasil) — satu perubahan per bahan.
  for (const [materialId, finalPrice] of runningPrice) {
    const mat = matById.get(materialId)!;
    const before = round2(num(mat.purchase_price));
    if (finalPrice === before) continue;
    const priceUpdatedAt = new Date().toISOString();
    const { error } = await admin
      .from("costing_materials" as never)
      .update({ purchase_price: finalPrice, price_updated_at: priceUpdatedAt } as never)
      .eq("id", materialId);
    if (error) {
      await rollback();
      return { ok: false, error: error.message };
    }
    priceUndo.push({ materialId, before, after: finalPrice, priceUpdatedAt: String(mat.price_updated_at ?? priceUpdatedAt) });
    await admin.from("costing_material_price_history" as never).insert({
      material_id: materialId,
      purchase_price: finalPrice,
      content_per_purchase: num(mat.content_per_purchase),
      created_by: gate.userId,
    } as never);
  }

  await admin.storage.from(TMP_BUCKET).remove([input.receiptPath]);
  revalidateAll();
  return { ok: true, data: { id: purchaseId, total: grandTotal, flagged } };
}

// ─────────────────────────────────────────────────────────────────────
//  Riwayat & ringkasan
// ─────────────────────────────────────────────────────────────────────

export interface PurchaseLineView {
  id: string;
  kind: "bahan" | "lain";
  description: string;
  category: string;
  total: number;
  materialName: string | null;
  qtyLabel: string | null;
  /** Rp per satuan pakai yang dibayar. */
  unitPriceUsage: number | null;
  usageUnit: string | null;
  priceFlag: "ok" | "tinjau";
  /** Selisih relatif vs harga acuan saat dibeli (+0,2 = 20% lebih mahal). */
  deviation: number | null;
}

export interface PurchaseView {
  id: string;
  businessUnit: string;
  purchaseDate: string;
  purchaseTime: string | null;
  vendor: string | null;
  total: number;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  receiptUrl: string | null;
  canDelete: boolean;
  moneySource: MoneySource;
  lines: PurchaseLineView[];
}

/** `businessUnit` null = semua cabang (hanya admin). */
export async function listPurchases(
  businessUnit: string | null,
  opts: { from?: string; to?: string; limit?: number } = {}
): Promise<ActionResult<PurchaseView[]>> {
  let isAdmin = false;
  let userId = "";
  if (businessUnit) {
    const gate = await requireProcurementForBu(businessUnit);
    if (!gate.ok) return { ok: false, error: gate.error };
    isAdmin = gate.isAdmin;
    userId = gate.userId;
  } else {
    const gate = await requireAdmin();
    if (!gate.ok) return { ok: false, error: gate.error };
    isAdmin = true;
    userId = gate.userId;
  }
  const admin = createAdminClient();
  let q = admin
    .from("procurement_purchases" as never)
    .select("id, business_unit, purchase_date, purchase_time, vendor, total, notes, receipt_path, created_by, created_at, money_source")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 40, 200));
  if (businessUnit) q = q.eq("business_unit", businessUnit);
  if (opts.from) q = q.gte("purchase_date", opts.from);
  if (opts.to) q = q.lte("purchase_date", opts.to);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const heads = (data ?? []) as Record<string, unknown>[];
  if (heads.length === 0) return { ok: true, data: [] };

  const ids = heads.map((h) => h.id as string);
  const { data: lineRows } = await admin
    .from("procurement_purchase_lines" as never)
    .select("*")
    .in("purchase_id", ids)
    .order("sort_order");
  const lines = (lineRows ?? []) as Record<string, unknown>[];
  const matIds = [...new Set(lines.map((l) => l.material_id as string | null).filter((v): v is string => !!v))];
  const matInfo = new Map<string, { name: string; usageUnit: string; content: number }>();
  if (matIds.length) {
    const { data: mats } = await admin
      .from("costing_materials" as never)
      .select("id, name, usage_unit, content_per_purchase")
      .in("id", matIds);
    for (const m of (mats ?? []) as Record<string, unknown>[])
      matInfo.set(m.id as string, { name: m.name as string, usageUnit: m.usage_unit as string, content: num(m.content_per_purchase) });
  }
  const userIds = [...new Set(heads.map((h) => h.created_by as string | null).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: ps } = await admin.from("profiles").select("id, full_name, nickname").in("id", userIds);
    for (const p of ps ?? []) names.set(p.id, p.nickname || p.full_name || "—");
  }
  const urls = new Map<string, string>();
  const { data: signed } = await admin.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrls(heads.map((h) => h.receipt_path as string), 3600);
  for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);

  const today = jakartaDateString(new Date());
  const byPurchase = new Map<string, PurchaseLineView[]>();
  for (const l of lines) {
    const info = l.material_id ? matInfo.get(l.material_id as string) : undefined;
    const qtyLabel =
      l.qty_input != null && l.unit_input ? `${num(l.qty_input).toLocaleString("id-ID")} ${l.unit_input}` : null;
    const refBefore = l.ref_price_before == null ? null : num(l.ref_price_before);
    const dev =
      refBefore != null && info && l.unit_price_usage != null
        ? priceDeviation(num(l.unit_price_usage), refBefore / info.content)
        : null;
    const view: PurchaseLineView = {
      id: l.id as string,
      kind: l.kind as "bahan" | "lain",
      description: l.description as string,
      category: l.category as string,
      total: num(l.total),
      materialName: info?.name ?? null,
      qtyLabel,
      unitPriceUsage: l.unit_price_usage == null ? null : num(l.unit_price_usage),
      usageUnit: info?.usageUnit ?? null,
      priceFlag: (l.price_flag as "ok" | "tinjau") ?? "ok",
      deviation: dev,
    };
    const arr = byPurchase.get(l.purchase_id as string) ?? [];
    arr.push(view);
    byPurchase.set(l.purchase_id as string, arr);
  }

  return {
    ok: true,
    data: heads.map((h) => {
      const createdBy = (h.created_by as string | null) ?? null;
      const sameDay = jakartaDateString(new Date(h.created_at as string)) === today;
      return {
        id: h.id as string,
        businessUnit: h.business_unit as string,
        purchaseDate: h.purchase_date as string,
        purchaseTime: (h.purchase_time as string | null) ?? null,
        vendor: (h.vendor as string | null) ?? null,
        total: num(h.total),
        notes: (h.notes as string | null) ?? null,
        createdByName: createdBy ? names.get(createdBy) ?? null : null,
        createdAt: h.created_at as string,
        receiptUrl: urls.get(h.receipt_path as string) ?? null,
        canDelete: isAdmin || (createdBy === userId && sameDay),
        moneySource: (h.money_source as MoneySource) === "laci" ? "laci" : "pengadaan",
        lines: byPurchase.get(h.id as string) ?? [],
      };
    }),
  };
}

export interface PurchaseSummary {
  from: string;
  to: string;
  noteCount: number;
  total: number;
  byCategory: { category: string; total: number }[];
  flaggedLines: number;
}

/** Ringkasan rentang tanggal untuk header riwayat / monitoring. `businessUnit` null = semua (admin). */
export async function getPurchaseSummary(
  businessUnit: string | null,
  from: string,
  to: string
): Promise<ActionResult<PurchaseSummary>> {
  if (businessUnit) {
    const gate = await requireProcurementForBu(businessUnit);
    if (!gate.ok) return { ok: false, error: gate.error };
  } else {
    const gate = await requireAdmin();
    if (!gate.ok) return { ok: false, error: gate.error };
  }
  const admin = createAdminClient();
  let q = admin
    .from("procurement_purchases" as never)
    .select("id, total")
    .gte("purchase_date", from)
    .lte("purchase_date", to)
    .limit(2000);
  if (businessUnit) q = q.eq("business_unit", businessUnit);
  const { data: heads } = await q;
  const hs = (heads ?? []) as Record<string, unknown>[];
  if (hs.length === 0)
    return { ok: true, data: { from, to, noteCount: 0, total: 0, byCategory: [], flaggedLines: 0 } };
  const { data: lines } = await admin
    .from("procurement_purchase_lines" as never)
    .select("category, total, price_flag")
    .in("purchase_id", hs.map((h) => h.id as string))
    .limit(10000);
  const cat = new Map<string, number>();
  let flagged = 0;
  for (const l of (lines ?? []) as Record<string, unknown>[]) {
    cat.set(l.category as string, (cat.get(l.category as string) ?? 0) + num(l.total));
    if (l.price_flag === "tinjau") flagged++;
  }
  return {
    ok: true,
    data: {
      from,
      to,
      noteCount: hs.length,
      total: round2(hs.reduce((s, h) => s + num(h.total), 0)),
      byCategory: [...cat.entries()].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total),
      flaggedLines: flagged,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Hapus nota
// ─────────────────────────────────────────────────────────────────────

/**
 * Hapus nota beserta baris buku kas, barang masuk, dan fotonya. Petugas hanya bisa menghapus notanya sendiri di
 * hari yang sama; admin kapan saja. Harga acuan bahan dikembalikan HANYA bila belum berubah lagi sejak nota ini.
 */
export async function deletePurchase(id: string): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: head } = await admin
    .from("procurement_purchases" as never)
    .select("id, business_unit, created_by, created_at, receipt_path, money_source")
    .eq("id", id)
    .maybeSingle();
  const h = head as Record<string, unknown> | null;
  if (!h) return { ok: false, error: "Nota tidak ditemukan" };
  const access = await authorizePurchaseAccess(h.business_unit as string);
  if (!access.ok) return { ok: false, error: access.error };
  const gate = { userId: access.auth.userId, isAdmin: access.auth.isAdmin };
  if (!gate.isAdmin) {
    if (h.created_by !== gate.userId) return { ok: false, error: "Hanya pencatatnya yang bisa menghapus" };
    if (jakartaDateString(new Date(h.created_at as string)) !== jakartaDateString(new Date()))
      return { ok: false, error: "Hanya bisa dihapus di hari yang sama — minta owner untuk koreksi" };
    // Nota uang laci mengubah hitungan kas shift: hanya bisa dihapus selama shift yang sama masih berjalan.
    if (h.money_source === "laci") {
      const sh = access.auth.shift;
      if (!sh || new Date(h.created_at as string).getTime() < new Date(sh.openedAt).getTime())
        return { ok: false, error: "Nota uang laci hanya bisa dihapus selama shift-nya masih berjalan — minta owner untuk koreksi" };
    }
  }

  const { data: lineRows } = await admin
    .from("procurement_purchase_lines" as never)
    .select("*")
    .eq("purchase_id", id)
    .order("sort_order", { ascending: false });
  const lines = (lineRows ?? []) as Record<string, unknown>[];

  const txIds = lines.map((l) => l.cashflow_transaction_id as string | null).filter((v): v is string => !!v);
  const files: string[] = [h.receipt_path as string];
  if (txIds.length) {
    const { data: txs } = await admin.from("cashflow_transactions").select("attachment_path").in("id", txIds);
    for (const t of txs ?? []) if (t.attachment_path) files.push(t.attachment_path);
  }
  // Barang masuk ikut terhapus lewat ON DELETE CASCADE dari baris nota; ledger dihapus eksplisit.
  if (txIds.length) {
    const { error } = await admin.from("cashflow_transactions").delete().in("id", txIds);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await admin.from("procurement_purchases" as never).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  // Kembalikan harga acuan (urutan terbalik) bila belum bergeser lagi — SETELAH penghapusan berhasil, supaya
  // kegagalan hapus tidak meninggalkan harga yang sudah dikembalikan sementara nota masih ada.
  for (const l of lines) {
    if (!l.material_id || l.ref_price_before == null || l.ref_price_after == null) continue;
    if (round2(num(l.ref_price_before)) === round2(num(l.ref_price_after))) continue;
    const { data: mat } = await admin
      .from("costing_materials" as never)
      .select("purchase_price, content_per_purchase")
      .eq("id", l.material_id as string)
      .maybeSingle();
    const mrow = mat as Record<string, unknown> | null;
    if (mrow && round2(num(mrow.purchase_price)) === round2(num(l.ref_price_after))) {
      await admin
        .from("costing_materials" as never)
        .update({ purchase_price: num(l.ref_price_before), price_updated_at: new Date().toISOString() } as never)
        .eq("id", l.material_id as string);
      await admin.from("costing_material_price_history" as never).insert({
        material_id: l.material_id,
        purchase_price: num(l.ref_price_before),
        content_per_purchase: num(mrow.content_per_purchase),
        created_by: gate.userId,
      } as never);
    }
  }

  await admin.storage.from(RECEIPT_BUCKET).remove(files);
  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Tinjauan admin
// ─────────────────────────────────────────────────────────────────────

export interface PendingMaterialRow {
  id: string;
  businessUnit: string;
  name: string;
  purchaseUnit: string;
  contentPerPurchase: number;
  usageUnit: string;
  purchasePrice: number;
  proposedByName: string | null;
  createdAt: string;
}

export async function listPendingMaterials(): Promise<ActionResult<PendingMaterialRow[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("costing_materials" as never)
    .select("id, business_unit, name, purchase_unit, content_per_purchase, usage_unit, purchase_price, proposed_by, created_at")
    .eq("review_status", "pending")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.proposed_by as string | null).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await admin.from("profiles").select("id, full_name, nickname").in("id", ids);
    for (const p of ps ?? []) names.set(p.id, p.nickname || p.full_name || "—");
  }
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id as string,
      businessUnit: r.business_unit as string,
      name: r.name as string,
      purchaseUnit: r.purchase_unit as string,
      contentPerPurchase: num(r.content_per_purchase),
      usageUnit: r.usage_unit as string,
      purchasePrice: num(r.purchase_price),
      proposedByName: r.proposed_by ? names.get(r.proposed_by as string) ?? null : null,
      createdAt: r.created_at as string,
    })),
  };
}

export async function approveMaterial(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { error } = await createAdminClient()
    .from("costing_materials" as never)
    .update({ review_status: "approved" } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

/** Admin menyetujui harga baris yang ditandai "tinjau": harga acuan = harga yang dibayar, tanda dibersihkan. */
export async function acceptFlaggedPrice(lineId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  const { data: line } = await admin
    .from("procurement_purchase_lines" as never)
    .select("id, material_id, qty_purchase_units, total, price_flag")
    .eq("id", lineId)
    .maybeSingle();
  const l = line as Record<string, unknown> | null;
  if (!l || l.price_flag !== "tinjau" || !l.material_id) return { ok: false, error: "Baris tidak perlu ditinjau" };
  if (!(num(l.qty_purchase_units) > 0)) return { ok: false, error: "Jumlah baris tidak valid" };
  const paidPerPurchase = round2(num(l.total) / num(l.qty_purchase_units));
  const { data: mat } = await admin
    .from("costing_materials" as never)
    .select("content_per_purchase")
    .eq("id", l.material_id as string)
    .maybeSingle();
  const { error } = await admin
    .from("costing_materials" as never)
    .update({ purchase_price: paidPerPurchase, price_updated_at: new Date().toISOString() } as never)
    .eq("id", l.material_id as string);
  if (error) return { ok: false, error: error.message };
  await admin.from("costing_material_price_history" as never).insert({
    material_id: l.material_id,
    purchase_price: paidPerPurchase,
    content_per_purchase: num((mat as Record<string, unknown> | null)?.content_per_purchase),
    created_by: gate.userId,
  } as never);
  await admin
    .from("procurement_purchase_lines" as never)
    .update({ price_flag: "ok", ref_price_after: paidPerPurchase } as never)
    .eq("id", lineId);
  revalidateAll();
  return { ok: true };
}

/** Admin menolak harga baris: tanda dibersihkan, harga acuan dibiarkan (mis. salah ketik nominal). */
export async function dismissFlaggedPrice(lineId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { error } = await createAdminClient()
    .from("procurement_purchase_lines" as never)
    .update({ price_flag: "ok" } as never)
    .eq("id", lineId);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}
