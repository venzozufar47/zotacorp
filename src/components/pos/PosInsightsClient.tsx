"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, TrendingUp, Trophy, Clock, Calendar } from "lucide-react";
import { PosNavLink } from "./PosNavLink";
import type { PosInsights } from "@/lib/actions/pos-insights.actions";
import { formatRp } from "@/lib/cashflow/format";

interface Props {
  accountName: string;
  period: number;
  insights: PosInsights | null;
  error: string | null;
}

const PERIOD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 7, label: "7 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
];

const DOW_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    ...opts,
  });
}

function formatPctOf(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

/** Compact rupiah label untuk chart axis (e.g. 1.250.000 → "1.2jt"). */
function formatRpCompact(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}jt`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}rb`;
  }
  return String(Math.round(n));
}

export function PosInsightsClient({
  accountName,
  period,
  insights,
  error,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function setPeriod(value: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("period", String(value));
    router.push(`/pos/insights?${params.toString()}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
      <header>
        <PosNavLink
          href="/pos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={12} /> Kembali ke POS
        </PosNavLink>
        <h1 className="font-semibold text-foreground">Insights Penjualan</h1>
        <p className="text-xs text-muted-foreground">
          {accountName}
          {insights && (
            <>
              {" · "}
              {formatDate(insights.range.from)} – {formatDate(insights.range.to)}
            </>
          )}
        </p>
      </header>

      <div className="flex gap-1.5 rounded-full border border-border bg-muted/40 p-1 w-fit">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriod(opt.value)}
            className={
              "px-3 py-1 text-xs font-semibold rounded-full transition " +
              (opt.value === period
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal load insights: {error}
        </div>
      ) : !insights || insights.summary.txCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Belum ada penjualan di {period} hari terakhir.
          </p>
        </div>
      ) : (
        <InsightsBody insights={insights} />
      )}
    </div>
  );
}

function InsightsBody({ insights }: { insights: PosInsights }) {
  const { summary, topProducts, topVariants, daily, hourly, dow } = insights;

  const maxDailyRevenue = useMemo(
    () => Math.max(1, ...daily.map((d) => d.revenue)),
    [daily]
  );
  const maxHourly = useMemo(
    () => Math.max(1, ...hourly.map((h) => h.txCount)),
    [hourly]
  );
  const maxDow = useMemo(() => Math.max(1, ...dow.map((d) => d.txCount)), [dow]);

  const peakHour = useMemo(() => {
    let best = hourly[0];
    for (const h of hourly) if (h.txCount > best.txCount) best = h;
    return best;
  }, [hourly]);
  const peakDow = useMemo(() => {
    let best = dow[0];
    for (const d of dow) if (d.txCount > best.txCount) best = d;
    return best;
  }, [dow]);

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="Revenue"
          value={formatRp(summary.revenue)}
          sub={`${summary.txCount} transaksi`}
        />
        <SummaryCard
          label="Avg ticket"
          value={formatRp(Math.round(summary.avgTicket))}
          sub="per transaksi"
        />
        <SummaryCard
          label="Cash"
          value={formatRp(summary.cashRevenue)}
          sub={`${summary.cashCount} tx · ${formatPctOf(summary.cashRevenue, summary.revenue)}`}
        />
        <SummaryCard
          label="QRIS"
          value={formatRp(summary.qrisRevenue)}
          sub={`${summary.qrisCount} tx · ${formatPctOf(summary.qrisRevenue, summary.revenue)}`}
        />
        {summary.voidedCount > 0 && (
          <div className="col-span-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {summary.voidedCount} transaksi dibatalkan di periode ini (tidak masuk revenue)
          </div>
        )}
      </section>

      <Section
        icon={<Trophy size={14} />}
        title="Produk paling laku"
        subtitle="Diurutkan berdasarkan qty terjual (level produk, varian di-aggregate)"
      >
        <RankList
          rows={topProducts.slice(0, 10).map((p, idx) => ({
            key: p.productName,
            rank: idx + 1,
            label: p.productName,
            primary: `${p.qty}×`,
            secondary: formatRp(p.revenue),
            barPct:
              topProducts.length > 0
                ? p.qty / Math.max(1, topProducts[0].qty)
                : 0,
          }))}
        />
      </Section>

      {topVariants.length > topProducts.length && (
        <Section
          icon={<Trophy size={14} />}
          title="Varian paling laku"
          subtitle="Per SKU — produk + varian dipisah"
        >
          <RankList
            rows={topVariants.slice(0, 10).map((v, idx) => ({
              key: v.name,
              rank: idx + 1,
              label: v.name,
              primary: `${v.qty}×`,
              secondary: formatRp(v.revenue),
              barPct:
                topVariants.length > 0
                  ? v.qty / Math.max(1, topVariants[0].qty)
                  : 0,
            }))}
          />
        </Section>
      )}

      <Section
        icon={<TrendingUp size={14} />}
        title={`Revenue harian (${insights.periodDays} hari)`}
        subtitle="Bar = revenue per tanggal — angka di atas bar"
      >
        {(() => {
          // Trim ke rentang aktif ±1 hari supaya hari-hari kosong tidak
          // menelan space chart. Kalau seluruh periode kosong, fallback
          // tampilkan full range.
          const firstActive = daily.findIndex((d) => d.revenue > 0);
          const lastActive = (() => {
            for (let i = daily.length - 1; i >= 0; i -= 1) {
              if (daily[i].revenue > 0) return i;
            }
            return -1;
          })();
          const slice =
            firstActive === -1
              ? daily
              : daily.slice(
                  Math.max(0, firstActive - 1),
                  Math.min(daily.length, lastActive + 2)
                );
          const peakRev = Math.max(0, ...slice.map((d) => d.revenue));
          // Untuk chart yang masih banyak bar (>10), label tiap bar
          // bakal saling tabrak — tampilkan hanya untuk peak + sample
          // jarang. Untuk slice kecil (<=10), tampilkan tiap non-zero.
          const dense = slice.length > 10;
          return (
            <>
              <div className="flex items-stretch gap-[3px] h-36 px-1">
                {slice.map((d, idx) => {
                  const heightPct = (d.revenue / maxDailyRevenue) * 100;
                  const isPeak = d.revenue === peakRev && d.revenue > 0;
                  const showLabel =
                    d.revenue > 0 && (!dense || isPeak || idx % 3 === 0);
                  return (
                    <div
                      key={d.date}
                      className="flex-1 min-w-[3px] flex flex-col items-center"
                      title={`${formatDate(d.date, { weekday: "short" })} · ${formatRp(d.revenue)} · ${d.txCount} tx`}
                    >
                      <div className="w-full flex flex-col justify-end items-center h-32">
                        {showLabel && (
                          <span
                            className={
                              "text-[10px] tabular-nums leading-none mb-0.5 whitespace-nowrap " +
                              (isPeak
                                ? "font-bold text-primary"
                                : "font-semibold text-foreground")
                            }
                          >
                            {formatRpCompact(d.revenue)}
                          </span>
                        )}
                        <div
                          className={
                            "w-full rounded-t-[3px] transition " +
                            (isPeak
                              ? "bg-primary"
                              : "bg-primary/60 hover:bg-primary/80")
                          }
                          style={{
                            height: `${heightPct}%`,
                            minHeight: d.revenue > 0 ? "3px" : 0,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 px-1 tabular-nums">
                <span>{formatDate(slice[0].date, { weekday: "short" })}</span>
                {slice.length > 4 && (
                  <span>
                    {formatDate(slice[Math.floor(slice.length / 2)].date, {
                      weekday: "short",
                    })}
                  </span>
                )}
                <span>
                  {formatDate(slice[slice.length - 1].date, {
                    weekday: "short",
                  })}
                </span>
              </div>
            </>
          );
        })()}
      </Section>

      <Section
        icon={<Clock size={14} />}
        title="Jam paling rame"
        subtitle={
          peakHour.txCount > 0
            ? `Puncak jam ${String(peakHour.hour).padStart(2, "0")}:00 (${peakHour.txCount} tx)`
            : "—"
        }
      >
        {(() => {
          // Trim ke operating hours saja (jam pertama–terakhir yang
          // punya tx) supaya bar tidak kekecilan terhimpit jam-jam mati.
          // Pad ±1 jam untuk konteks. Kalau tidak ada data sama sekali,
          // fallback 9–21.
          const activeHours = hourly.filter((h) => h.txCount > 0);
          const lo =
            activeHours.length > 0
              ? Math.max(0, Math.min(...activeHours.map((h) => h.hour)) - 1)
              : 9;
          const hi =
            activeHours.length > 0
              ? Math.min(23, Math.max(...activeHours.map((h) => h.hour)) + 1)
              : 21;
          const slice = hourly.slice(lo, hi + 1);
          return (
            <div className="flex items-end gap-1.5 h-32">
              {slice.map((h) => {
                const pct = (h.txCount / maxHourly) * 100;
                const isPeak = h.txCount === peakHour.txCount && h.txCount > 0;
                return (
                  <div
                    key={h.hour}
                    className="flex-1 flex flex-col items-center"
                    title={`${String(h.hour).padStart(2, "0")}:00 · ${h.txCount} tx · ${formatRp(h.revenue)}`}
                  >
                    <div className="w-full flex flex-col justify-end items-center h-24">
                      {h.txCount > 0 && (
                        <span
                          className={
                            "text-[10px] tabular-nums leading-none mb-0.5 " +
                            (isPeak
                              ? "font-bold text-emerald-700"
                              : "font-semibold text-foreground")
                          }
                        >
                          {h.txCount}
                        </span>
                      )}
                      <div
                        className={
                          "w-full rounded-t-[3px] transition " +
                          (isPeak
                            ? "bg-emerald-600"
                            : "bg-emerald-500/60 hover:bg-emerald-500")
                        }
                        style={{
                          height: `${pct}%`,
                          minHeight: h.txCount > 0 ? "3px" : 0,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums mt-1">
                      {String(h.hour).padStart(2, "0")}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Section>

      <Section
        icon={<Calendar size={14} />}
        title="Hari paling rame"
        subtitle={
          peakDow.txCount > 0
            ? `Puncak ${DOW_LABELS[peakDow.dow]} (${peakDow.txCount} tx)`
            : "—"
        }
      >
        <div className="flex items-end gap-2 h-24">
          {dow.map((d) => {
            const pct = (d.txCount / maxDow) * 100;
            return (
              <div
                key={d.dow}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${DOW_LABELS[d.dow]} · ${d.txCount} tx · ${formatRp(d.revenue)}`}
              >
                <div className="w-full flex flex-col justify-end h-20">
                  <div
                    className="bg-amber-500/70 hover:bg-amber-500 transition rounded-t-sm"
                    style={{ height: `${pct}%`, minHeight: d.txCount > 0 ? "2px" : 0 }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {DOW_LABELS[d.dow]}
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-semibold text-foreground tabular-nums mt-0.5 break-all">
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{sub}</p>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center size-7 rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground text-sm">{title}</h2>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function RankList({
  rows,
}: {
  rows: Array<{
    key: string;
    rank: number;
    label: string;
    primary: string;
    secondary: string;
    barPct: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Belum ada data.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="relative">
          <div
            className="absolute inset-y-0 left-0 rounded-lg bg-primary/10"
            style={{ width: `${Math.max(2, r.barPct * 100)}%` }}
          />
          <div className="relative flex items-center gap-3 px-2.5 py-1.5">
            <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-5">
              {r.rank}
            </span>
            <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
              {r.label}
            </span>
            <span className="text-xs font-semibold tabular-nums text-foreground whitespace-nowrap">
              {r.primary}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
              {r.secondary}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
