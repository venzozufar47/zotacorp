"use client";

/**
 * Bar + line chart untuk PnL Yeobo Space.
 * - Bar: profit operasional per bulan × 3 cabang (Tlogosari/Tembalang/Jebres)
 * - Line: revenue & expense total perusahaan per bulan
 *
 * Disesuaikan dari PnLCharts (Haengbocake) yang hardcoded 2 cabang
 * (Semarang/Pare). Pakai palet konsisten dengan Sidebar theme.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { YeoboPnLReport } from "@/lib/cashflow/pnl-yeobo";

interface Props {
  report: YeoboPnLReport;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

// Warna per cabang — konsisten dengan ID cabang Yeobo, beda nuansa
// dari Haengbocake (Semarang/Pare) supaya tidak tertukar di mata.
const BRANCH_COLORS: Record<string, string> = {
  Tlogosari: "#14b8a6", // teal-500
  Tembalang: "#f59e0b", // amber-500
  Jebres: "#8b5cf6", // violet-500
};

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "M";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "jt";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "rb";
  return String(n);
}

function computeDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(Math.abs(min), Math.abs(max)) * 0.1 || 1;
  return [Math.min(min - pad, 0), Math.max(max + pad, 0)];
}

function formatTooltip(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return "Rp " + n.toLocaleString("id-ID");
}

export function PnLChartsYeobo({ report }: Props) {
  const branches = report.branches;

  const profitData = report.months.map((m) => {
    const row: Record<string, string | number> = {
      month: `${MONTH_NAMES[m.month - 1]} ${String(m.year).slice(-2)}`,
    };
    for (const b of branches) {
      row[b] = m.byBranch[b]?.operatingProfit ?? 0;
    }
    return row;
  });

  const trendData = report.months.map((m) => {
    const totalRev = branches.reduce(
      (s, b) => s + (m.byBranch[b]?.operatingRevenue ?? 0),
      0
    );
    const totalExp = branches.reduce(
      (s, b) => s + (m.byBranch[b]?.operatingExpense ?? 0),
      0
    );
    return {
      month: `${MONTH_NAMES[m.month - 1]} ${String(m.year).slice(-2)}`,
      revenue: totalRev,
      expense: totalExp,
    };
  });

  const allProfit = profitData.flatMap((d) =>
    branches.map((b) => Number(d[b]))
  );
  const profitDomain = computeDomain(allProfit);
  const allTrend = trendData.flatMap((d) => [d.revenue, d.expense]);
  const trendDomain = computeDomain(allTrend);

  if (profitData.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Belum ada data untuk periode ini. Atur rentang di atas.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="px-1 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Profit operasional
          </p>
          <p className="text-sm font-semibold text-foreground">
            per bulan × cabang
          </p>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profitData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={formatCompact}
                domain={profitDomain}
              />
              {profitDomain[1] > 0 && (
                <ReferenceArea
                  y1={0}
                  y2={profitDomain[1]}
                  fill="#10b981"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
              )}
              {profitDomain[0] < 0 && (
                <ReferenceArea
                  y1={profitDomain[0]}
                  y2={0}
                  fill="#ef4444"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
              )}
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
              <Tooltip
                formatter={formatTooltip}
                contentStyle={{
                  fontSize: 11,
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {branches.map((b) => (
                <Bar key={b} dataKey={b} fill={BRANCH_COLORS[b] ?? "#64748b"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="px-1 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tren revenue vs expense
          </p>
          <p className="text-sm font-semibold text-foreground">
            total perusahaan per bulan
          </p>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={formatCompact}
                domain={trendDomain}
              />
              <Tooltip
                formatter={formatTooltip}
                contentStyle={{
                  fontSize: 11,
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="expense"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
