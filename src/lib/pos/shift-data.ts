import "server-only";

/**
 * Sisi database untuk shift kasir POS (lihat shift-math.ts untuk aturan hitungannya). Modul server biasa,
 * BUKAN "use server": dipakai bersama oleh pos-shift.actions.ts, pos-stock.actions.ts (opname di dalam shift),
 * dan halaman POS (gerbang kunci).
 *
 * Semua query memakai service-role: tabel shift terkunci ke admin lewat RLS, dan kasir pos_only tidak boleh
 * membaca profil/PIN orang lain. Tiap pemanggil WAJIB sudah lolos `requireAdminOrPosAssignee` lebih dulu.
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";
import { verifyPin } from "@/lib/pos-pin";
import { isValidPinFormat } from "@/lib/pos-pin-format";
import { cashierDisplayName } from "@/lib/pos/cashier-schedule";
import { netCash, type CashMovement, type IncidentalReport } from "@/lib/pos/shift-math";

type Admin = ReturnType<typeof createAdminClient>;

export interface OpenShift {
  id: string;
  bankAccountId: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
}

export interface LastClosedShift {
  id: string;
  closedAt: string;
  /** null bila ditutup paksa (tanpa hitungan). */
  closeCashCounted: number | null;
  /** Uang yang diambil/disetor dari laci setelah hitungan tutup. */
  closeCashWithdrawn: number;
}

/** Ambil semua baris (lewati batas 1000 baris PostgREST) untuk query yang diurutkan stabil. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const SIZE = 1000;
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await page(from, from + SIZE - 1);
    // Galat BUKAN akhir data: potongan sebagian membuat kas seharusnya salah tanpa tanda apa pun.
    if (error) throw new Error("Gagal membaca data kas");
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < SIZE) break;
  }
  return out;
}

export async function loadShiftConfig(
  admin: Admin,
  bankAccountId: string
): Promise<{ enabled: boolean; branch: string | null; accountName: string } | null> {
  const { data } = await admin
    .from("bank_accounts")
    .select("shift_mode_enabled, default_branch, account_name")
    .eq("id", bankAccountId)
    .maybeSingle();
  if (!data) return null;
  return {
    enabled: data.shift_mode_enabled === true,
    branch: data.default_branch ?? null,
    accountName: data.account_name,
  };
}

async function namesByIds(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await admin.from("profiles").select("id, full_name, nickname").in("id", unique);
  for (const p of data ?? []) out.set(p.id, cashierDisplayName(p.nickname, p.full_name) ?? p.full_name ?? "Karyawan");
  return out;
}

export async function findOpenShift(admin: Admin, bankAccountId: string): Promise<OpenShift | null> {
  const { data } = await admin
    .from("pos_shifts")
    .select("id, bank_account_id, cashier_id, opened_at")
    .eq("bank_account_id", bankAccountId)
    .eq("status", "open")
    .maybeSingle();
  if (!data) return null;
  const names = await namesByIds(admin, [data.cashier_id]);
  return {
    id: data.id,
    bankAccountId: data.bank_account_id,
    cashierId: data.cashier_id,
    cashierName: names.get(data.cashier_id) ?? "Kasir",
    openedAt: data.opened_at,
  };
}

export async function lastClosedShift(admin: Admin, bankAccountId: string): Promise<LastClosedShift | null> {
  const { data } = await admin
    .from("pos_shifts")
    .select("id, closed_at, close_cash_counted, close_cash_withdrawn")
    .eq("bank_account_id", bankAccountId)
    .eq("status", "closed")
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.closed_at) return null;
  return {
    id: data.id,
    closedAt: data.closed_at,
    closeCashCounted: data.close_cash_counted === null ? null : Number(data.close_cash_counted),
    closeCashWithdrawn: Number(data.close_cash_withdrawn ?? 0),
  };
}

/**
 * Gerakan kas laci pada jendela (from, to] menurut ledger rekening kas (lihat shift-math.ts). Jendela diukur
 * dari `created_at` baris ledger (sama dengan tanggal transaksi: tidak ada pencatatan mundur di rekening ini).
 * `fromIso` null = dari awal.
 */
export async function cashMovementInWindow(
  admin: Admin,
  bankAccountId: string,
  fromIso: string | null,
  toIso: string
): Promise<CashMovement> {
  const { data: stmts, error: stmtErr } = await admin
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", bankAccountId);
  if (stmtErr) throw new Error("Gagal membaca data kas");
  const stmtIds = (stmts ?? []).map((st) => st.id);

  let credits = 0;
  let debits = 0;
  if (stmtIds.length > 0) {
    const rows = await fetchAll<{ id: string; credit: number; debit: number; category: string | null; drawer_neutral: boolean }>((a, b) => {
      let q = admin
        .from("cashflow_transactions")
        .select("id, credit, debit, category, drawer_neutral")
        .in("statement_id", stmtIds)
        .lte("created_at", toIso);
      if (fromIso) q = q.gt("created_at", fromIso);
      return q.order("id").range(a, b);
    });
    // Entri susulan (drawer_neutral) tidak menggerakkan laci saat dicatat — lihat migrasi 215.
    const candidates = rows.filter((r) => r.category !== POS_QRIS_CATEGORY && !r.drawer_neutral);
    // Pengeluaran bernota shift dicatat eksplisit di hitungan buka/tutup, jadi jangan dihitung dua kali.
    const shiftExpenseTx = new Set<string>();
    for (let i = 0; i < candidates.length; i += 200) {
      const { data, error: expErr } = await admin
        .from("pos_shift_expenses")
        .select("cashflow_transaction_id")
        .in("cashflow_transaction_id", candidates.slice(i, i + 200).map((r) => r.id));
      if (expErr) throw new Error("Gagal membaca data kas");
      for (const e of data ?? []) if (e.cashflow_transaction_id) shiftExpenseTx.add(e.cashflow_transaction_id);
    }
    for (const r of candidates) {
      if (shiftExpenseTx.has(r.id)) continue;
      credits += Number(r.credit);
      debits += Number(r.debit);
    }
  }

  let lateRefunds = 0;
  if (fromIso) {
    const refunded = await fetchAll<{ total: number }>((a, b) =>
      admin
        .from("pos_sales")
        .select("total")
        .eq("bank_account_id", bankAccountId)
        .eq("payment_status", "paid")
        .eq("settled_via", "cash")
        .not("voided_at", "is", null)
        .gt("voided_at", fromIso)
        .lte("voided_at", toIso)
        .lte("settled_at", fromIso)
        .order("id")
        .range(a, b)
    );
    lateRefunds = refunded.reduce((sum, r) => sum + Number(r.total), 0);
  }
  return { credits, debits, lateRefunds };
}

/**
 * Laporan transaksi di luar shift sejak `fromIso` (tutup shift terakhir). Tanpa `fromIso` (belum pernah ada
 * shift) tidak ada yang bisa dilaporkan: kembalikan laporan kosong.
 */
export async function buildIncidentalReport(
  admin: Admin,
  bankAccountId: string,
  fromIso: string | null,
  toIso: string
): Promise<IncidentalReport> {
  const empty: IncidentalReport = {
    from: fromIso,
    to: toIso,
    salesCount: 0,
    cashIn: 0,
    qrisIn: 0,
    pendingCount: 0,
    voidCount: 0,
    voidTotal: 0,
    cashNet: 0,
    soldItems: [],
    movements: [],
    byUser: [],
  };
  if (!fromIso) return empty;

  const sales = await fetchAll<{
    id: string;
    total: number;
    payment_method: string;
    payment_status: string;
    voided_at: string | null;
    created_by: string | null;
    cashier_id: string | null;
  }>((a, b) =>
    admin
      .from("pos_sales")
      .select("id, total, payment_method, payment_status, voided_at, created_by, cashier_id")
      .eq("bank_account_id", bankAccountId)
      .gt("created_at", fromIso)
      .lte("created_at", toIso)
      .order("id")
      .range(a, b)
  );

  const liveSaleIds = sales.filter((s) => !s.voided_at).map((s) => s.id);
  const items: Array<{ sale_id: string; product_name: string; variant_name: string | null; qty: number }> = [];
  for (let i = 0; i < liveSaleIds.length; i += 200) {
    const { data } = await admin
      .from("pos_sale_items")
      .select("sale_id, product_name, variant_name, qty")
      .in("sale_id", liveSaleIds.slice(i, i + 200));
    items.push(...(data ?? []));
  }

  const movementRows = await fetchAll<{
    type: string;
    qty: number;
    product_id: string;
    variant_id: string | null;
    created_by: string | null;
  }>((a, b) =>
    admin
      .from("pos_stock_movements")
      .select("type, qty, product_id, variant_id, created_by")
      .eq("bank_account_id", bankAccountId)
      .gt("created_at", fromIso)
      .lte("created_at", toIso)
      .order("id")
      .range(a, b)
  );

  const productIds = [...new Set(movementRows.map((m) => m.product_id))];
  const variantIds = [...new Set(movementRows.map((m) => m.variant_id).filter((v): v is string => !!v))];
  const [{ data: prods }, { data: vars }] = await Promise.all([
    productIds.length
      ? admin.from("pos_products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    variantIds.length
      ? admin.from("pos_product_variants").select("id, name").in("id", variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const prodName = new Map((prods ?? []).map((p) => [p.id, p.name]));
  const varName = new Map((vars ?? []).map((v) => [v.id, v.name]));

  const names = await namesByIds(admin, [
    ...sales.map((s) => s.cashier_id ?? s.created_by ?? ""),
    ...movementRows.map((m) => m.created_by ?? ""),
  ]);

  const movement = await cashMovementInWindow(admin, bankAccountId, fromIso, toIso);

  let cashIn = 0;
  let qrisIn = 0;
  let pendingCount = 0;
  let voidCount = 0;
  let voidTotal = 0;
  const perUser = new Map<string, { name: string; count: number; total: number }>();
  for (const s of sales) {
    if (s.voided_at) {
      voidCount += 1;
      voidTotal += Number(s.total);
      continue;
    }
    if (s.payment_status === "pending") pendingCount += 1;
    else if (s.payment_method === "cash") cashIn += Number(s.total);
    else if (s.payment_method === "qris") qrisIn += Number(s.total);
    const uid = s.cashier_id ?? s.created_by ?? "?";
    const row = perUser.get(uid) ?? { name: names.get(uid) ?? "Karyawan", count: 0, total: 0 };
    row.count += 1;
    row.total += Number(s.total);
    perUser.set(uid, row);
  }

  const sold = new Map<string, number>();
  for (const it of items) {
    const label = it.variant_name ? `${it.product_name} ${it.variant_name}` : it.product_name;
    sold.set(label, (sold.get(label) ?? 0) + it.qty);
  }

  return {
    from: fromIso,
    to: toIso,
    salesCount: sales.filter((s) => !s.voided_at).length,
    cashIn,
    qrisIn,
    pendingCount,
    voidCount,
    voidTotal,
    cashNet: netCash(movement),
    soldItems: [...sold.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty),
    movements: movementRows
      .filter((m) => m.type === "production" || m.type === "withdrawal")
      .map((m) => ({
        type: m.type as "production" | "withdrawal",
        name: m.variant_id
          ? `${prodName.get(m.product_id) ?? "Produk"} ${varName.get(m.variant_id) ?? ""}`.trim()
          : (prodName.get(m.product_id) ?? "Produk"),
        qty: m.qty,
        by: m.created_by ? (names.get(m.created_by) ?? null) : null,
      })),
    byUser: [...perUser.values()].sort((a, b) => b.total - a.total),
  };
}

/** Kasir yang boleh membuka shift di rekening ini: assignee full/pos_only dan masih aktif. */
export async function listShiftCashiers(
  admin: Admin,
  bankAccountId: string
): Promise<Array<{ id: string; name: string; hasPin: boolean }>> {
  const { data: rows } = await admin
    .from("bank_account_assignees")
    .select("user_id")
    .eq("bank_account_id", bankAccountId)
    .in("scope", ["full", "pos_only"]);
  const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
  if (ids.length === 0) return [];
  const { data: profs } = await admin
    .from("profiles")
    .select("id, full_name, nickname, pos_pin_hash, is_active")
    .in("id", ids)
    .eq("is_active", true);
  return (profs ?? [])
    .map((p) => ({
      id: p.id,
      name: cashierDisplayName(p.nickname, p.full_name) ?? p.full_name ?? "Karyawan",
      hasPin: !!p.pos_pin_hash,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/**
 * Verifikasi PIN seorang kasir untuk rekening ini. Dipakai buka/tutup shift DAN opname di dalam shift
 * (PIN kasir shift sah untuk opname, tidak harus authorizer opname). Hash tidak pernah keluar dari sini.
 */
export async function verifyShiftCashier(
  admin: Admin,
  bankAccountId: string,
  cashierId: string,
  pin: string | undefined
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!cashierId) return { ok: false, error: "Pilih nama kasir dulu." };
  if (!pin) return { ok: false, error: "Masukkan PIN." };
  if (!isValidPinFormat(pin)) return { ok: false, error: "PIN harus 4–6 digit angka." };
  const { data: assignee } = await admin
    .from("bank_account_assignees")
    .select("user_id")
    .eq("bank_account_id", bankAccountId)
    .eq("user_id", cashierId)
    .in("scope", ["full", "pos_only"])
    .maybeSingle();
  if (!assignee) return { ok: false, error: "Kasir ini tidak ditugaskan di POS cabang ini." };
  const { data: prof } = await admin
    .from("profiles")
    .select("full_name, nickname, pos_pin_hash, is_active")
    .eq("id", cashierId)
    .maybeSingle();
  if (!prof || !prof.is_active) return { ok: false, error: "Kasir tidak aktif." };
  const name = cashierDisplayName(prof.nickname, prof.full_name) ?? prof.full_name ?? "Kasir";
  if (!prof.pos_pin_hash) {
    return { ok: false, error: `${name} belum punya PIN POS — atur dulu di halaman Profil.` };
  }
  if (!verifyPin(pin, prof.pos_pin_hash)) return { ok: false, error: "PIN salah." };
  return { ok: true, name };
}

/** Konteks yang ditempelkan ke penjualan baru: shift berjalan + kasirnya (atau akun login bila insidentil). */
export async function saleShiftContext(
  admin: Admin,
  bankAccountId: string,
  loginUserId: string
): Promise<{ shiftId: string | null; cashierId: string | null }> {
  const cfg = await loadShiftConfig(admin, bankAccountId);
  if (!cfg?.enabled) return { shiftId: null, cashierId: null };
  const { data: open } = await admin
    .from("pos_shifts")
    .select("id, cashier_id")
    .eq("bank_account_id", bankAccountId)
    .eq("status", "open")
    .maybeSingle();
  return open
    ? { shiftId: open.id, cashierId: open.cashier_id }
    : { shiftId: null, cashierId: loginUserId };
}

export { namesByIds };
