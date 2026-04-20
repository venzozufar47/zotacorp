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
 * Categories treated as NON-operating in the Profit & Loss report:
 * wealth transfers between accounts, investments put in, dividends
 * paid out. These are cash flows but not reflective of operating
 * performance, so the PnL view bucketizes them separately from
 * revenue/expense totals used to compute operating profit.
 */
export const HAENGBOCAKE_NON_OPERATING_CATEGORIES = [
  "Wealth Transfer",
  "Investment",
  "Dividend",
] as const;

export function getNonOperatingCategories(bu: string): readonly string[] {
  if (bu === "Haengbocake") return HAENGBOCAKE_NON_OPERATING_CATEGORIES;
  return [];
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
