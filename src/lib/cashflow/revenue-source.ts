/**
 * Rincian revenue per REKENING SUMBER untuk satu rentang bulan.
 *
 * PnL biasa memecah revenue per cabang dan per kategori — tidak per
 * rekening asal. Setelah Mayar masuk sebagai sumber pendapatan
 * tersendiri (dan langsung jadi mayoritas revenue Yeobo Space), perlu
 * satu tampilan yang menjawab pertanyaan sederhana: berapa yang datang
 * dari Mayar, berapa dari rekening bank/cash.
 *
 * Hanya menghitung kategori revenue OPERASIONAL — Wealth Transfer,
 * Investment, Owner's Debt Repayment dsb. sengaja tidak ikut supaya
 * angkanya sebanding dengan baris "operating revenue" di PnL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getCategoryPresets, getNonOperatingCategories } from "./categories";

export interface RevenueSourceRow {
  bankAccountId: string;
  accountName: string;
  /** Kode bank (`mayar`, `bca`, `cash`, …) — dipakai untuk label/warna. */
  bank: string;
  transactionCount: number;
  revenue: number;
  /** Porsi terhadap total revenue operasional, 0–100. */
  sharePercent: number;
}

export interface RevenueSourceReport {
  rows: RevenueSourceRow[];
  total: number;
  totalTransactions: number;
  /** Subtotal dari rekening berjenis payment gateway (saat ini: Mayar). */
  gatewayTotal: number;
  /** Subtotal dari rekening bank + cash. */
  bankTotal: number;
}

/** Bank code yang diperlakukan sebagai payment gateway, bukan rekening bank. */
const GATEWAY_BANKS = new Set(["mayar"]);

export async function fetchRevenueBySource(
  supabase: SupabaseClient<Database>,
  businessUnit: string,
  startDate: string,
  endDate: string
): Promise<RevenueSourceReport> {
  const presets = getCategoryPresets(businessUnit);
  const nonOp = new Set(getNonOperatingCategories(businessUnit));
  const revenueCategories = presets.credit.filter((c) => !nonOp.has(c));

  const empty: RevenueSourceReport = {
    rows: [],
    total: 0,
    totalTransactions: 0,
    gatewayTotal: 0,
    bankTotal: 0,
  };
  if (revenueCategories.length === 0) return empty;

  // Paginate — satu SELECT PostgREST dibatasi 1000 baris, dan Mayar
  // sendiri sudah ratusan baris per bulan.
  type Row = {
    credit: string | number;
    category: string | null;
    cashflow_statements: {
      bank_accounts: {
        id: string;
        account_name: string;
        bank: string;
      };
    } | null;
  };

  const all: Row[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cashflow_transactions")
      .select(
        "credit, category, cashflow_statements!inner(bank_accounts!inner(id, account_name, bank, business_unit))"
      )
      .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
      .in("category", revenueCategories as string[])
      .gt("credit", 0)
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate)
      // ORDER BY wajib sebelum .range(): tanpa kunci unik, Postgres tidak
      // menjamin urutan, sehingga paginasi bisa melewatkan sebagian baris
      // DAN menggandakan sebagian lain — hasilnya beda tiap pemanggilan.
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return empty;
    const rows = (data ?? []) as unknown as Row[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }

  const byAccount = new Map<string, RevenueSourceRow>();
  let total = 0;
  for (const r of all) {
    const acc = r.cashflow_statements?.bank_accounts;
    if (!acc) continue;
    const amount = Number(r.credit) || 0;
    total += amount;
    const cur =
      byAccount.get(acc.id) ??
      ({
        bankAccountId: acc.id,
        accountName: acc.account_name,
        bank: acc.bank,
        transactionCount: 0,
        revenue: 0,
        sharePercent: 0,
      } satisfies RevenueSourceRow);
    cur.transactionCount += 1;
    cur.revenue += amount;
    byAccount.set(acc.id, cur);
  }

  const rows = [...byAccount.values()].sort((a, b) => b.revenue - a.revenue);
  for (const r of rows) {
    r.revenue = Math.round(r.revenue);
    r.sharePercent = total > 0 ? (r.revenue / total) * 100 : 0;
  }

  const gatewayTotal = rows
    .filter((r) => GATEWAY_BANKS.has(r.bank))
    .reduce((s, r) => s + r.revenue, 0);

  return {
    rows,
    total: Math.round(total),
    totalTransactions: all.length,
    gatewayTotal,
    bankTotal: Math.round(total) - gatewayTotal,
  };
}
