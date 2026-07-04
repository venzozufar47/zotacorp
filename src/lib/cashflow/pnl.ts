/**
 * Profit & Loss aggregation for a business unit.
 *
 * Scope rules:
 *   - Pulls transactions from ALL rekening (bank + cash) under the
 *     BU. Inter-account transfers are classified as "Wealth Transfer"
 *     (non-operating) so they wash out — no double-count. Cash-ledger
 *     category labels are normalized to the unified PnL vocabulary
 *     via `normalizePnLCategory` (e.g. "Haengbo Cust" → "Sales").
 *   - Three branches exist (Pusat, Semarang, Pare) but Pusat is NOT
 *     operating. Admin must allocate every Pusat (month × category ×
 *     side) bucket into a Semarang + Pare split. Unallocated or
 *     unbalanced buckets are EXCLUDED from branch numbers and flagged
 *     as warnings.
 *   - "Wealth Transfer", "Investment", "Dividend" are classified
 *     non-operating (see `getNonOperatingCategories`) and don't
 *     contribute to the operating-profit line. They appear in their
 *     own summary row ("Aktivitas Lain").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getCategoryPresets,
  getNonOperatingCategories,
  isAutoSplitPusatCategory,
  isCompanyCentralized,
  normalizePnLCategory,
} from "./categories";

export type PnLSide = "credit" | "debit";
export type PnLCategoryClass = "operating" | "nonop";

export interface CategoryTxDetail {
  date: string;
  description: string;
  /** Positive = credit (masuk). Negative = debit (keluar). */
  amount: number;
}

export interface BranchCategoryBreakdown {
  category: string;
  credit: number;
  debit: number;
  kind: PnLCategoryClass;
  /**
   * Pecahan kontribusi per asal. Tiga sumber:
   *  - `direct*`  — transaksi yang langsung ditandai cabang ini.
   *  - `posQris*` — auto-deducted dari Pusat: total QRIS POS yang
   *    masuk di kasir Pare bulan ini (Pare-only; POS belum ada di
   *    Semarang per saat ini).
   *  - `pusat*`   — porsi dari Pusat yang dialokasikan admin secara
   *    manual via Pusat allocator (sisa setelah auto-deduct POS QRIS).
   *
   * Invariant: `directCredit + posQrisCredit + pusatCredit === credit`
   * (idem `debit`).
   */
  directCredit: number;
  directDebit: number;
  posQrisCredit: number;
  posQrisDebit: number;
  pusatCredit: number;
  pusatDebit: number;
  /**
   * Per-transaction breakdown for admin drill-down. Covers transaksi
   * yang tagged langsung ke branch. Pusat-allocated portions yang
   * di-split ke branch TIDAK muncul di sini (mereka agregat per
   * kategori, bukan tx individual) — agregat tersebut tetap tercermin
   * di `credit`/`debit` dan `pusatCredit`/`pusatDebit`.
   */
  details?: CategoryTxDetail[];
}

export interface BranchPnL {
  operatingRevenue: number;
  operatingExpense: number;
  operatingProfit: number;
  nonOpRevenue: number;
  nonOpExpense: number;
  byCategory: BranchCategoryBreakdown[];
}

export interface PusatTxDetail {
  date: string;
  description: string;
  amount: number;
}

/**
 * Categories where admin wants to see the underlying Pusat
 * transactions inline in the allocation editor (not just the
 * aggregate). Useful for catch-all buckets like "Other Revenue"
 * where the reason to allocate depends on the individual source.
 */
export const PUSAT_DETAIL_CATEGORIES = new Set([
  "Other Revenue",
  "Salaries & Wages",
  "Advertising",
]);

export interface PusatBreakdownRow {
  category: string;
  side: PnLSide;
  pusatTotal: number;
  /**
   * Auto-deduction sebelum admin alokasi. Khusus Sales credit di Pare:
   * POS QRIS Pare otomatis dipotong dari raw Pusat Sales karena POS
   * sudah tahu eksakta amount-nya per cabang. Field ini menyimpan
   * jumlah yang dipotong supaya UI bisa tampilkan transparansi.
   * Kategori lain = 0.
   */
  autoDeductPare: number;
  autoDeductSemarang: number;
  /**
   * Jumlah yang admin perlu alokasikan = `pusatTotal − autoDeductPare
   * − autoDeductSemarang`. UI allocator pakai ini, bukan `pusatTotal`,
   * supaya admin tidak double-count POS QRIS yang sudah diatribusi.
   */
  netForAllocation: number;
  semarangAlloc: number;
  pareAlloc: number;
  balanced: boolean;
  /** No allocation row yet in DB. */
  unallocated: boolean;
  /** Has a row but sum ≠ netForAllocation. */
  unbalanced: boolean;
  /**
   * Admin menge-lock row ini setelah nilainya final. Input di editor
   * jadi read-only kecuali admin unlock dulu. Server action
   * `savePusatAllocation` juga tolak update ke row locked.
   */
  locked: boolean;
  /** Populated only for categories in PUSAT_DETAIL_CATEGORIES. */
  details?: PusatTxDetail[];
}

/**
 * Referensi penjualan custom cake per-cabang — angka BANTU untuk admin
 * saat mengalokasikan bucket Sales Pusat secara manual. Diambil dari
 * `cake_orders` (di luar ongkir, akrual: semua order non-cancelled/
 * discarded/free berdasarkan tanggal jadwal `scheduled_at` WIB, dikurangi
 * refund). BUKAN bagian dari angka P&L — tidak mengubah revenue/alokasi
 * apa pun; murni ditampilkan sebagai saran di editor alokasi.
 * Haengbocake-only (undefined untuk BU lain).
 */
export interface SalesAllocationHint {
  cakeSemarang: number;
  cakePare: number;
  /**
   * POS Pare bulan ini = cash + QRIS pada rekening Cash Haengbocake
   * Pare (dari ledger). Ditampilkan sebagai info — porsi ini sudah
   * otomatis masuk Pare (cash langsung + auto-deduct QRIS), jadi bukan
   * bagian dari sisa yang perlu di-split manual.
   */
  posPare: number;
}

export interface PnLMonth {
  year: number;
  month: number;
  byBranch: {
    Semarang: BranchPnL;
    Pare: BranchPnL;
  };
  pusatBreakdown: PusatBreakdownRow[];
  /** Count of Pusat buckets still needing admin input this month. */
  unallocatedCount: number;
  unbalancedCount: number;
  /**
   * Net Dividen company-wide untuk bulan ini — dihitung dari SEMUA
   * transaksi Investment + Dividend (lintas cabang & pusat) dengan
   * konvensi owner-POV: debit Dividend (+), credit Investment (−).
   * Categories ini tidak di-alokasi per-cabang karena secara bisnis
   * milik owner di level perusahaan, bukan kinerja cabang.
   */
  companyNetDividen: number;
  /**
   * Rincian per-kategori untuk Net Dividen company-wide. Biasanya
   * hanya berisi dua entry (Investment, Dividend) — disimpan dalam
   * bentuk BranchCategoryBreakdown supaya bisa di-render dengan
   * komponen kategori yang sama di PnLTable.
   */
  companyNetDividenByCategory: BranchCategoryBreakdown[];
  /**
   * Total QRIS credits recorded on the Pare cash ledger this month —
   * pass-through rows (category "QRIS (non-operasional)") that do NOT
   * hit operating PnL on the cash side because they settle as "Sales"
   * on Bank Mandiri. Surfaced here as decision support: when admin
   * allocates the Pusat "Sales" bucket to Semarang/Pare, this number
   * is the minimum amount that demonstrably belongs to Pare (since
   * that QRIS money was physically rung up at Pare's register).
   */
  qrisOperasionalPare: number;
  /**
   * Referensi custom cake per-cabang bulan ini (Haengbocake-only, di
   * luar ongkir). Angka bantu untuk mengalokasikan Sales Pusat — tidak
   * mempengaruhi P&L. undefined kalau BU bukan Haengbocake / tidak ada
   * order.
   */
  salesHint?: SalesAllocationHint;
}

export interface PnLReport {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  months: PnLMonth[];
}

/** { year, month } in the range [start..end] inclusive, chronological. */
function monthsBetween(
  start: { year: number; month: number },
  end: { year: number; month: number }
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = start.year;
  let m = start.month;
  while (y < end.year || (y === end.year && m <= end.month)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * "YYYY-MM" month key of a timestamptz in WIB (UTC+7). Custom cake
 * `scheduled_at` is tz-aware; the report buckets by the WIB calendar
 * month so an order scheduled 30 Jun 23:00 WIB lands in Jun, not Jul.
 */
function wibMonthKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const wib = new Date(t + 7 * 60 * 60 * 1000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Produce a full PnL report for the BU across the given month range.
 * Pure function beyond two DB queries — safe to call from server
 * components or server actions.
 */
export async function fetchPnL(
  supabase: SupabaseClient<Database>,
  businessUnit: string,
  from: { year: number; month: number },
  to: { year: number; month: number }
): Promise<PnLReport> {
  // Pull tx from ALL rekening for the BU (bank + cash). Inter-account
  // transfers are classified as "Wealth Transfer" (non-operating) so
  // they wash out in operating totals — no double-count. Cash
  // rekening uses different category labels (Haengbo Cust, Slice
  // Haengbo, etc.); we normalize them via `normalizePnLCategory` to
  // the unified PnL vocabulary so a single "Sales" bucket aggregates
  // all revenue sources.
  // Paginate to bypass PostgREST's default 1000-row cap. `.range()`
  // alone isn't reliable on managed Supabase because `db-max-rows`
  // can be enforced server-side regardless of the Range header. Loop
  // until we read a short page.
  type PnLTxRow = {
    transaction_date: string;
    effective_period_year: number | null;
    effective_period_month: number | null;
    debit: string | number;
    credit: string | number;
    category: string | null;
    branch: string | null;
    description: string | null;
    cashflow_statements?: {
      bank_accounts?: { account_name?: string | null } | null;
    } | null;
  };
  // Bound the scan to the requested period at the DB level. The generated
  // `effective_period` column (migration 083) = first-of-month of the SAME
  // coalesced (effective_period_year/month, else transaction_date) that the
  // JS `inRange` below uses, so this half-open window [periodStart,
  // periodEndExcl) is exactly equivalent to `inRange` — it only avoids
  // fetching a BU's whole history. `inRange` stays as the source of truth.
  const periodStart = `${from.year}-${String(from.month).padStart(2, "0")}-01`;
  const endY = to.month === 12 ? to.year + 1 : to.year;
  const endM = to.month === 12 ? 1 : to.month + 1;
  const periodEndExcl = `${endY}-${String(endM).padStart(2, "0")}-01`;
  const txs: PnLTxRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error } = await supabase
      .from("cashflow_transactions")
      .select(
        "transaction_date, effective_period_year, effective_period_month, debit, credit, category, branch, description, cashflow_statements!inner(bank_account_id, bank_accounts!inner(business_unit, account_name))"
      )
      .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
      .gte("effective_period", periodStart)
      .lt("effective_period", periodEndExcl)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (page ?? []) as PnLTxRow[];
    txs.push(...rows);
    if (rows.length < PAGE) break;
  }

  const { data: allocsRaw } = await supabase
    .from("cashflow_pusat_allocations")
    .select(
      "period_year, period_month, side, category, semarang_amount, pare_amount, locked, locked_pusat_total"
    )
    .eq("business_unit", businessUnit)
    .gte("period_year", from.year)
    .lte("period_year", to.year)
    .range(0, 99999);

  // allocs keyed by "year-month|side|category"
  const allocMap = new Map<
    string,
    {
      semarang: number;
      pare: number;
      locked: boolean;
      lockedPusatTotal: number | null;
    }
  >();
  for (const a of allocsRaw ?? []) {
    const key = `${ym(a.period_year, a.period_month)}|${a.side}|${a.category}`;
    allocMap.set(key, {
      semarang: Number(a.semarang_amount),
      pare: Number(a.pare_amount),
      locked: Boolean(a.locked),
      lockedPusatTotal:
        a.locked_pusat_total != null ? Number(a.locked_pusat_total) : null,
    });
  }

  // Custom-cake per-branch reference (Haengbocake-only) — advisory hint
  // for the manual Sales allocation, NOT part of any P&L figure. Values
  // per WIB month, excl ongkir, accrual (all non-cancelled/discarded/free
  // orders by scheduled_at), net of refund. Paginated because a wide date
  // range can exceed PostgREST's default row cap.
  const salesHintByMonth = new Map<
    string,
    { cakeSemarang: number; cakePare: number }
  >();
  if (businessUnit === "Haengbocake") {
    type CakeRow = {
      branch: string | null;
      scheduled_at: string | null;
      total_idr: number | null;
      delivery_fee_idr: number | null;
      refund_idr: number | null;
      status: string | null;
      free_claim: boolean | null;
    };
    const startIso = `${periodStart}T00:00:00+07:00`;
    const endIso = `${periodEndExcl}T00:00:00+07:00`;
    const CAKE_PAGE = 1000;
    for (let offset = 0; ; offset += CAKE_PAGE) {
      const { data: page, error } = await supabase
        .from("cake_orders")
        .select(
          "branch, scheduled_at, total_idr, delivery_fee_idr, refund_idr, status, free_claim"
        )
        .gte("scheduled_at", startIso)
        .lt("scheduled_at", endIso)
        .range(offset, offset + CAKE_PAGE - 1);
      if (error) break; // advisory only — never fail the report over the hint
      // `free_claim` (migration 094) belum ada di generated types — cast
      // lewat unknown supaya select tetap type-check tanpa regen types.
      const rows = (page ?? []) as unknown as CakeRow[];
      for (const c of rows) {
        if (!c.scheduled_at) continue;
        if (c.status === "cancelled" || c.status === "discarded") continue;
        if (c.free_claim) continue;
        const mk = wibMonthKey(c.scheduled_at);
        if (!mk) continue;
        const val =
          (Number(c.total_idr) || 0) -
          (Number(c.delivery_fee_idr) || 0) -
          (Number(c.refund_idr) || 0);
        let hint = salesHintByMonth.get(mk);
        if (!hint) {
          hint = { cakeSemarang: 0, cakePare: 0 };
          salesHintByMonth.set(mk, hint);
        }
        const br = (c.branch ?? "").trim().toLowerCase();
        if (br === "pare") hint.cakePare += val;
        else if (br === "semarang") hint.cakeSemarang += val;
      }
      if (rows.length < CAKE_PAGE) break;
    }
  }

  // Aggregate tx totals, partitioned by monthKey. This way the
  // per-month report build below is O(buckets_in_month) instead of
  // O(total_tx_across_range) for every month iteration.
  type BranchName = "Pusat" | "Semarang" | "Pare" | "unassigned";
  type MonthBucket = Map<string, number>; // "<branch>|<category>|<side>" → amount
  const byMonth = new Map<string, MonthBucket>();
  // Per-bucket transaction details, only filled for Pusat buckets
  // whose category is in PUSAT_DETAIL_CATEGORIES. Keyed identically
  // to the main bucket map ("monthKey | <branch>|<category>|<side>")
  // so lookup during report-build is a single map hit.
  const detailsByBucket = new Map<string, PusatTxDetail[]>();
  // Per (monthKey | branch | category) transaction details for
  // direct-branch tx — used to drill-down per category in PnLTable.
  // Amount is signed: +credit, −debit. Pusat-allocated amounts NOT
  // collected here (they're aggregate splits, not individual tx).
  const branchDetailsByBucket = new Map<string, CategoryTxDetail[]>();
  // Per (monthKey | category) transaction details for company-level
  // Investment/Dividend drill-down.
  const companyDetailsByBucket = new Map<string, CategoryTxDetail[]>();
  // QRIS pass-through credits on the Pare cash ledger, keyed by
  // monthKey. See PnLMonth.qrisOperasionalPare for why this is
  // aggregated separately from the branch buckets.
  const qrisParePerMonth = new Map<string, number>();
  // POS cash sales on the Pare cash ledger, keyed by monthKey. Combined
  // with `qrisParePerMonth` this gives "POS Pare (cash + QRIS)" — an
  // advisory number shown in the Sales allocation hint. Not part of any
  // P&L figure.
  const posCashParePerMonth = new Map<string, number>();
  // Company-wide Investment/Dividend totals (owner-POV), keyed by
  // monthKey → { "Investment"|"Dividend" → { credit, debit } }. These
  // categories are NEVER routed to branch/pusat buckets; branch tag on
  // the transaction is ignored.
  const companyNonOp = new Map<
    string,
    Map<string, { credit: number; debit: number }>
  >();

  // Inclusive month range check for the effective-bucket filter.
  const inRange = (y: number, m: number): boolean => {
    if (y < from.year || y > to.year) return false;
    if (y === from.year && m < from.month) return false;
    if (y === to.year && m > to.month) return false;
    return true;
  };

  for (const t of txs) {
    // Resolved bucket = override if set, else the tx date's month.
    let year: number;
    let month: number;
    if (t.effective_period_year != null && t.effective_period_month != null) {
      year = t.effective_period_year;
      month = t.effective_period_month;
    } else {
      const [y, mStr] = t.transaction_date.split("-");
      year = Number(y);
      month = Number(mStr);
    }
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    if (!inRange(year, month)) continue;

    const monthKey = ym(year, month);
    const accountName = t.cashflow_statements?.bank_accounts?.account_name ?? "";
    const rawCategory = (t.category ?? "").trim();
    const creditNum = Number(t.credit) || 0;
    if (
      accountName === "Cash Haengbocake Pare" &&
      rawCategory === "QRIS (non-operasional)" &&
      creditNum > 0
    ) {
      qrisParePerMonth.set(
        monthKey,
        (qrisParePerMonth.get(monthKey) ?? 0) + creditNum
      );
    }
    if (
      accountName === "Cash Haengbocake Pare" &&
      rawCategory === "Sales" &&
      creditNum > 0
    ) {
      posCashParePerMonth.set(
        monthKey,
        (posCashParePerMonth.get(monthKey) ?? 0) + creditNum
      );
    }
    const branchRaw = (t.branch ?? "").trim();
    const branch: BranchName =
      branchRaw === "Pusat" || branchRaw === "Semarang" || branchRaw === "Pare"
        ? branchRaw
        : "unassigned";
    const category = normalizePnLCategory(businessUnit, t.category);

    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    if (credit === 0 && debit === 0) continue;

    // Investment/Dividend: terpusat, tidak masuk branch/pusat buckets.
    if (isCompanyCentralized(category)) {
      let catMap = companyNonOp.get(monthKey);
      if (!catMap) {
        catMap = new Map();
        companyNonOp.set(monthKey, catMap);
      }
      const entry = catMap.get(category) ?? { credit: 0, debit: 0 };
      entry.credit += credit;
      entry.debit += debit;
      catMap.set(category, entry);
      const cdk = `${monthKey}|${category}`;
      const clist = companyDetailsByBucket.get(cdk) ?? [];
      clist.push({
        date: t.transaction_date,
        description: (t.description ?? "").trim() || "(tanpa deskripsi)",
        amount: credit > 0 ? credit : -debit,
      });
      companyDetailsByBucket.set(cdk, clist);
      continue;
    }

    let bucket = byMonth.get(monthKey);
    if (!bucket) {
      bucket = new Map();
      byMonth.set(monthKey, bucket);
    }
    const collectDetail = branch === "Pusat" && PUSAT_DETAIL_CATEGORIES.has(category);
    const collectBranchDetail = branch === "Semarang" || branch === "Pare";
    if (credit > 0) {
      const k = `${branch}|${category}|credit`;
      bucket.set(k, (bucket.get(k) ?? 0) + credit);
      if (collectDetail) {
        const dk = `${monthKey}|${k}`;
        const list = detailsByBucket.get(dk) ?? [];
        list.push({
          date: t.transaction_date,
          description: (t.description ?? "").trim() || "(tanpa deskripsi)",
          amount: credit,
        });
        detailsByBucket.set(dk, list);
      }
    }
    if (debit > 0) {
      const k = `${branch}|${category}|debit`;
      bucket.set(k, (bucket.get(k) ?? 0) + debit);
      if (collectDetail) {
        const dk = `${monthKey}|${k}`;
        const list = detailsByBucket.get(dk) ?? [];
        list.push({
          date: t.transaction_date,
          description: (t.description ?? "").trim() || "(tanpa deskripsi)",
          amount: debit,
        });
        detailsByBucket.set(dk, list);
      }
    }
    if (collectBranchDetail && (credit > 0 || debit > 0)) {
      const bdk = `${monthKey}|${branch}|${category}`;
      const blist = branchDetailsByBucket.get(bdk) ?? [];
      blist.push({
        date: t.transaction_date,
        description: (t.description ?? "").trim() || "(tanpa deskripsi)",
        amount: credit > 0 ? credit : -debit,
      });
      branchDetailsByBucket.set(bdk, blist);
    }
  }

  const nonOpSet = new Set(getNonOperatingCategories(businessUnit));
  // Preset-based classification: kategori operating di-bagi expense-side
  // (muncul di preset debit) vs revenue-side (muncul di preset credit).
  // Ini dipakai agar tx "berlawanan arah" pada kategori ekspens (mis.
  // Salaries & Wages credit karena refund kelebihan gaji, atau Sales
  // Refund credit karena customer mengembalikan refund yang kelewat)
  // di-NET ke sisi alaminya, bukan tampil sebagai baris pendapatan.
  // Kategori yang muncul di dua preset atau di luar preset tetap pakai
  // split asal (tidak ada heuristik yang aman untuk itu).
  const presets = getCategoryPresets(businessUnit);
  const debitCatSet = new Set(presets.debit);
  const creditCatSet = new Set(presets.credit);
  const rangeMonths = monthsBetween(from, to);

  // Track allocations whose locked snapshot drifted from the now-
  // computed Pusat total. After the report is built we flip those rows'
  // `locked` to false in DB so the editor un-greys them on next render.
  const pendingAutoUnlocks = new Map<
    string,
    { year: number; month: number; side: PnLSide; category: string }
  >();

  // Build per-month report.
  const months: PnLMonth[] = rangeMonths.map(({ year, month }) => {
    const monthKey = ym(year, month);

    // Start empty branch buckets. `branchAgg` adalah TOTAL gabungan
    // dari semua sumber; tiga bag turunan melacak asal pemisahnya:
    //  - `branchDirectAgg`  → transaksi yang tagged langsung ke cabang.
    //  - `branchPosQrisAgg` → POS QRIS Pare yang otomatis dipotong
    //    dari Pusat (cuma berlaku Pare, kategori Sales).
    //  - `branchPusatAgg`   → sisa Pusat yang admin alokasikan manual.
    type BranchBag = Map<string, { credit: number; debit: number }>;
    const newBag = (): BranchBag => new Map();
    const branchAgg: Record<"Semarang" | "Pare", BranchBag> = {
      Semarang: newBag(),
      Pare: newBag(),
    };
    const branchDirectAgg: Record<"Semarang" | "Pare", BranchBag> = {
      Semarang: newBag(),
      Pare: newBag(),
    };
    const branchPusatAgg: Record<"Semarang" | "Pare", BranchBag> = {
      Semarang: newBag(),
      Pare: newBag(),
    };
    const branchPosQrisAgg: Record<"Semarang" | "Pare", BranchBag> = {
      Semarang: newBag(),
      Pare: newBag(),
    };
    const accumulate = (
      bag: BranchBag,
      category: string,
      credit: number,
      debit: number
    ) => {
      const existing = bag.get(category) ?? { credit: 0, debit: 0 };
      existing.credit += credit;
      existing.debit += debit;
      bag.set(category, existing);
    };
    const addToBranch = (
      branch: "Semarang" | "Pare",
      source: "direct" | "pusat" | "posQris",
      category: string,
      credit: number,
      debit: number
    ) => {
      accumulate(branchAgg[branch], category, credit, debit);
      const sourceBag =
        source === "direct"
          ? branchDirectAgg
          : source === "posQris"
            ? branchPosQrisAgg
            : branchPusatAgg;
      accumulate(sourceBag[branch], category, credit, debit);
    };

    const bucket = byMonth.get(monthKey) ?? new Map<string, number>();

    // 1. Direct branch tx: iterate this month's partition only.
    for (const [k, amount] of bucket) {
      const [branch, category, side] = k.split("|") as [
        BranchName,
        string,
        PnLSide,
      ];
      if (branch !== "Semarang" && branch !== "Pare") continue;
      if (side === "credit") addToBranch(branch, "direct", category, amount, 0);
      else addToBranch(branch, "direct", category, 0, amount);
    }

    // 2. Pusat buckets: merge with allocation. Balanced allocations
    //    contribute to the branch totals; unbalanced/unallocated are
    //    skipped here and flagged in `pusatBreakdown`.
    //
    // Special handling Sales credit: total POS QRIS Pare bulan ini
    // (sudah dihitung di `qrisParePerMonth`) otomatis dipotong dari
    // raw Pusat total, dan langsung diatribusi ke Pare via sumber
    // "posQris". Admin tinggal alokasi sisa-nya (yang biasanya custom
    // cake online — campuran Bank Jago + non-POS QRIS).
    const pusatBreakdown: PusatBreakdownRow[] = [];
    const posQrisPareThisMonth = Math.round(
      qrisParePerMonth.get(monthKey) ?? 0
    );
    for (const [k, amount] of bucket) {
      const [branch, category, side] = k.split("|") as [
        BranchName,
        string,
        PnLSide,
      ];
      if (branch !== "Pusat") continue;
      // Kategori auto-split 50/50 (Bank Administration, Wealth Transfer):
      // tidak ada porsi cabang yang nyata → bagi rata otomatis, tanpa
      // baris alokasi manual di editor (skip pusatBreakdown). Semarang
      // dapat pembulatan ke atas, Pare sisanya, supaya jumlah tetap pas.
      if (isAutoSplitPusatCategory(businessUnit, category)) {
        const total = Math.round(amount);
        const half = Math.round(total / 2);
        const rest = total - half;
        if (side === "credit") {
          addToBranch("Semarang", "pusat", category, half, 0);
          addToBranch("Pare", "pusat", category, rest, 0);
        } else {
          addToBranch("Semarang", "pusat", category, 0, half);
          addToBranch("Pare", "pusat", category, 0, rest);
        }
        continue;
      }
      const allocKey = `${monthKey}|${side}|${category}`;
      const alloc = allocMap.get(allocKey);
      const pusatTotal = Math.round(amount);
      // Auto-deduct hanya Sales credit di Pare (POS belum ada Semarang).
      const isSalesCredit = category === "Sales" && side === "credit";
      const autoDeductPare = isSalesCredit
        ? Math.min(posQrisPareThisMonth, pusatTotal)
        : 0;
      const autoDeductSemarang = 0;
      const netForAllocation = pusatTotal - autoDeductPare - autoDeductSemarang;
      const semarangAlloc = alloc ? Math.round(alloc.semarang) : 0;
      const pareAlloc = alloc ? Math.round(alloc.pare) : 0;
      const sum = semarangAlloc + pareAlloc;
      const unallocated = !alloc;
      // Balanced terhadap `netForAllocation`, bukan raw pusatTotal,
      // supaya admin tidak harus menyerap jumlah POS QRIS yang sudah
      // otomatis di-attribute.
      const balanced =
        !unallocated && Math.abs(sum - netForAllocation) <= 1;
      const unbalanced = !unallocated && !balanced;

      // Auto-unlock guard. Dua kondisi:
      //  1. Net Pusat drift sejak lock (POS QRIS / Pusat tx berubah)
      //     → invariant lock tidak relevan lagi.
      //  2. Row locked tapi sekarang unbalanced (sum semarang+pare ≠
      //     netForAllocation). Bisa terjadi kalau data Pusat berubah
      //     tanpa update lockedPusatTotal, atau legacy lock dari
      //     pre-snapshot era. Locked HARUS imply balanced.
      let effectiveLocked = Boolean(alloc?.locked);
      const driftedSnapshot =
        alloc?.locked &&
        alloc.lockedPusatTotal != null &&
        alloc.lockedPusatTotal !== netForAllocation;
      const lockedButStale = alloc?.locked && unbalanced;
      if (alloc?.locked && (driftedSnapshot || lockedButStale)) {
        effectiveLocked = false;
        const drift = pendingAutoUnlocks.get(allocKey);
        if (!drift) {
          pendingAutoUnlocks.set(allocKey, {
            year: parseInt(monthKey.split("-")[0], 10),
            month: parseInt(monthKey.split("-")[1], 10),
            side,
            category,
          });
        }
      }

      const details = PUSAT_DETAIL_CATEGORIES.has(category)
        ? detailsByBucket
            .get(`${monthKey}|${k}`)
            ?.slice()
            .sort((a, b) => a.date.localeCompare(b.date))
        : undefined;
      pusatBreakdown.push({
        category,
        side,
        pusatTotal,
        autoDeductPare,
        autoDeductSemarang,
        netForAllocation,
        semarangAlloc,
        pareAlloc,
        balanced,
        unallocated,
        unbalanced,
        locked: effectiveLocked,
        details,
      });

      // Auto-deducted portion (POS QRIS) langsung dorong ke Pare tanpa
      // menunggu admin alokasi.
      if (autoDeductPare > 0) {
        addToBranch("Pare", "posQris", category, autoDeductPare, 0);
      }

      if (balanced) {
        if (side === "credit") {
          addToBranch("Semarang", "pusat", category, semarangAlloc, 0);
          addToBranch("Pare", "pusat", category, pareAlloc, 0);
        } else {
          addToBranch("Semarang", "pusat", category, 0, semarangAlloc);
          addToBranch("Pare", "pusat", category, 0, pareAlloc);
        }
      }
    }

    // Sort pusatBreakdown consistently for stable rendering.
    pusatBreakdown.sort((a, b) => {
      if (a.side !== b.side) return a.side === "credit" ? -1 : 1;
      return a.category.localeCompare(b.category);
    });

    // 3. Summarize each branch. Investment/Dividend sudah di-route ke
    //    companyNonOp di atas — jadi bag ini nggak pernah berisi
    //    keduanya, dan branch summary tidak punya Net Dividen.
    const buildBranch = (
      branchName: "Semarang" | "Pare",
      bag: Map<string, { credit: number; debit: number }>
    ): BranchPnL => {
      const byCategory: BranchCategoryBreakdown[] = [];
      let opRev = 0;
      let opExp = 0;
      let nopRev = 0;
      let nopExp = 0;
      const directBag = branchDirectAgg[branchName];
      const pusatBag = branchPusatAgg[branchName];
      const posQrisBag = branchPosQrisAgg[branchName];
      const sourceSplit = (category: string) => {
        const d = directBag.get(category) ?? { credit: 0, debit: 0 };
        const p = pusatBag.get(category) ?? { credit: 0, debit: 0 };
        const q = posQrisBag.get(category) ?? { credit: 0, debit: 0 };
        return {
          directCredit: Math.round(d.credit),
          directDebit: Math.round(d.debit),
          posQrisCredit: Math.round(q.credit),
          posQrisDebit: Math.round(q.debit),
          pusatCredit: Math.round(p.credit),
          pusatDebit: Math.round(p.debit),
        };
      };
      for (const [category, totals] of bag) {
        const isNonOp = nonOpSet.has(category);
        const bdk = `${monthKey}|${branchName}|${category}`;
        const details = branchDetailsByBucket
          .get(bdk)
          ?.slice()
          .sort((a, b) => a.date.localeCompare(b.date));
        const split = sourceSplit(category);

        if (isNonOp) {
          // Non-op tetap split asal (Wealth Transfer dst. punya arah
          // yang berarti sendiri).
          byCategory.push({
            category,
            credit: Math.round(totals.credit),
            debit: Math.round(totals.debit),
            kind: "nonop",
            ...split,
            details,
          });
          nopRev += totals.credit;
          nopExp += totals.debit;
          continue;
        }

        // Operating: NET sisi berlawanan supaya refund/koreksi
        // mengurangi total kategori di sisi alaminya.
        //   Salaries & Wages (expense): debit = pengeluaran gaji, kalau
        //   ada credit (mis. staff mengembalikan kelebihan) → kurangi.
        //   Sales Refund (expense): debit = refund dibayarkan, kalau
        //   ada credit (customer membatalkan refund) → kurangi.
        //   Sales (revenue): credit = pemasukan, debit langka di
        //   kategori revenue, tapi kalau ada (koreksi) → kurangi.
        const isExpense = debitCatSet.has(category);
        const isRevenue = creditCatSet.has(category);
        if (isExpense && !isRevenue) {
          const netDebit = totals.debit - totals.credit;
          byCategory.push({
            category,
            credit: 0,
            debit: Math.round(netDebit),
            kind: "operating",
            ...split,
            details,
          });
          opExp += netDebit;
        } else if (isRevenue && !isExpense) {
          const netCredit = totals.credit - totals.debit;
          byCategory.push({
            category,
            credit: Math.round(netCredit),
            debit: 0,
            kind: "operating",
            ...split,
            details,
          });
          opRev += netCredit;
        } else {
          // Ambiguous (muncul di kedua preset atau tidak terdaftar)
          // — tampilkan seperti semula tanpa net.
          byCategory.push({
            category,
            credit: Math.round(totals.credit),
            debit: Math.round(totals.debit),
            kind: "operating",
            ...split,
            details,
          });
          opRev += totals.credit;
          opExp += totals.debit;
        }
      }
      byCategory.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "operating" ? -1 : 1;
        const aTotal = Math.max(a.credit, a.debit);
        const bTotal = Math.max(b.credit, b.debit);
        return bTotal - aTotal;
      });
      return {
        operatingRevenue: Math.round(opRev),
        operatingExpense: Math.round(opExp),
        operatingProfit: Math.round(opRev - opExp),
        nonOpRevenue: Math.round(nopRev),
        nonOpExpense: Math.round(nopExp),
        byCategory,
      };
    };

    // Company-level Net Dividen untuk bulan ini.
    const companyCat = companyNonOp.get(monthKey) ?? new Map();
    const companyNetDividenByCategory: BranchCategoryBreakdown[] = [];
    let companyDebit = 0;
    let companyCredit = 0;
    for (const [category, totals] of companyCat) {
      const cdk = `${monthKey}|${category}`;
      const details = companyDetailsByBucket
        .get(cdk)
        ?.slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      companyNetDividenByCategory.push({
        category,
        credit: Math.round(totals.credit),
        debit: Math.round(totals.debit),
        kind: "nonop",
        // Company-level Investment/Dividend tidak punya konsep
        // "Pusat-allocated" / "POS QRIS" — semua dianggap direct
        // level-perusahaan.
        directCredit: Math.round(totals.credit),
        directDebit: Math.round(totals.debit),
        posQrisCredit: 0,
        posQrisDebit: 0,
        pusatCredit: 0,
        pusatDebit: 0,
        details,
      });
      companyDebit += totals.debit;
      companyCredit += totals.credit;
    }
    companyNetDividenByCategory.sort((a, b) => a.category.localeCompare(b.category));

    return {
      year,
      month,
      byBranch: {
        Semarang: buildBranch("Semarang", branchAgg.Semarang),
        Pare: buildBranch("Pare", branchAgg.Pare),
      },
      pusatBreakdown,
      unallocatedCount: pusatBreakdown.filter((p) => p.unallocated).length,
      unbalancedCount: pusatBreakdown.filter((p) => p.unbalanced).length,
      qrisOperasionalPare: Math.round(qrisParePerMonth.get(monthKey) ?? 0),
      companyNetDividen: Math.round(companyDebit - companyCredit),
      companyNetDividenByCategory,
      salesHint: (() => {
        if (businessUnit !== "Haengbocake") return undefined;
        const h = salesHintByMonth.get(monthKey);
        const cakeSemarang = Math.round(h?.cakeSemarang ?? 0);
        const cakePare = Math.round(h?.cakePare ?? 0);
        const posPare = Math.round(
          (posCashParePerMonth.get(monthKey) ?? 0) +
            (qrisParePerMonth.get(monthKey) ?? 0)
        );
        if (cakeSemarang === 0 && cakePare === 0 && posPare === 0) {
          return undefined;
        }
        return { cakeSemarang, cakePare, posPare };
      })(),
    };
  });

  // Reconcile drifted locks. One UPDATE per drifted row — typically
  // 0 rows on a steady page, low cost on busy days. Errors swallowed
  // so a transient DB hiccup doesn't break the report; next page load
  // tries again.
  if (pendingAutoUnlocks.size > 0) {
    await Promise.all(
      Array.from(pendingAutoUnlocks.values()).map((d) =>
        supabase
          .from("cashflow_pusat_allocations")
          .update({ locked: false, locked_pusat_total: null })
          .eq("business_unit", businessUnit)
          .eq("period_year", d.year)
          .eq("period_month", d.month)
          .eq("side", d.side)
          .eq("category", d.category)
      )
    );
  }

  return {
    businessUnit,
    from,
    to,
    months,
  };
}
