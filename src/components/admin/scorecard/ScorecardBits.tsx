"use client";

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
 */
export function TrendChart({
  values,
  months,
  status,
  green,
  red,
}: {
  values: (number | null)[];
  months: string[];
  status: HomeMetricCell["status"];
  green: number | null;
  red: number | null;
}) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) {
    return <div className="grid h-[72px] place-items-center rounded-lg bg-muted/40 text-[10.5px] text-muted-foreground">Belum cukup periode untuk tren</div>;
  }
  const W = 240;
  const H = 64;
  const padX = 8;
  const padY = 8;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const span = hi - lo || Math.max(Math.abs(hi) * 0.1, 1);
  const min = lo - span * 0.25;
  const max = hi + span * 0.25;
  const x = (i: number) => padX + (values.length === 1 ? 0 : (i / (values.length - 1)) * (W - padX * 2));
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (H - padY * 2);
  const color = LINE_COLOR[status] ?? LINE_COLOR.not_assessed;
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
        {inRange(green) && <line x1={padX} x2={W - padX} y1={y(green!)} y2={y(green!)} stroke={LINE_COLOR.green} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />}
        {inRange(red) && <line x1={padX} x2={W - padX} y1={y(red!)} y2={y(red!)} stroke={LINE_COLOR.red} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />}
        {segments.map((seg, k) => (
          <polyline key={k} points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p.i === last.i ? 3.5 : 2} fill={color} />
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
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-foreground">
                  {m.label}
                  {m.isFourWall && <span className="ml-1.5 rounded bg-accent px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--teal-700)]">penentu</span>}
                </div>
                {range && <div className="text-[10.5px] text-muted-foreground">{range}</div>}
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
            <div className="mt-2">
              <TrendChart values={m.spark} months={months} status={m.status} green={m.green} red={m.red} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
