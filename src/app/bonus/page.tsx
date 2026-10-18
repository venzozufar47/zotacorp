export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { listMyBonusShares } from "@/lib/actions/bonus.actions";
import { formatRp } from "@/lib/cashflow/format";

export default async function BonusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const shares = await listMyBonusShares();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
          Bonus<span className="text-primary">.</span>
        </h1>
      </div>
      {shares.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada bonus yang terbit.</p>
      ) : (
        <div className="space-y-3">
          {shares.map((s, i) => (
            <div key={i} className="rounded-2xl border-2 border-foreground p-3 space-y-1.5 shadow-hard-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {s.branch} — {s.period}
                </span>
                {s.excluded ? (
                  <span className="text-xs text-destructive">{s.excludedReason}</span>
                ) : (
                  <span className="font-display text-xl font-extrabold tabular-nums text-success">
                    {formatRp(s.share)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Laba kotor {formatRp(s.grossProfit)} − LK dasar {formatRp(s.lkDasar)} · p={s.p}% · pengali{" "}
                {s.scorecardMultiplier.toFixed(2)} → kolam {formatRp(s.pool)}
              </p>
              <p className="text-xs text-muted-foreground">Jam hadirmu: {s.hours.toFixed(1)} jam</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
