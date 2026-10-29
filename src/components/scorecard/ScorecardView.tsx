import { AlertTriangle } from "lucide-react";
import { TILE_STYLE, type TileTone } from "./tile-styles";
import { ScorecardRangesInfo } from "./ScorecardRangesInfo";
import type { BranchScorecard, ScorecardBand, ScorecardMetric } from "@/lib/actions/scorecard.actions";

/** Label per band; gaya ubinnya dipakai bersama dengan scorecard sosmed (tile-styles). */
const BAND_META: Record<ScorecardBand, { label: string } & (typeof TILE_STYLE)[TileTone]> = {
  green: { label: "Hijau", ...TILE_STYLE.green },
  yellow: { label: "Kuning", ...TILE_STYLE.yellow },
  red: { label: "Merah", ...TILE_STYLE.red },
  measuring: { label: "Diukur", ...TILE_STYLE.neutral },
  unset: { label: "Belum diatur", ...TILE_STYLE.neutral },
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
              Bawa rencana perbaikan ke rapat harian/mingguan.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
        {scorecard.metrics.map((m, i) => {
          const meta = BAND_META[m.band];
          const Icon = meta.Icon;
          // "Belum ada data" dan sejenisnya bukan angka: tampil lebih kecil supaya tidak meluap.
          const isText = m.displayValue.length > 7;
          return (
            <div
              key={m.key}
              className={`animate-fade-up relative rounded-3xl px-3.5 py-3 ring-1 ring-inset ring-white/15 has-[button[aria-expanded=true]]:z-30 ${meta.tile}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Watermark dipotong di pembungkusnya sendiri; ubin tidak boleh overflow-hidden karena panduan ⓘ muncul di dalamnya. */}
              <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <Icon size={64} strokeWidth={1.5} className="absolute -bottom-3 -right-3 opacity-[0.14]" />
              </span>
              <div className="relative flex items-start justify-between gap-1">
                <span className="text-[11.5px] font-medium leading-snug">{m.label}</span>
                <span className="-mr-2 -mt-1.5">
                  <ScorecardRangesInfo label={m.label} ranges={m.ranges} note={m.rangesNote} settings={settingsLinks?.[m.key]} onSolid />
                </span>
              </div>
              <p className={`relative mt-1 font-display font-extrabold leading-tight tabular-nums ${isText ? "text-lg" : "text-[28px]"}`}>{m.displayValue}</p>
              <span className={`relative mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
                <Icon aria-hidden size={12} strokeWidth={2.5} />
                {meta.label}
              </span>
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
