import { AlertTriangle, CheckCircle2, CircleDashed, XCircle, type LucideIcon } from "lucide-react";
import { ScorecardRangesInfo } from "./ScorecardRangesInfo";
import type { BranchScorecard, ScorecardBand, ScorecardMetric } from "@/lib/actions/scorecard.actions";

/**
 * Ubin lampu lalu lintas dengan kedalaman: gradasi searah (gelap → terang) seperti banner sapaan, cincin tipis di tepi
 * dalam, ikon status besar yang samar sebagai watermark, dan label status berikon (warna bukan satu-satunya penanda).
 * Ukuran angka dibatasi supaya scorecard terlihat jelas tetapi tidak mengalahkan banner di atasnya.
 */
const BAND_META: Record<ScorecardBand, { label: string; Icon: LucideIcon; tile: string; chip: string }> = {
  green: {
    label: "Hijau",
    Icon: CheckCircle2,
    tile: "bg-gradient-to-br from-[color-mix(in_srgb,var(--success)_58%,black)] to-[color-mix(in_srgb,var(--success)_80%,black)] text-white shadow-[0_8px_18px_-10px_color-mix(in_srgb,var(--success)_80%,black)]",
    chip: "bg-white/20 text-white",
  },
  yellow: {
    label: "Kuning",
    Icon: AlertTriangle,
    tile: "bg-gradient-to-br from-[color-mix(in_srgb,var(--warning)_92%,white)] to-warning text-foreground shadow-[0_8px_18px_-10px_var(--warning)]",
    chip: "bg-black/10 text-foreground",
  },
  red: {
    label: "Merah",
    Icon: XCircle,
    tile: "bg-gradient-to-br from-[color-mix(in_srgb,var(--destructive)_66%,black)] to-[color-mix(in_srgb,var(--destructive)_90%,black)] text-white shadow-[0_8px_18px_-10px_color-mix(in_srgb,var(--destructive)_85%,black)]",
    chip: "bg-white/20 text-white",
  },
  measuring: { label: "Diukur", Icon: CircleDashed, tile: "bg-muted text-muted-foreground", chip: "bg-black/5 text-muted-foreground" },
  unset: { label: "Belum diatur", Icon: CircleDashed, tile: "bg-muted text-muted-foreground", chip: "bg-black/5 text-muted-foreground" },
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
