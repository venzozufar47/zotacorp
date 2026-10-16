"use client";

import { FIX_MONITOR_DAYS, fixProgress, type SopFixRow } from "@/lib/cleaning/sop-findings";
import { Pill, SectionLabel, fmtDay } from "./shared";
import { useSop } from "./SopProvider";

/**
 * Loop perbaikan SOP: temuan → SOP diubah → dipantau 7 hari kerja → evaluasi. Angka "sesudah"
 * dihitung langsung dari laporan (kepatuhan titik sejak hari perbaikan), bukan disimpan, jadi
 * selalu sama dengan yang tampil di tempat lain.
 */
export function FixLoop({ fixes }: { fixes: SopFixRow[] }) {
  const { pointOf, branchName, titleOf } = useSop();
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-[15px] font-bold">Perbaikan SOP yang dipantau</h2>
        <span className="text-[11.5px] text-muted-foreground">Efeknya dievaluasi setelah {FIX_MONITOR_DAYS} hari kerja</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {fixes.length === 0 && (
          <p className="px-4 py-4 text-[12.5px] text-muted-foreground">
            Belum ada perbaikan SOP. Bila akar masalahnya ada di SOP atau titiknya, pilih <b>Perbaiki SOP</b> pada sebuah temuan.
          </p>
        )}
        {fixes.slice(0, 8).map((x) => {
          const pr = fixProgress(x, pointOf(x.itemId));
          const tone = pr.done ? (pr.effective ? "ok" : "warn") : "muted";
          return (
            <div key={x.id} className="flex flex-col gap-2.5 border-t border-border px-4 py-3 first:border-t-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <b className="font-display text-[13px]">
                    {titleOf(x.itemId)} <span className="font-normal text-muted-foreground">— {branchName(x.branchKey)}</span>
                  </b>
                  <div className="mt-0.5 text-[12px]">{x.action}</div>
                  {x.note && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{x.note}</div>}
                </div>
                <Pill tone={tone}>{pr.done ? (pr.effective ? "Efektif" : "Belum efektif") : `Memantau ${pr.days}/${FIX_MONITOR_DAYS} hari`}</Pill>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Step on>Temuan</Step>
                <Dash />
                <Step on>SOP diubah · {fmtDay(x.startedOn)}</Step>
                <Dash />
                <Step on={pr.done} cur={!pr.done}>
                  Pantau {pr.days}/{FIX_MONITOR_DAYS}
                </Step>
                <Dash />
                <Step on={pr.done}>Evaluasi</Step>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                  Sebelum (14 hari)
                  <b className="block font-display text-xl text-foreground tabular-nums">{x.basePct}%</b>
                </div>
                <div className="rounded-xl bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                  Sesudah ({pr.days} hari)
                  <b className="block font-display text-xl text-foreground tabular-nums">
                    {pr.afterPct != null ? `${pr.afterPct}%` : "—"}{" "}
                    {pr.delta != null && (
                      <span className={`text-xs ${pr.delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {pr.delta >= 0 ? "+" : ""}
                        {pr.delta}
                      </span>
                    )}
                  </b>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {fixes.length > 8 && <SectionLabel className="px-1">+{fixes.length - 8} perbaikan lama tidak ditampilkan</SectionLabel>}
    </section>
  );
}

function Step({ children, on, cur }: { children: React.ReactNode; on?: boolean; cur?: boolean }) {
  return (
    <b className="inline-flex items-center gap-1.5 font-semibold">
      <i className={`size-2 rounded-full ${on ? "bg-emerald-500" : cur ? "bg-amber-400" : "bg-muted-foreground/30"}`} />
      {children}
    </b>
  );
}
const Dash = () => <hr className="min-w-[10px] flex-1 border-0 border-t border-dashed border-border" />;
