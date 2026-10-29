"use client";

import { useId } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeUnitCard, HomeMetricCell } from "@/lib/unit-scorecard/persist";
import type { MetricChange } from "@/lib/unit-scorecard/changes";
import {
  METRIC_STATUS_LABEL,
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_TEXT,
  STATUS_TONE,
  TONE_ARROW,
  formatBound,
  formatDelta,
  formatMetricValue,
} from "./format";

export function StatusBadge({ status, className }: { status: HomeUnitCard["status"]; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none", STATUS_TONE[status], className)}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {status === "incomplete" ? "Belum lengkap" : STATUS_LABEL[status]}
    </span>
  );
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthShort = (iso: string) => MONTH_SHORT[Number(iso.slice(5, 7)) - 1] ?? iso;

const LINE_COLOR: Record<string, string> = {
  green: "var(--success, #16a34a)",
  yellow: "var(--warning, #d97706)",
  red: "var(--destructive, #dc2626)",
  incomplete: "var(--muted-foreground, #6b7280)",
  not_assessed: "var(--muted-foreground, #6b7280)",
};

/**
 * Grafik garis tren sebuah metrik (periode lama → baru). Nilai kosong memutus garis. Garis putus-putus hijau/merah
 * menandai ambang, hanya digambar bila masih dalam jangkauan data (supaya garis tidak gepeng oleh ambang yang jauh).
 * Bila kedua ambang diketahui, garis dan titik diwarnai menurut zonanya (bagian yang melewati ambang hijau berwarna
 * hijau, di antara ambang kuning, melewati ambang merah merah), bukan satu warna menurut status bulan terakhir.
 */
export function TrendChart({
  values,
  months,
  status,
  green,
  red,
  direction,
}: {
  values: (number | null)[];
  months: string[];
  status: HomeMetricCell["status"];
  green: number | null;
  red: number | null;
  direction?: HomeMetricCell["direction"];
}) {
  const gradId = useId();
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) {
    return <div className="grid h-[72px] place-items-center rounded-lg bg-muted/40 text-[10.5px] text-muted-foreground">Belum cukup periode untuk tren</div>;
  }
  const W = 240;
  const H = 64;
  const padX = 8;
  const padY = 8;
  // Skala dijangkarkan pada ambang: ambang yang diketahui selalu ikut dalam rentang (bukan hanya data), supaya jarak ke
  // ambang terbaca benar dan zigzag kecil di dalam satu zona tidak tampak seperti lonjakan. Data di luar ambang memperlebar rentang.
  const anchors = [green, red].filter((t): t is number => t != null);
  const lo = Math.min(...pts.map((p) => p.v), ...anchors);
  const hi = Math.max(...pts.map((p) => p.v), ...anchors);
  const span = hi - lo || Math.max(Math.abs(hi) * 0.1, 1);
  const min = lo - span * 0.25;
  const max = hi + span * 0.25;
  const x = (i: number) => padX + (values.length === 1 ? 0 : (i / (values.length - 1)) * (W - padX * 2));
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (H - padY * 2);
  const color = LINE_COLOR[status] ?? LINE_COLOR.not_assessed;
  // Pewarnaan per zona hanya bila arah dan kedua ambang diketahui; selain itu satu warna menurut status.
  const zoned = direction != null && green != null && red != null;
  const lowerBetter = direction === "lower_better";
  const zoneOf = (v: number): "green" | "yellow" | "red" =>
    lowerBetter ? (v <= green! ? "green" : v > red! ? "red" : "yellow") : v >= green! ? "green" : v < red! ? "red" : "yellow";
  const dotColor = (v: number) => (zoned ? LINE_COLOR[zoneOf(v)] : color);
  // Gradien dengan perhentian keras di tinggi kedua ambang: garis berganti warna tepat saat melintasi ambang.
  const off = (t: number) => Math.min(1, Math.max(0, y(t) / H));
  const gradient = zoned
    ? lowerBetter
      ? [
          { o: 0, c: LINE_COLOR.red },
          { o: off(red!), c: LINE_COLOR.red },
          { o: off(red!), c: LINE_COLOR.yellow },
          { o: off(green!), c: LINE_COLOR.yellow },
          { o: off(green!), c: LINE_COLOR.green },
          { o: 1, c: LINE_COLOR.green },
        ]
      : [
          { o: 0, c: LINE_COLOR.green },
          { o: off(green!), c: LINE_COLOR.green },
          { o: off(green!), c: LINE_COLOR.yellow },
          { o: off(red!), c: LINE_COLOR.yellow },
          { o: off(red!), c: LINE_COLOR.red },
          { o: 1, c: LINE_COLOR.red },
        ]
    : null;
  // Segmen terpisah bila ada nilai kosong di tengah.
  const segments: { v: number; i: number }[][] = [];
  let cur: { v: number; i: number }[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push({ v, i });
  });
  if (cur.length) segments.push(cur);
  const last = pts[pts.length - 1];
  const inRange = (t: number | null) => t != null && t >= min && t <= max;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full" role="img" aria-label={`Tren ${months.map(monthShort).join(", ")}`}>
        {gradient && (
          <defs>
            <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
              {gradient.map((g, k) => (
                <stop key={k} offset={g.o} stopColor={g.c} />
              ))}
            </linearGradient>
          </defs>
        )}
        {inRange(green) && <line x1={padX} x2={W - padX} y1={y(green!)} y2={y(green!)} stroke={LINE_COLOR.green} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />}
        {inRange(red) && <line x1={padX} x2={W - padX} y1={y(red!)} y2={y(red!)} stroke={LINE_COLOR.red} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />}
        {segments.map((seg, k) => (
          <polyline key={k} points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} fill="none" stroke={gradient ? `url(#${gradId})` : color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p.i === last.i ? 3.5 : 2} fill={dotColor(p.v)} />
        ))}
      </svg>
      <div className="mt-0.5 flex justify-between px-1 text-[9.5px] text-muted-foreground">
        {months.map((m, i) => (
          <span key={m} className={i === values.length - 1 ? "font-semibold text-foreground" : undefined}>
            {monthShort(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Panel scorecard (inti rincian cabang): semua metrik unit, tiap metrik dengan nilai, status, ambang, selisih,
 * dan grafik garis tren. Margin four-wall (penentu utama status) tampil paling depan.
 */
export function ScorecardPanel({ unit, months, changes }: { unit: HomeUnitCard; months: string[]; changes: MetricChange[] }) {
  const changed = new Set(changes.filter((c) => c.unit_id === unit.unitId).map((c) => c.code));
  const metrics = [...unit.metrics].sort((a, b) => Number(b.isFourWall) - Number(a.isFourWall));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((m) => {
        const delta = formatDelta(m.delta, m.valueUnit);
        const range =
          m.green == null || m.red == null
            ? null
            : m.direction === "lower_better"
              ? `hijau ≤ ${formatBound(m.green, m.valueUnit)} · merah > ${formatBound(m.red, m.valueUnit)}`
              : `hijau ≥ ${formatBound(m.green, m.valueUnit)} · merah < ${formatBound(m.red, m.valueUnit)}`;
        return (
          <div key={m.code} className={cn("rounded-xl border bg-card p-3", m.isFourWall ? "border-foreground/30" : "border-border/70")}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 truncate text-[12px] font-semibold text-foreground">
                  {m.label}
                  {m.isFourWall && <span className="ml-1.5 rounded bg-accent px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--teal-700)]">penentu</span>}
                </div>
                {range && (
                  <span className="group relative shrink-0">
                    <button type="button" aria-label={`Ambang: ${range}`} className="grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:text-foreground">
                      <Info size={13} />
                    </button>
                    <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-max max-w-[220px] -translate-x-1/2 whitespace-normal rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-normal leading-snug text-foreground shadow-md group-hover:block group-focus-within:block">
                      {range}
                    </span>
                  </span>
                )}
              </div>
              <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none", STATUS_TONE[m.status])}>
                {STATUS_ICON[m.status]} {METRIC_STATUS_LABEL[m.status]}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className={cn("font-display text-[26px] font-extrabold leading-none tabular-nums", STATUS_TEXT[m.status])}>{formatMetricValue(m.value, m.valueUnit)}</span>
              {delta && <span className={cn("text-[11.5px] font-semibold tabular-nums", TONE_ARROW[m.tone])}>{delta}</span>}
              {changed.has(m.code) && <span className="text-[10.5px] font-semibold text-warning">▲ berubah</span>}
            </div>
            {m.t12 !== undefined && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                12 bulan terakhir:{" "}
                {m.t12 === null ? (
                  <span>belum cukup periode</span>
                ) : (
                  <span className="font-semibold tabular-nums text-foreground">{m.t12.value == null ? "modal tak kembali" : formatMetricValue(m.t12.value, m.t12.unit)}</span>
                )}
              </div>
            )}
            <div className="mt-2">
              <TrendChart values={m.spark} months={months} status={m.status} green={m.green} red={m.red} direction={m.direction} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
