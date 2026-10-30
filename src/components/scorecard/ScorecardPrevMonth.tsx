import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScorecardView } from "./ScorecardView";
import { combineWasteService, tileBand } from "@/lib/scorecard/combine";
import type { BranchScorecard, ScorecardBand, ScorecardMetric } from "@/lib/actions/scorecard.actions";

const DOT: Record<ScorecardBand, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  measuring: "bg-muted-foreground/40",
  unset: "bg-muted-foreground/40",
};
const SHORT: Record<ScorecardMetric["key"], string> = { waste: "Waste", service_level: "Service level", omzet: "Omzet", complaints: "Keluhan" };

/**
 * Strip "Hasil <bulan lalu>" di bawah scorecard bulan berjalan: terlipat (satu baris), hanya ada pada tanggal 1–7 supaya
 * hasil bulan lalu tidak hilang tiba-tiba saat ganti bulan dan bisa dievaluasi, tanpa menyaingi scorecard bulan ini.
 * Memakai <details> bawaan HTML: tanpa JavaScript tambahan.
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
    <details className="group rounded-2xl border border-border/70 bg-card/60">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[12.5px]">
            <span className="font-semibold">Hasil {prev.label}</span>
            <span className="flex shrink-0 items-center gap-1" aria-hidden>
              {combineWasteService(prev.metrics).map((it) => (
                <span key={it.kind === "combo" ? "waste-service" : it.metric.key} className={cn("size-2.5 rounded-full", DOT[tileBand(it)])} />
              ))}
            </span>
          </span>
          <span className="block text-[11.5px] leading-snug text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-border/60 p-3">
        <ScorecardView scorecard={{ ...scorecard, metrics: prev.metrics, twoWeeksRedLabels: [] }} />
        <p className="px-1 text-[10.5px] text-muted-foreground">Hasil akhir {prev.label}. Ringkasan ini hilang otomatis setelah tanggal 7.</p>
      </div>
    </details>
  );
}
