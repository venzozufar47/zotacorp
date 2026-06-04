export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { fetchYeoboPnL } from "@/lib/cashflow/pnl-yeobo";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { PnLYeoboSpreadsheet } from "@/components/admin/finance/PnLYeoboSpreadsheet";

interface SearchParams {
  bu?: string;
  from?: string; // YYYY-MM
  to?: string; // YYYY-MM
  branch?: string;
}

function parseYM(s: string | undefined): { year: number; month: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Full-screen (no-sidebar) PnL spreadsheet for Yeobo Space. Opened in a
 * new tab from the PnL page's "Buka layar penuh" button. Mirrors the
 * Yeobo fetch in the admin PnL page but renders ONLY the spreadsheet,
 * full width, for maximum audit display.
 */
export default async function PnLSheetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const buNames = (await listBusinessUnits()).map((b) => b.name);
  const businessUnit =
    params.bu && buNames.includes(params.bu) ? params.bu : "Yeobo Space";

  // This view is Yeobo-only (per-branch operating model). If somehow
  // pointed at another BU, bounce to the normal PnL page.
  if (businessUnit !== "Yeobo Space") {
    redirect(`/admin/finance/pnl?bu=${encodeURIComponent(businessUnit)}`);
  }

  const supabase = await createClient();
  const now = new Date();
  const defaultTo = { year: now.getFullYear(), month: now.getMonth() + 1 };
  let defaultFromY = defaultTo.year;
  let defaultFromM = defaultTo.month - 11;
  while (defaultFromM < 1) {
    defaultFromM += 12;
    defaultFromY -= 1;
  }
  const from = parseYM(params.from) ?? { year: defaultFromY, month: defaultFromM };
  const to = parseYM(params.to) ?? defaultTo;

  const report = await fetchYeoboPnL(supabase, from, to);

  return (
    <PnLYeoboSpreadsheet
      businessUnit={businessUnit}
      from={from}
      to={to}
      report={report}
      initialBranch={params.branch}
      fullscreen
    />
  );
}
