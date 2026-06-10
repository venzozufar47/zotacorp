import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import { cashSlugForAccount } from "@/lib/cashflow/cash-branches";

/**
 * Akses cashflow milik user saat ini — React cache() supaya layout
 * (admin)/(employee) dan page finance yang memanggil berkali-kali dalam
 * SATU request berbagi satu round-trip (pola yang sama dengan
 * src/lib/yeobo-booth/access.ts). Request-scoped, bukan lintas-request.
 */

/**
 * Rekening yang di-assign ke user (scope='full' saja — pos_only tidak
 * relevan untuk landing /admin/finance).
 */
export const listMyAssignedBankAccountIds = cache(
  async (): Promise<string[]> => {
    const user = await getCurrentUser();
    if (!user) return [];
    const supabase = await createClient();
    const { data } = await supabase
      .from("bank_account_assignees")
      .select("bank_account_id")
      .eq("user_id", user.id)
      .eq("scope", "full");
    return (data ?? []).map((r) => r.bank_account_id);
  }
);

/**
 * True kalau user di-assign ke minimal satu rekening cash yang PUNYA
 * dashboard kas cabang (registry CASH_DASHBOARDS: 3 cabang Yeobo +
 * Haengbocake Semarang). Dipakai untuk menampilkan tab "Kas" hanya ke
 * kasir cabang ber-dashboard — bukan ke assignee finance lain (mis.
 * cash Pare yang dikelola via POS) yang tetap pakai tab Keuangan biasa.
 */
export const hasAssignedCashDashboard = cache(async (): Promise<boolean> => {
  const ids = await listMyAssignedBankAccountIds();
  if (ids.length === 0) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("business_unit, default_branch")
    .in("id", ids)
    .eq("bank", "cash");
  return (data ?? []).some(
    (a) => cashSlugForAccount(a.business_unit, a.default_branch) !== null
  );
});
