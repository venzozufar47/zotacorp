export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { getCurrentRole } from "@/lib/supabase/cached";
import { listRecentHuddles, type MinutesBranch } from "@/lib/actions/team-minutes.actions";
import { serverNowMs } from "@/lib/leave/constants";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { BriefingBody } from "@/components/team/TeamBriefingPanel";
import { briefingDateLabel, briefingTimeLabel } from "@/lib/team/briefing-labels";
import { cn } from "@/lib/utils";

const BRANCHES: MinutesBranch[] = ["Pare", "Semarang"];

/**
 * Superadmin — Briefing Kilat: apakah tiap cabang sudah briefing hari ini, dan
 * riwayat notulensinya. Ditulis kepala tim lewat halaman Tim; di sini hanya
 * dibaca. `?cabang=` menyaring riwayat.
 */
export default async function AdminBriefingPage({
  searchParams,
}: {
  searchParams: Promise<{ cabang?: string }>;
}) {
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const { cabang } = await searchParams;
  const filter = BRANCHES.find((b) => b === cabang) ?? null;
  const all = await listRecentHuddles(120);
  const todayYmd = jakartaDateString(new Date(serverNowMs()));
  const rows = filter ? all.filter((b) => b.branch === filter) : all;

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Briefing Kilat</h1>
        <p className="text-sm text-muted-foreground">
          Status briefing hari ini per cabang dan riwayat notulensinya. Dicatat kepala tim dari
          halaman Tim.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {BRANCHES.map((b) => {
          const t = all.find((x) => x.branch === b && x.huddleDate === todayYmd);
          return (
            <div key={b} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              {t ? (
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" />
              ) : (
                <Circle size={20} className="mt-0.5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 space-y-1">
                <p className="font-display text-sm font-bold">
                  {b} — {t ? "sudah briefing" : "belum briefing hari ini"}
                </p>
                {t ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {t.postedByName ?? "—"} · {briefingTimeLabel(t.createdAt)}
                    </p>
                    <BriefingBody b={t} />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Belum ada catatan dari kepala tim.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted-foreground">Riwayat:</span>
        {[null, ...BRANCHES].map((b) => (
          <Link
            key={b ?? "semua"}
            href={b ? `/admin/briefing?cabang=${b}` : "/admin/briefing"}
            className={cn(
              "rounded-full border-2 px-3 py-1 text-xs font-semibold transition",
              b === filter
                ? "border-foreground bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-foreground/60"
            )}
          >
            {b ?? "Semua"}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Belum ada briefing kilat tercatat.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <article key={b.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{briefingDateLabel(b.huddleDate)}</span>
                  {" · "}
                  {b.branch}
                </span>
                <span>
                  {b.postedByName ?? "—"} · {briefingTimeLabel(b.createdAt)}
                </span>
              </div>
              <BriefingBody b={b} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
