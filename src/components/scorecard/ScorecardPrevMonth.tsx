import { cn } from "@/lib/utils";
import { combineWasteService, tileBand } from "@/lib/scorecard/combine";
import type { BranchScorecard, ScorecardBand, ScorecardMetric } from "@/lib/actions/scorecard.actions";

const DOT: Record<ScorecardBand, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  measuring: "bg-muted-foreground/40",
  unset: "bg-muted-foreground/40",
};
const SHORT: Record<ScorecardMetric["key"], string> = { waste: "Waste", service_level: "Service level", omzet: "Omzet", feedback: "Feedback" };

/**
 * Strip "Hasil <bulan lalu>" di bawah scorecard bulan berjalan: satu baris ringkas (tidak bisa dibuka), hanya ada pada
 * tanggal 1–7 supaya hasil bulan lalu tidak hilang tiba-tiba saat ganti bulan, tanpa menyaingi scorecard bulan ini.
 */
export function ScorecardPrevMonth({ scorecard }: { scorecard: BranchScorecard }) {
  const prev = scorecard.prevMonth;
  if (!prev) return null;
  const omzet = prev.metrics.find((m) => m.key === "omzet");
  const reds = prev.metrics.filter((m) => m.band === "red").map((m) => SHORT[m.key]);
  const summary = [
    omzet && omzet.band !== "measuring" && omzet.band !== "unset" ? `Omzet ${omzet.displayValue}` : null,
    reds.length > 0 ? `${reds.join(", ")} merah` : "tidak ada yang merah",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 px-3.5 py-2">
      <span className="flex items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Hasil {prev.label}</span>
        <span className="flex shrink-0 items-center gap-1" aria-hidden>
          {combineWasteService(prev.metrics).map((it) => (
            <span key={it.kind === "combo" ? "waste-service" : it.metric.key} className={cn("size-2.5 rounded-full", DOT[tileBand(it)])} />
          ))}
        </span>
      </span>
      <span className="block text-[11.5px] leading-snug text-muted-foreground">{summary}</span>
    </div>
  );
}
