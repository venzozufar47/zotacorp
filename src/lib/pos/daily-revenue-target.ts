import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { workingDaysInMonth } from "@/lib/scorecard/working-days";

/**
 * Target omzet harian POS = target omzet POS bulanan scorecard cabang (`scorecard_branch_targets.monthly_pos_target`)
 * dibagi jumlah hari kerja bulan itu (Senin–Sabtu, tanpa tanggal merah; sama dengan pembagi target bulanan di scorecard).
 *
 * Rekening yang cabangnya belum punya target bulanan (mis. POS Mamaya) tetap memakai nilai tetap lama
 * `bank_accounts.daily_revenue_target` (migrasi 146).
 *
 * `date` ("YYYY-MM-DD") menentukan bulan yang dipakai. Service-role: pemanggil sudah lolos gate POS/insights.
 */
export async function resolveDailyRevenueTarget(bankAccountId: string, date: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data: acc } = await admin
    .from("bank_accounts")
    .select("daily_revenue_target, default_branch")
    .eq("id", bankAccountId)
    .maybeSingle();
  const fallback = acc?.daily_revenue_target == null ? null : Number(acc.daily_revenue_target);
  if (!acc?.default_branch) return fallback;

  const { data: tr } = await admin
    .from("scorecard_branch_targets" as never)
    .select("monthly_pos_target")
    .eq("branch", acc.default_branch)
    .maybeSingle();
  const monthly = (tr as { monthly_pos_target: string | number | null } | null)?.monthly_pos_target;
  if (monthly == null || !(Number(monthly) > 0)) return fallback;

  const days = workingDaysInMonth(`${date.slice(0, 7)}-01`);
  return days > 0 ? Math.round(Number(monthly) / days) : fallback;
}
