"use server";

/**
 * Posisi uang tunai cabang Haengbocake: ISI LACI KASIR dan UANG PENGADAAN (yang dibawa petugas, di luar laci).
 *
 * Uang pengadaan TIDAK dicatat sendiri — diturunkan dari buku, jadi tidak ada angka yang bisa lupa diisi:
 *     uang pengadaan  =  saldo buku kas cabang  −  isi laci kasir sekarang
 * Isi laci sudah mencakup pemasukan tunai yang belum diambil. "Uang diambil" saat tutup shift hanya memindahkan uang
 * dari laci ke tangan pengadaan, jadi saldo buku tidak berubah; buku baru berkurang saat nota belanja dicatat.
 * Saldo negatif = isi laci lebih besar dari buku: ada pemasukan tunai yang belum masuk buku atau pengeluaran ganda.
 */

import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, requireProcurementForBu, type ActionResult } from "./_gates";
import { posAccountFilterForCostingBrand } from "@/lib/costing/brands";
import { currentDrawerCash, type DrawerCashNow } from "@/lib/pos/shift-data";
import { computeLatestBalance } from "@/lib/cashflow/balance";
import type { ChronoRow } from "@/lib/cashflow/chronological";
import { POS_QRIS_CATEGORY } from "@/lib/cashflow/categories";

type Admin = ReturnType<typeof createAdminClient>;

const HAENGBOCAKE_BRANDS = ["Haengbocake Pare", "Haengbocake Semarang"] as const;

export interface CashPosition {
  businessUnit: string;
  /** Uang pengadaan = saldo buku − isi laci. null bila isi laci belum diketahui (belum ada hitungan tutup shift). */
  procurementBalance: number | null;
  /** Saldo kas di buku (Keuangan), tanpa QRIS. Hanya diisi untuk owner. */
  bookBalance: number | null;
  /** Penarikan laci terakhir (uang diambil saat tutup shift). */
  lastWithdrawal: { amount: number; at: string } | null;
  drawer: DrawerCashNow & {
    /** Modal laci standar cabang ini. */
    float: number;
    /** Isi laci di atas modal = yang semestinya diambil malam ini; null bila saldo laci tak diketahui. */
    excess: number | null;
  };
}

async function resolveAccount(admin: Admin, businessUnit: string): Promise<{ id: string; float: number } | null> {
  const f = posAccountFilterForCostingBrand(businessUnit);
  let q = admin
    .from("bank_accounts")
    .select("id, drawer_float")
    .eq("business_unit", f.businessUnit)
    .eq("bank", "cash");
  if (f.branch) q = q.eq("default_branch", f.branch);
  const { data } = await q.limit(1).maybeSingle();
  return data ? { id: data.id, float: Number(data.drawer_float ?? 300_000) } : null;
}

/** Saldo kas di buku (Keuangan) rekening ini, tanpa QRIS — angka yang sama dengan "Saldo terakhir" di Keuangan. */
async function ledgerCashBalance(admin: Admin, accountId: string): Promise<number> {
  const { data: stmts } = await admin.from("cashflow_statements").select("id").eq("bank_account_id", accountId);
  const ids = (stmts ?? []).map((s) => s.id);
  if (ids.length === 0) return 0;
  const rows: ChronoRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("cashflow_transactions")
      .select("transaction_date, transaction_time, debit, credit, running_balance, category, sort_order")
      .in("statement_id", ids)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error("Gagal membaca buku kas");
    if (!data || data.length === 0) break;
    for (const t of data) {
      if (t.category === POS_QRIS_CATEGORY) continue;
      rows.push({
        date: t.transaction_date,
        time: t.transaction_time,
        debit: Number(t.debit),
        credit: Number(t.credit),
        runningBalance: t.running_balance !== null ? Number(t.running_balance) : null,
        sortOrder: t.sort_order,
      });
    }
    if (data.length < PAGE) break;
  }
  return computeLatestBalance(rows);
}

async function buildPosition(admin: Admin, businessUnit: string, withBook: boolean): Promise<CashPosition | null> {
  const acct = await resolveAccount(admin, businessUnit);
  if (!acct) return null;
  const [drawer, book, { data: lastW }] = await Promise.all([
    currentDrawerCash(admin, acct.id),
    ledgerCashBalance(admin, acct.id),
    admin
      .from("pos_shifts")
      .select("closed_at, close_cash_withdrawn")
      .eq("bank_account_id", acct.id)
      .eq("status", "closed")
      .gt("close_cash_withdrawn", 0)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    businessUnit,
    procurementBalance: drawer.balance === null ? null : Math.round(book - drawer.balance),
    bookBalance: withBook ? book : null,
    lastWithdrawal:
      lastW?.closed_at && Number(lastW.close_cash_withdrawn) > 0
        ? { amount: Number(lastW.close_cash_withdrawn), at: lastW.closed_at }
        : null,
    drawer: {
      ...drawer,
      float: acct.float,
      excess: drawer.balance === null ? null : Math.max(0, drawer.balance - acct.float),
    },
  };
}

/** Uang pengadaan & isi laci satu cabang — untuk petugas pengadaan cabang itu (atau owner). */
export async function getCashPosition(businessUnit: string): Promise<ActionResult<CashPosition>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const pos = await buildPosition(createAdminClient(), businessUnit, gate.isAdmin);
    if (!pos) return { ok: false, error: "Rekening kas cabang ini tidak ditemukan" };
    return { ok: true, data: pos };
  } catch {
    return { ok: false, error: "Gagal menghitung saldo" };
  }
}

/** Owner: posisi kedua cabang, lengkap dengan saldo buku. */
export async function getAllCashPositions(): Promise<ActionResult<CashPosition[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  try {
    const out: CashPosition[] = [];
    for (const bu of HAENGBOCAKE_BRANDS) {
      const pos = await buildPosition(admin, bu, true);
      if (pos) out.push(pos);
    }
    return { ok: true, data: out };
  } catch {
    return { ok: false, error: "Gagal menghitung saldo" };
  }
}
