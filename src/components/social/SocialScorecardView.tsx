"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TrendChart } from "@/components/admin/scorecard/ScorecardBits";
import { ScorecardRangesInfo } from "@/components/scorecard/ScorecardRangesInfo";
import { METRIC_STATUS_LABEL } from "@/components/admin/scorecard/format";
import { TILE_STYLE, type TileTone } from "@/components/scorecard/tile-styles";
import type { BrandMetricView, SocialBrandCard, SocialScorecardData } from "@/lib/actions/social-scorecard.actions";
import { formatDateID } from "@/lib/utils/date-formats";

const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmt(value: number | null, kind: BrandMetricView["kind"]): string {
  if (value == null) return "—";
  if (kind === "rupiah") return `Rp${nf0.format(Math.round(value))}`;
  if (kind === "pct") return `${nf1.format(value)}%`;
  return nf0.format(Math.round(value));
}

/** Kompak untuk sumbu: 1,2 jt / 340 rb. */
function fmtShort(value: number | null, kind: BrandMetricView["kind"]): string {
  if (value == null) return "—";
  if (kind === "pct") return `${Number.isInteger(value) ? nf0.format(value) : nf1.format(value)}%`;
  const abs = Math.abs(value);
  const base = kind === "rupiah" ? "Rp" : "";
  if (abs >= 1_000_000) return `${base}${nf1.format(value / 1_000_000)} jt`;
  if (abs >= 1_000) return `${base}${nf0.format(value / 1_000)} rb`;
  return `${base}${nf0.format(value)}`;
}

/**
 * Scorecard Sosmed — hanya hasil (tanpa input): kartu per brand dengan empat metrik, status, target, dan tren enam
 * bulan, bergaya sama dengan scorecard cabang di Kinerja Cabang. Input laporan & target ada di Sosmed & KPI.
 */
export function SocialScorecardView({ data, monthOptions }: { data: SocialScorecardData; monthOptions: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold">Bulan</span>
          <select
            value={data.month}
            onChange={(e) => router.push(`/admin/social/scorecard?month=${e.target.value}`)}
            className="h-10 rounded-xl border-2 border-border bg-background px-3 text-[13px]"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[12px] text-muted-foreground">Angka dihitung dari laporan mingguan (minggu masuk bulan menurut tanggal Senin-nya).</span>
        <Link href="/admin/social" className="ml-auto text-[12.5px] font-semibold text-primary hover:underline">
          Isi laporan & atur target →
        </Link>
      </div>

      {data.brands.map((b) => (
        <section key={b.brandId} className="space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="font-display text-[17px] font-extrabold">{b.label}</h2>
            <span className="text-[11.5px] text-muted-foreground">
              {b.weeksReported} minggu terlapor · {b.accountsReporting}/{b.accountCount} akun terisi
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {b.metrics.map((m) => (
              <MetricCard key={m.code} m={m} months={data.trendMonths} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Isi panduan ⓘ kartu Omset: rincian per cabang (gabungan) dan penanda bulan yang belum selesai. */
function omsetLines(m: BrandMetricView): string[] {
  const rincian = m.inputs.rincian_cabang as { cabang: string; rp: number }[] | undefined;
  const sampai = typeof m.inputs.data_sampai === "string" ? (m.inputs.data_sampai as string) : null;
  const lines: string[] = [];
  if (rincian && rincian.length > 0) lines.push(`Gabungan ${rincian.length} cabang: ${rincian.map((r) => `${r.cabang} ${fmtShort(r.rp, "rupiah")}`).join(" · ")}`);
  if (m.inputs.bulan_berjalan === true) lines.push(`Bulan belum selesai${sampai ? `, data sampai ${formatDateID(sampai).replace(/ \d{4}$/, "")}` : ""}`);
  return lines;
}

const TONE_OF: Record<BrandMetricView["status"], TileTone> = { green: "green", yellow: "yellow", red: "red", incomplete: "neutral", not_assessed: "neutral" };

/** Kartu metrik: kepala berwarna status (gaya sama dengan scorecard cabang) + panel putih berisi tren enam bulan. */
/** Ubin sosmed untuk beranda karyawan: hanya kepala berwarna (tanpa panel tren), ringkas seperti scorecard cabang. */
export function SocialBrandTiles({ brand }: { brand: SocialBrandCard }) {
  const odd = brand.metrics.length % 2 === 1;
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:gap-2.5", brand.metrics.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {brand.metrics.map((m, i) => (
        <MetricCard key={m.code} m={m} months={[]} compact className={odd && i === 0 ? "col-span-2 lg:col-span-1" : undefined} />
      ))}
    </div>
  );
}

function MetricCard({ m, months, compact = false, className }: { m: BrandMetricView; months: string[]; compact?: boolean; className?: string }) {
  const style = TILE_STYLE[TONE_OF[m.status]];
  const Icon = style.Icon;
  const lines = omsetLines(m);
  const isNumber = m.actual != null;
  return (
    <div className={cn("relative rounded-3xl border border-border/60 bg-card has-[button[aria-expanded=true]]:z-30", className)}>
      <div className={cn("relative px-3.5 py-3 ring-1 ring-inset ring-white/15", compact ? "rounded-3xl" : "rounded-t-3xl", style.tile)}>
        {/* Watermark dipotong di pembungkusnya sendiri; kepala tidak boleh overflow-hidden karena panduan ⓘ muncul di dalamnya. */}
        <span aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", compact ? "rounded-3xl" : "rounded-t-3xl")}>
          <Icon size={64} strokeWidth={1.5} className="absolute -bottom-3 -right-3 opacity-[0.14]" />
        </span>
        <div className="relative flex items-start justify-between gap-1">
          <span className="text-[11.5px] font-medium leading-snug">{m.label}</span>
          <span className="-mr-2 -mt-1.5">
            <ScorecardRangesInfo label={m.label} lines={lines.length > 0 ? lines : undefined} note={lines.length > 0 ? undefined : m.note} onSolid />
          </span>
        </div>
        <p className={cn("relative mt-1 font-display font-extrabold leading-tight tabular-nums", isNumber || m.valueAsScore ? "text-[28px]" : "text-lg")}>
          {m.valueAsScore ? (m.score != null ? `${nf0.format(m.score)}%` : "—") : fmt(m.actual, m.kind)}
        </p>
        <div className="relative mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", style.chip)}>
            <Icon aria-hidden size={12} strokeWidth={2.5} />
            {METRIC_STATUS_LABEL[m.status]}
          </span>
          <span className="text-[11px] leading-snug">
            {m.target != null ? `target ${fmtShort(m.target, m.kind)}` : "target belum diisi"}
            {m.score != null && !m.valueAsScore ? ` · ${nf0.format(m.score)}% dari target` : ""}
          </span>
        </div>
      </div>
      {!compact && (
        <div className="rounded-b-3xl px-3 pb-3 pt-2">
          {m.note && m.status === "incomplete" && <p className="mb-1 text-[10.5px] text-muted-foreground">{m.note}</p>}
          <TrendChart values={m.spark} months={months} status={m.status} green={null} red={null} />
        </div>
      )}
    </div>
  );
}
