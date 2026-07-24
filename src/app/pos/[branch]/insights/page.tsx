export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccount } from "@/lib/actions/pos.actions";
import { getPosInsights } from "@/lib/actions/pos-insights.actions";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { PosInsightsClient } from "@/components/pos/PosInsightsClient";
import {
  jakartaDateMinusDays,
  jakartaDateString,
} from "@/lib/utils/jakarta";

const DEFAULT_PERIOD = 30;
const MAX_DAYS = 366;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve the active range from URL searchParams. Three sources:
 *
 * 1. Both `?from` & `?to` valid → custom range.
 * 2. Only `?period=N` (legacy 7/30/90 → today links) → preset.
 * 3. Empty / invalid → fall back to 30 hari.
 *
 * Range terlebar dibatasi ke 1 tahun supaya admin tidak iseng minta
 * "sejak forever" di URL.
 */
function resolveRange(sp: { from?: string; to?: string; period?: string }): {
  from: string;
  to: string;
} {
  const today = jakartaDateString(new Date());
  if (sp.from && sp.to && ISO_DATE.test(sp.from) && ISO_DATE.test(sp.to)) {
    let from = sp.from;
    let to = sp.to;
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    // Clamp width.
    const widthMs =
      new Date(to + "T00:00:00Z").getTime() -
      new Date(from + "T00:00:00Z").getTime();
    const widthDays = Math.round(widthMs / 86_400_000) + 1;
    if (widthDays > MAX_DAYS) {
      from = jakartaDateMinusDays(to, MAX_DAYS - 1);
    }
    return { from, to };
  }
  const parsed = Number(sp.period);
  const period = [7, 30, 90].includes(parsed) ? parsed : DEFAULT_PERIOD;
  return { to: today, from: jakartaDateMinusDays(today, period - 1) };
}

export default async function PosInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/pospare");
  const basePath = posBasePath(branchParam);

  const user = await getCurrentUser();
  if (!user) redirect("/");

  // Insights = data sensitif (revenue, ranking produk) — hanya admin.
  // Kasir lihat detail penjualannya cukup di riwayat.
  const role = await getCurrentRole();
  if (role !== "admin") redirect(basePath);

  const account = await findPosAccount(branch);
  if (!account) redirect("/");

  const sp = await searchParams;
  const range = resolveRange(sp);

  const res = await getPosInsights(account.id, range);
  const insights = res.ok ? res.data ?? null : null;

  return (
    <PosInsightsClient
      accountName={account.accountName}
      basePath={basePath}
      range={range}
      insights={insights}
      error={res.ok ? null : res.error}
      isAdmin
    />
  );
}
