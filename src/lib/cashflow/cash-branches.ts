/**
 * Cash dashboard per-cabang Yeobo Space — peta slug ↔ cabang + daftar
 * kategori untuk form input. Modul PURE (tanpa import server/Supabase)
 * supaya aman dipakai di komponen client maupun server.
 *
 * Slug mengikuti short-code internal Yeobo (lihat YEOBO_TWO_BRANCH_SENTINELS
 * di categories.ts): Yeosari=Tlogosari, Yeotem=Tembalang, Yeosol=Jebres.
 */
import {
  YEOBO_SPACE_CREDIT_CATEGORIES,
  YEOBO_SPACE_DEBIT_CATEGORIES,
} from "@/lib/cashflow/categories";

export const CASH_BRANCH_BY_SLUG = {
  cash_yeosari: "Tlogosari",
  cash_yeotem: "Tembalang",
  cash_yeosol: "Jebres",
} as const;

export type CashBranchSlug = keyof typeof CASH_BRANCH_BY_SLUG;

export const CASH_SLUG_BY_BRANCH: Record<string, CashBranchSlug> = {
  Tlogosari: "cash_yeosari",
  Tembalang: "cash_yeotem",
  Jebres: "cash_yeosol",
};

export function branchForCashSlug(slug: string): string | null {
  return (CASH_BRANCH_BY_SLUG as Record<string, string>)[slug] ?? null;
}

/** Slug halaman cash untuk sebuah cabang (mis. "Tlogosari" → "cash_yeosari"). */
export function cashSlugForBranch(branch: string): CashBranchSlug | null {
  return CASH_SLUG_BY_BRANCH[branch] ?? null;
}

// Kategori pilihan di form. Sumber sama dengan rekening BCA/Mandiri Yeobo
// (categories.ts). Buang sentinel "Needs Assignment" (bukan kategori riil).
export const CASH_INCOME_CATEGORIES: readonly string[] =
  YEOBO_SPACE_CREDIT_CATEGORIES.filter((c) => c !== "Needs Assignment");

export const CASH_EXPENSE_CATEGORIES: readonly string[] =
  YEOBO_SPACE_DEBIT_CATEGORIES.filter((c) => c !== "Needs Assignment");
