export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccountForCurrentUser } from "@/lib/actions/pos.actions";
import { getPosInsights } from "@/lib/actions/pos-insights.actions";
import { PosInsightsClient } from "@/components/pos/PosInsightsClient";

const DEFAULT_PERIOD = 30;

export default async function PosInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Insights = data sensitif (revenue, ranking produk) — hanya admin.
  // Kasir lihat detail penjualannya cukup di /pos/riwayat.
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/pos");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const sp = await searchParams;
  const parsed = Number(sp.period);
  const period = [7, 30, 90].includes(parsed) ? parsed : DEFAULT_PERIOD;

  const res = await getPosInsights(account.id, period);
  const insights = res.ok ? res.data ?? null : null;

  return (
    <PosInsightsClient
      accountName={account.accountName}
      period={period}
      insights={insights}
      error={res.ok ? null : res.error}
    />
  );
}
