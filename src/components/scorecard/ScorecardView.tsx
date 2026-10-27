import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScorecardRangesInfo } from "./ScorecardRangesInfo";
import type { BranchScorecard, ScorecardBand, ScorecardMetric } from "@/lib/actions/scorecard.actions";

const BAND_META: Record<ScorecardBand, { label: string; dot: string; text: string }> = {
  green: { label: "Hijau", dot: "bg-success", text: "text-success" },
  yellow: { label: "Kuning", dot: "bg-warning", text: "text-warning" },
  red: { label: "Merah", dot: "bg-destructive", text: "text-destructive" },
  measuring: { label: "Diukur", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  unset: { label: "Belum diatur", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

export function ScorecardView({
  scorecard,
  settingsLinks,
}: {
  scorecard: BranchScorecard;
  /** Pintasan "atur target" per metrik ke halaman pengaturan aslinya (hanya halaman owner yang mengirim). */
  settingsLinks?: Partial<Record<ScorecardMetric["key"], { href: string; label: string }>>;
}) {
  return (
    <div className="space-y-4">
      {scorecard.twoWeeksRedLabels.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">
              Merah 2 minggu berturut-turut: {scorecard.twoWeeksRedLabels.join(", ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Bawa rencana perbaikan satu halaman ke rapat mingguan.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {scorecard.metrics.map((m) => {
          const meta = BAND_META[m.band];
          return (
            <Card key={m.key} className="relative overflow-visible">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-1 text-xs font-semibold text-muted-foreground">
                  <span>{m.label}</span>
                  <span className="-mr-1.5 -mt-1">
                    <ScorecardRangesInfo label={m.label} ranges={m.ranges} note={m.rangesNote} settings={settingsLinks?.[m.key]} />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className={`font-display text-2xl font-extrabold tabular-nums ${meta.text}`}>
                  {m.displayValue}
                </p>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                  <span className={`size-2 rounded-full ${meta.dot}`} /> {meta.label}
                </span>
                {m.note && <p className="text-[10.5px] text-muted-foreground">{m.note}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Abu-abu (&quot;Diukur&quot; / &quot;Belum diatur&quot;) berarti datanya belum cukup — bukan nilai buruk.
      </p>

    </div>
  );
}
