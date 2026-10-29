"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TrendChart } from "@/components/admin/scorecard/ScorecardBits";
import { METRIC_STATUS_LABEL, STATUS_ICON, STATUS_TEXT, STATUS_TONE } from "@/components/admin/scorecard/format";
import type { BrandMetricView, SocialScorecardData } from "@/lib/actions/social-scorecard.actions";
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
  if (kind === "pct") return `${nf0.format(value)}%`;
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

/** Keterangan di bawah angka Omset: rincian per cabang (gabungan) dan penanda bulan yang belum selesai. */
function OmsetDetail({ m }: { m: BrandMetricView }) {
  const rincian = m.inputs.rincian_cabang as { cabang: string; rp: number }[] | undefined;
  const berjalan = m.inputs.bulan_berjalan === true;
  const sampai = typeof m.inputs.data_sampai === "string" ? (m.inputs.data_sampai as string) : null;
  if (!rincian?.length && !berjalan) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[10.5px] leading-snug text-muted-foreground">
      {rincian && rincian.length > 0 && (
        <p>
          Gabungan {rincian.length} cabang: {rincian.map((r) => `${r.cabang} ${fmtShort(r.rp, "rupiah")}`).join(" · ")}
        </p>
      )}
      {berjalan && <p className="font-semibold text-warning-foreground">Bulan belum selesai{sampai ? `, data sampai ${formatDateID(sampai).replace(/ \d{4}$/, "")}` : ""}</p>}
    </div>
  );
}

function MetricCard({ m, months }: { m: BrandMetricView; months: string[] }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-foreground" title={m.note}>
            {m.label}
          </div>
          <div className="text-[10.5px] text-muted-foreground">
            {m.target != null ? `target ${fmtShort(m.target, m.kind)}` : "target belum diisi"}
            {m.score != null ? ` · ${nf0.format(m.score)}% dari target` : ""}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none", STATUS_TONE[m.status])}>
          {STATUS_ICON[m.status]} {METRIC_STATUS_LABEL[m.status]}
        </span>
      </div>
      <div className="mt-1.5">
        <span className={cn("font-display text-[24px] font-extrabold leading-none tabular-nums", STATUS_TEXT[m.status])}>{fmt(m.actual, m.kind)}</span>
      </div>
      <OmsetDetail m={m} />
      {m.note && m.status === "incomplete" && <div className="mt-1 text-[10.5px] text-muted-foreground">{m.note}</div>}
      <div className="mt-2">
        <TrendChart values={m.spark} months={months} status={m.status} green={null} red={null} />
      </div>
    </div>
  );
}
