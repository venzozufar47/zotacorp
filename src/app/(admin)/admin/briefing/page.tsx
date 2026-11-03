export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, CalendarDays, ChevronDown } from "lucide-react";
import { getCurrentRole } from "@/lib/supabase/cached";
import { listRecentHuddles, type MinutesBranch } from "@/lib/actions/team-minutes.actions";
import { serverNowMs } from "@/lib/leave/constants";
import { jakartaDateString } from "@/lib/utils/jakarta";
import type { HuddleView } from "@/lib/actions/team-minutes.actions";
import { briefingDateLabel, briefingTimeLabel } from "@/lib/team/briefing-labels";
import { cn } from "@/lib/utils";

const BRANCHES: MinutesBranch[] = ["Pare", "Semarang"];

function dateLabel(date: string) {
  return `${briefingDateLabel(date)} ${date.slice(0, 4)}`;
}

function BriefingContent({ briefing }: { briefing: HuddleView }) {
  return (
    <dl className="space-y-4 text-sm leading-relaxed">
      {[
        ["Target dan fokus", briefing.targetToday],
        ["Kendala kemarin", briefing.yesterdayBlocker],
        ["Tanya jawab / pembagian tugas", briefing.whoHoldsWhat],
      ].map(([label, content]) => content ? (
        <div key={label}>
          <dt className="mb-1 text-xs font-semibold text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-wrap break-words text-foreground">{content}</dd>
        </div>
      ) : null)}
    </dl>
  );
}

/**
 * Superadmin — Briefing Kilat: briefing terakhir tiap cabang, dan
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
  const [all, ...latestByBranch] = await Promise.all([
    listRecentHuddles(120, filter ?? undefined),
    ...BRANCHES.map((branch) => listRecentHuddles(1, branch)),
  ]);
  const todayYmd = jakartaDateString(new Date(serverNowMs()));
  const latestIds = new Set(latestByBranch.flat().map((b) => b.id));
  const rows = all.filter((b) => !latestIds.has(b.id));

  return (
    <div className="space-y-8 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Briefing Kilat</h1>
        <p className="text-sm text-muted-foreground">
          Briefing terakhir tiap cabang, kapan pun dicatat. Laporan sebelumnya tersedia di arsip.
        </p>
      </div>

      <section aria-label="Briefing terakhir per cabang" className="grid items-start gap-4 xl:grid-cols-2">
        {BRANCHES.map((b, index) => {
          const t = latestByBranch[index][0];
          return (
            <article key={b} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="space-y-3 border-b border-border bg-muted/30 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{b}</h2>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Briefing terakhir</span>
                </div>
                {t ? (
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <CalendarDays size={16} aria-hidden className="shrink-0 text-primary" />
                      <time dateTime={t.huddleDate}>{dateLabel(t.huddleDate)}</time>
                      {t.huddleDate === todayYmd && <span className="text-xs font-normal text-muted-foreground">Hari ini</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dicatat oleh {t.postedByName ?? "—"} · {dateLabel(jakartaDateString(new Date(t.createdAt)))} · {briefingTimeLabel(t.createdAt)} WIB
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada briefing tercatat untuk cabang ini.</p>
                )}
              </div>
              {t && <div className="p-5"><BriefingContent briefing={t} /></div>}
            </article>
          );
        })}
      </section>

      <details key={filter ?? "semua"} open={filter !== null} className="group rounded-2xl border border-border bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <Archive size={18} aria-hidden className="shrink-0 text-muted-foreground" />
          <span className="flex-1 font-display text-sm font-semibold">Arsip briefing <span className="font-sans font-normal text-muted-foreground">· {rows.length} laporan sebelumnya</span></span>
          <ChevronDown size={18} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Cabang</span>
            {[null, ...BRANCHES].map((b) => (
              <Link
                key={b ?? "semua"}
                href={b ? `/admin/briefing?cabang=${b}` : "/admin/briefing"}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              Belum ada briefing sebelumnya{filter ? ` untuk ${filter}` : ""}.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((b) => (
                <details key={b.id} className="rounded-xl border border-border bg-card">
                  <summary className="min-h-11 cursor-pointer p-3 text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">{dateLabel(b.huddleDate)}</span>
                      {" · "}
                      {b.branch}
                    </span>
                    <span className="ml-2">
                      {b.postedByName ?? "—"}
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-border p-4">
                    <p className="text-xs text-muted-foreground">Dicatat {dateLabel(jakartaDateString(new Date(b.createdAt)))} · {briefingTimeLabel(b.createdAt)} WIB</p>
                    <BriefingContent briefing={b} />
                  </div>
                </details>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Menampilkan hingga 120 laporan terbaru{filter ? ` cabang ${filter}` : ""}. Briefing terakhir ditampilkan di atas.</p>
        </div>
      </details>
    </div>
  );
}
