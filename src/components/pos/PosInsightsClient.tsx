"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Trophy, Clock, Calendar } from "lucide-react";
import { PosTopNav } from "./PosTopNav";
import type { PosInsights } from "@/lib/actions/pos-insights.actions";
import { formatRp, formatRpCompact } from "@/lib/cashflow/format";

interface Props {
  accountName: string;
  range: { from: string; to: string };
  insights: PosInsights | null;
  error: string | null;
  isAdmin: boolean;
}

const PERIOD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 7, label: "7 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
];

function isoDate(d: Date): string {
  // Format Jakarta calendar date (server already runs in UTC,
  // tapi untuk picker lokal cukup pakai komponen tahun-bulan-tanggal
  // langsung dari Date object — Indonesia tidak punya DST jadi
  // konversi sederhana sudah benar).
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

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

/**
 * Trim daily series ke rentang aktif ±1 hari supaya hari-hari kosong
 * tidak menelan space chart. Kalau seluruh periode kosong, fallback
 * tampilkan full range.
 */
function trimToActiveDays<T extends { revenue: number }>(daily: T[]): T[] {
  const firstActive = daily.findIndex((d) => d.revenue > 0);
  if (firstActive === -1) return daily;
  let lastActive = -1;
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    if (daily[i].revenue > 0) {
      lastActive = i;
      break;
    }
  }
  return daily.slice(
    Math.max(0, firstActive - 1),
    Math.min(daily.length, lastActive + 2)
  );
}

/**
 * Trim hourly series ke operating hours saja (jam pertama–terakhir
 * yang punya tx) + pad ±1 jam untuk konteks. Fallback 9–21 kalau tidak
 * ada data sama sekali.
 */
function trimToOperatingHours<T extends { hour: number; txCount: number }>(
  hourly: T[]
): T[] {
  const activeHours = hourly.filter((h) => h.txCount > 0);
  if (activeHours.length === 0) return hourly.slice(9, 22);
  const lo = Math.max(0, Math.min(...activeHours.map((h) => h.hour)) - 1);
  const hi = Math.min(23, Math.max(...activeHours.map((h) => h.hour)) + 1);
  return hourly.slice(lo, hi + 1);
}

export function PosInsightsClient({
  accountName,
  range,
  insights,
  error,
  isAdmin,
}: Props) {
  const router = useRouter();
  const today = isoDate(new Date());
  const periodDays = daysBetweenInclusive(range.from, range.to);
  /** Preset aktif kalau `to=today` dan periodDays match (7/30/90).
   *  Kalau tidak, "custom" yang aktif. */
  const activePreset =
    range.to === today
      ? PERIOD_OPTIONS.find((o) => o.value === periodDays)?.value ?? null
      : null;
  const isCustom = activePreset == null;

  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);

  function applyPreset(value: number) {
    setCustomOpen(false);
    router.push(`/pos/insights?period=${value}`);
  }

  function applyCustom(from: string, to: string) {
    if (!from || !to) return;
    if (from > to) [from, to] = [to, from];
    setCustomOpen(false);
    router.push(`/pos/insights?from=${from}&to=${to}`);
  }

  function applyShortcut(kind: "thisMonth" | "lastMonth" | "thisWeek" | "ytd") {
    const now = new Date();
    let from: string;
    let to: string = isoDate(now);
    if (kind === "thisMonth") {
      from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    } else if (kind === "lastMonth") {
      from = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to = isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (kind === "thisWeek") {
      // Senin sebagai awal minggu (Indonesia).
      const dow = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dow - 1));
      from = isoDate(monday);
    } else {
      from = isoDate(new Date(now.getFullYear(), 0, 1));
    }
    setCustomFrom(from);
    setCustomTo(to);
    applyCustom(from, to);
  }

  return (
    <>
      <PosTopNav
        accountName={accountName}
        isAdmin={isAdmin}
        active="insights"
      />
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
      <header>
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

      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5 rounded-full border border-border bg-muted/40 p-1 w-fit">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => applyPreset(opt.value)}
              className={
                "px-3 py-1 text-xs font-semibold rounded-full transition " +
                (activePreset === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            aria-expanded={customOpen}
            className={
              "px-3 py-1 text-xs font-semibold rounded-full transition inline-flex items-center gap-1 " +
              (isCustom
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <Calendar size={11} />
            {isCustom
              ? `${formatDate(range.from)} – ${formatDate(range.to)}`
              : "Custom"}
          </button>
        </div>

        {customOpen && (
          <div className="rounded-2xl border border-border bg-card p-3 space-y-3 max-w-sm shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-muted-foreground">
                Dari
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || today}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="text-[11px] font-medium text-muted-foreground">
                Sampai
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "thisWeek" as const, label: "Minggu ini" },
                { id: "thisMonth" as const, label: "Bulan ini" },
                { id: "lastMonth" as const, label: "Bulan lalu" },
                { id: "ytd" as const, label: "Tahun berjalan" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applyShortcut(s.id)}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted active:scale-95 transition-transform"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(range.from);
                  setCustomTo(range.to);
                  setCustomOpen(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => applyCustom(customFrom, customTo)}
                disabled={!customFrom || !customTo || customFrom > customTo}
                className="rounded-lg bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Terapkan
              </button>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal load insights: {error}
        </div>
      ) : !insights || insights.summary.txCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Belum ada penjualan dari {formatDate(range.from)} sampai{" "}
            {formatDate(range.to)}.
          </p>
        </div>
      ) : (
        <InsightsBody insights={insights} />
      )}
      </div>
    </>
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

  const peakHour = useMemo(
    () => hourly.reduce((a, b) => (b.txCount > a.txCount ? b : a)),
    [hourly]
  );
  const peakDow = useMemo(
    () => dow.reduce((a, b) => (b.txCount > a.txCount ? b : a)),
    [dow]
  );

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
          const slice = trimToActiveDays(daily);
          const peakRev = Math.max(0, ...slice.map((d) => d.revenue));
          // Untuk slice padat (>10 bar) label tiap bar bakal saling
          // tabrak — tampilkan hanya untuk peak + sample jarang.
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
          const slice = trimToOperatingHours(hourly);
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
