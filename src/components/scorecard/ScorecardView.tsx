import { AlertTriangle } from "lucide-react";
import { ScorecardRangesInfo } from "./ScorecardRangesInfo";
import type { BranchScorecard, ScorecardBand, ScorecardMetric } from "@/lib/actions/scorecard.actions";

/**
 * Ubin berwarna penuh menurut status (lampu lalu lintas). Merah dan hijau sengaja dibuat sedikit lebih gelap dari warna
 * sistem dan ukurannya dibatasi: scorecard harus langsung terlihat, tetapi tidak boleh mengalahkan banner sapaan di atasnya.
 */
const BAND_META: Record<ScorecardBand, { label: string; tile: string }> = {
  green: { label: "Hijau", tile: "bg-[color-mix(in_srgb,var(--success)_72%,black)] text-white" },
  yellow: { label: "Kuning", tile: "bg-warning text-foreground" },
  red: { label: "Merah", tile: "bg-[color-mix(in_srgb,var(--destructive)_80%,black)] text-white" },
  measuring: { label: "Diukur", tile: "bg-muted text-muted-foreground" },
  unset: { label: "Belum diatur", tile: "bg-muted text-muted-foreground" },
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
    <div className="space-y-2.5">
      {scorecard.twoWeeksRedLabels.length > 0 && (
        <div className="flex items-start gap-2 px-1">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-destructive">Merah 2 minggu berturut-turut</p>
            <p className="text-[11.5px] leading-snug text-muted-foreground">
              {scorecard.twoWeeksRedLabels.join(", ")}. Bawa rencana perbaikan satu halaman ke rapat mingguan.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
        {scorecard.metrics.map((m) => {
          const meta = BAND_META[m.band];
          return (
            <div key={m.key} className={`relative rounded-2xl px-3.5 py-3 ${meta.tile}`}>
              <div className="flex items-start justify-between gap-1">
                <span className="text-[11.5px] font-medium leading-snug">{m.label}</span>
                <span className="-mr-2 -mt-1.5">
                  <ScorecardRangesInfo label={m.label} ranges={m.ranges} note={m.rangesNote} settings={settingsLinks?.[m.key]} onSolid />
                </span>
              </div>
              <p className="mt-0.5 font-display text-2xl font-extrabold leading-tight tabular-nums">{m.displayValue}</p>
              <p className="text-[11px] font-semibold">{meta.label}</p>
            </div>
          );
        })}
      </div>

      {/* Rincian panjang per metrik ditaruh di luar ubin supaya semua ubin tetap sama tinggi dan ringkas. */}
      {scorecard.metrics.some((m) => m.note) && (
        <div className="space-y-0.5 px-1">
          {scorecard.metrics
            .filter((m) => m.note)
            .map((m) => (
              <p key={m.key} className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold">{m.label}:</span> {m.note}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
