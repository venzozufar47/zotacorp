/**
 * Transaction category presets per business unit. The editor table
 * swaps the free-text category cell for a dropdown when the BU has a
 * defined list, scoped separately to credit (uang masuk) vs debit
 * (uang keluar) so admins get the right short-list on each row.
 *
 * Adding a new BU: register its credit/debit arrays in
 * `BU_CATEGORY_PRESETS` below. Rows saved with a category that's not
 * in the list still display (we store whatever was persisted) — the
 * dropdown just becomes the shortlist + "keep custom" option.
 */

export const HAENGBOCAKE_CREDIT_CATEGORIES = [
  "Sales",
  "Cake Delivery",
  "Decor Class",
  "Other Revenue",
  "Investment",
  "Wealth Transfer",
] as const;

export const HAENGBOCAKE_DEBIT_CATEGORIES = [
  "Cost of Goods Sold",
  "Office Supplies",
  "Shipping Cost",
  "Advertising",
  "Bank Administration",
  "Utilities",
  "Maintenance",
  "Asset Investment",
  "Subscription",
  "Salaries & Wages",
  "Rent",
  "Sales Refund",
  "Dividend",
  "Wealth Transfer",
] as const;

export const HAENGBOCAKE_BRANCHES = ["Pusat", "Semarang", "Pare"] as const;

/**
 * Flat category list for cash rekening under Haengbocake.
 * Cash flow at register-level doesn't follow accounting-style
 * credit/debit split — the same label (e.g. "Pinjaman") applies
 * whether money comes in or goes out. The preset is returned as
 * both credit and debit lists from `getCategoryPresets` below so
 * the UI renders the same choices on either side.
 */
/**
 * Kategori cashflow yang dipakai POS saat menulis cashflow_transactions.
 * Dipisah sebagai konstanta supaya label di action + UI + dropdown
 * custom per-rekening (cash Pare) tetap identik — kalau string drift,
 * row POS tidak cocok dengan option di dropdown dan admin perlu
 * re-categorize manual.
 */
export const POS_CASH_CATEGORY = "Cash" as const;
export const POS_QRIS_CATEGORY = "QRIS (non-operasional)" as const;

export const HAENGBOCAKE_CASH_CATEGORIES = [
  "Haengbo Cust",
  "Haengbo Non-Cust",
  "Pinjaman Mamaya",
  "Pinjaman",
  "Slice Haengbo",
  "Penyesuaian",
  "Diambil mas Venzo",
] as const;

/**
 * Categories treated as NON-operating in the Profit & Loss report
 * and the rekening category breakdown: wealth transfers between
 * owned accounts, investments put in, dividends paid out, and loans
 * (Pinjaman* on the cash ledger — borrowing/repaying money isn't
 * operational revenue/expense). These are cash flows but not
 * reflective of operating performance, so they're bucketed
 * separately from the revenue/expense totals used to compute
 * operating profit.
 */
export const HAENGBOCAKE_NON_OPERATING_CATEGORIES = [
  "Wealth Transfer",
  "Investment",
  "Dividend",
  "Pinjaman",
  "Pinjaman Mamaya",
  // QRIS proceeds hit cash Pare as a credit, but the actual bank
  // settlement for the same QRIS money lands on the Mandiri rekening
  // as "Sales" — counting both sides would double-book revenue.
  "QRIS (non-operasional)",
] as const;

export function getNonOperatingCategories(bu: string): readonly string[] {
  if (bu === "Haengbocake") return HAENGBOCAKE_NON_OPERATING_CATEGORIES;
  return [];
}

/**
 * Map cash-rekening category labels to the unified PnL vocabulary
 * used by bank rekening. Cash ledger uses register-level labels
 * (Haengbo Cust, Slice Haengbo, Diambil mas Venzo, …) while bank
 * ledger uses accounting-style labels (Sales, Dividend, …). The PnL
 * aggregator needs a single name per bucket so revenue/expense sums
 * combine across rekening.
 *
 * Unknown or ambiguous labels (Penyesuaian, Pinjaman variants) pass
 * through unchanged — the former is admin-classified manually, the
 * latter is already handled by the non-operating set.
 */
const HAENGBOCAKE_CATEGORY_NORMALIZATION: Record<string, string> = {
  "Haengbo Cust": "Sales",
  "Haengbo Non-Cust": "Sales",
  "Slice Haengbo": "Sales",
  "Diambil mas Venzo": "Dividend",
};

export function normalizePnLCategory(
  businessUnit: string,
  category: string | null
): string {
  const raw = (category ?? "").trim();
  if (!raw) return "(tanpa kategori)";
  if (businessUnit === "Haengbocake") {
    return HAENGBOCAKE_CATEGORY_NORMALIZATION[raw] ?? raw;
  }
  return raw;
}

/**
 * Expense categories that support an "effective period" override —
 * the transaction physically settles on one date but should be
 * attributed to a different accounting month. Rent is often paid
 * before/after the month it covers; payroll is sometimes paid on the
 * 1st of the following month but belongs to the prior month.
 *
 * Only categories in this set render the month-override UI in the
 * cashflow editor; the PnL aggregator respects whatever override is
 * persisted regardless of category, because admins could reclassify
 * later.
 */
export const ACCRUAL_ELIGIBLE_CATEGORIES = [
  "Rent",
  "Salaries & Wages",
] as const;

export function isAccrualEligible(category: string | null): boolean {
  if (!category) return false;
  return (ACCRUAL_ELIGIBLE_CATEGORIES as readonly string[]).includes(category);
}

export interface CategoryPresets {
  credit: readonly string[];
  debit: readonly string[];
  branches: readonly string[];
}

const BU_CATEGORY_PRESETS: Record<string, CategoryPresets> = {
  Haengbocake: {
    credit: HAENGBOCAKE_CREDIT_CATEGORIES,
    debit: HAENGBOCAKE_DEBIT_CATEGORIES,
    branches: HAENGBOCAKE_BRANCHES,
  },
};

/**
 * Return credit + debit + branch shortlists for the given (business
 * unit, bank) pair. Cash rekening under Haengbocake use a different,
 * flat list; every other combination falls back to the accounting
 * split. Unknown BU → empty lists (editor renders free-text input +
 * hides branch column).
 */
export function getCategoryPresets(
  businessUnit: string,
  bank?: string
): CategoryPresets {
  if (businessUnit === "Haengbocake" && bank === "cash") {
    return {
      credit: HAENGBOCAKE_CASH_CATEGORIES,
      debit: HAENGBOCAKE_CASH_CATEGORIES,
      branches: HAENGBOCAKE_BRANCHES,
    };
  }
  return (
    BU_CATEGORY_PRESETS[businessUnit] ?? {
      credit: [],
      debit: [],
      branches: [],
    }
  );
}
