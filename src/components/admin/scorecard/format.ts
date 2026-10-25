import type { MetricStatus, UnitStatus } from "@/lib/unit-scorecard/engine";

export const STATUS_LABEL: Record<UnitStatus, string> = {
  green: "Hijau",
  yellow: "Kuning",
  red: "Merah",
  rampup: "Ramp-up",
  incomplete: "Data belum lengkap",
  no_data: "Belum ada data",
};

export const METRIC_STATUS_LABEL: Record<MetricStatus, string> = {
  green: "Hijau",
  yellow: "Kuning",
  red: "Merah",
  incomplete: "Data belum lengkap",
  not_assessed: "Tidak dinilai",
};

/** Ikon + teks selalu menyertai warna (aksesibilitas). */
export const STATUS_ICON: Record<UnitStatus | MetricStatus, string> = {
  green: "●",
  yellow: "▲",
  red: "■",
  rampup: "◐",
  incomplete: "?",
  no_data: "–",
  not_assessed: "–",
};

export const STATUS_TONE: Record<UnitStatus | MetricStatus, string> = {
  green: "bg-success/15 text-success border-success/40",
  yellow: "bg-warning/15 text-warning border-warning/40",
  red: "bg-destructive/15 text-destructive border-destructive/40",
  rampup: "bg-muted text-muted-foreground border-border",
  incomplete: "bg-muted text-muted-foreground border-border",
  no_data: "bg-muted text-muted-foreground border-border",
  not_assessed: "bg-muted text-muted-foreground border-border",
};

export const STATUS_TEXT: Record<UnitStatus | MetricStatus, string> = {
  green: "text-success",
  yellow: "text-warning",
  red: "text-destructive",
  rampup: "text-muted-foreground",
  incomplete: "text-muted-foreground",
  no_data: "text-muted-foreground",
  not_assessed: "text-muted-foreground",
};

const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatMetricValue(value: number | null, unit: "pct" | "months" | "rating"): string {
  if (value == null) return "—";
  if (unit === "pct") return `${nf1.format(value)}%`;
  if (unit === "months") return `${nf1.format(value)} bln`;
  return nf1.format(value);
}

export function formatBound(value: number | null, unit: "pct" | "months" | "rating"): string {
  if (value == null) return "—";
  if (unit === "pct") return `${nf0.format(value)}%`;
  if (unit === "months") return `${nf0.format(value)} bln`;
  return nf1.format(value);
}

export function formatDelta(delta: number | null, unit: "pct" | "months" | "rating"): string {
  if (delta == null || Math.abs(delta) < 0.05) return "";
  const s = nf1.format(Math.abs(delta));
  const sign = delta > 0 ? "▲" : "▼";
  return unit === "pct" ? `${sign} ${s} poin` : unit === "months" ? `${sign} ${s} bln` : `${sign} ${s}`;
}

export const TONE_ARROW: Record<"better" | "worse" | "flat", string> = {
  better: "text-success",
  worse: "text-destructive",
  flat: "text-muted-foreground",
};

export function formatRupiah(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  return `Rp${nf0.format(Math.round(v))}`;
}
