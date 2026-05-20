import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCategoryPresets,
  getNonOperatingCategories,
  isCompanyCentralized,
  normalizePnLCategory,
} from "@/lib/cashflow/categories";

export interface InvestorMonthlyTotal {
  year: number;
  month: number;
  operatingRevenue: number;
  operatingExpense: number;
  operatingProfit: number;
  /** Net Dividen / Investment level perusahaan (debit Dividend +,
   *  credit Investment −). Informational. */
  netDividen: number;
}

export interface InvestorPnLSummary {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  months: InvestorMonthlyTotal[];
}

/**
 * BU-level PnL summary untuk investor — sum credits/debits langsung
 * dari semua cashflow_transactions yang tag-nya business_unit
 * tertentu, tanpa tergantung admin Pusat allocations. Investor lihat
 * angka apa adanya: yang masuk vs yang keluar (mode operasional),
 * lalu Net Dividen di-track terpisah.
 *
 * Refund handling mirror logika fetchPnL:
 *   - debit di kategori revenue (mis. "Sales Refund" tidak ada,
 *     tapi kalau ada debit on a credit-side category) → kurangi
 *     revenue.
 *   - credit di kategori expense → kurangi expense.
 *
 * Company-centralized (Investment/Dividend) tidak ikut operating —
 * masuk Net Dividen company-wide.
 */
export async function fetchInvestorPnLSummary(
  supabase: SupabaseClient,
  businessUnit: string,
  from: { year: number; month: number },
  to: { year: number; month: number }
): Promise<InvestorPnLSummary> {
  const startIso = `${from.year}-${String(from.month).padStart(2, "0")}-01`;
  const endY = to.month === 12 ? to.year + 1 : to.year;
  const endM = to.month === 12 ? 1 : to.month + 1;
  const endIso = `${endY}-${String(endM).padStart(2, "0")}-01`;

  // Query rentang waktu lewat join transactions → statements → accounts.
  const { data: rows } = await supabase
    .from("cashflow_transactions")
    .select(
      "transaction_date, debit, credit, category, cashflow_statements!inner(bank_accounts!inner(business_unit))"
    )
    .eq(
      "cashflow_statements.bank_accounts.business_unit",
      businessUnit
    )
    .gte("transaction_date", startIso)
    .lt("transaction_date", endIso);

  type Row = {
    transaction_date: string;
    debit: number | string | null;
    credit: number | string | null;
    category: string | null;
  };
  const list = (rows ?? []) as unknown as Row[];

  const presets = getCategoryPresets(businessUnit);
  const creditCats = new Set<string>([...presets.credit]);
  const debitCats = new Set<string>([...presets.debit]);
  const nonOp = new Set<string>(getNonOperatingCategories(businessUnit));

  // Build month buckets dari from..to inclusive.
  const months = new Map<string, InvestorMonthlyTotal>();
  let y = from.year;
  let m = from.month;
  while (y < to.year || (y === to.year && m <= to.month)) {
    months.set(`${y}-${m}`, {
      year: y,
      month: m,
      operatingRevenue: 0,
      operatingExpense: 0,
      operatingProfit: 0,
      netDividen: 0,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  for (const r of list) {
    const [yStr, mStr] = r.transaction_date.split("-");
    const yy = Number(yStr);
    const mm = Number(mStr);
    const bucket = months.get(`${yy}-${mm}`);
    if (!bucket) continue;
    const debit = Number(r.debit ?? 0);
    const credit = Number(r.credit ?? 0);
    const normalized = normalizePnLCategory(businessUnit, r.category);

    // Company-centralized (Investment / Dividend): bukan operating.
    // Net dividen mengikuti konvensi owner-POV (debit Dividend +,
    // credit Investment −).
    if (isCompanyCentralized(normalized)) {
      if (normalized === "Dividend") bucket.netDividen += debit - credit;
      else if (normalized === "Investment")
        bucket.netDividen -= credit - debit;
      continue;
    }

    if (nonOp.has(normalized)) continue;

    if (creditCats.has(normalized)) {
      // Sisi revenue. Credit menambah, debit di sisi yang sama
      // (refund) mengurangi.
      bucket.operatingRevenue += credit - debit;
    } else if (debitCats.has(normalized)) {
      // Sisi expense.
      bucket.operatingExpense += debit - credit;
    }
    // Kategori unknown / "(tanpa kategori)" di-skip — admin
    // perlu klasifikasi dulu untuk masuk hitungan.
  }

  for (const b of months.values()) {
    b.operatingProfit = b.operatingRevenue - b.operatingExpense;
  }

  return {
    businessUnit,
    from,
    to,
    months: Array.from(months.values()),
  };
}
