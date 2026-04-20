"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PnLReport } from "@/lib/cashflow/pnl";

interface Props {
  report: PnLReport;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "M";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "jt";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "rb";
  return String(n);
}

function formatTooltip(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return "Rp " + n.toLocaleString("id-ID");
}

/**
 * Two side-by-side charts above the PnL table:
 *   1. Bar chart — monthly operating profit per branch
 *   2. Line chart — monthly operating revenue per branch
 * Both use recharts' ResponsiveContainer so they scale with viewport.
 */
export function PnLCharts({ report }: Props) {
  const data = report.months.map((m) => ({
    month: `${MONTH_NAMES[m.month - 1]} ${String(m.year).slice(-2)}`,
    semarangProfit: m.byBranch.Semarang.operatingProfit,
    pareProfit: m.byBranch.Pare.operatingProfit,
    semarangRevenue: m.byBranch.Semarang.operatingRevenue,
    pareRevenue: m.byBranch.Pare.operatingRevenue,
  }));

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Belum ada data untuk periode ini. Atur rentang di atas.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={formatCompact}
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
              <Bar dataKey="semarangProfit" name="Semarang" fill="var(--primary)">
                {data.map((d, i) => (
                  <Cell
                    key={`smg-${i}`}
                    fill={
                      d.semarangProfit >= 0
                        ? "var(--success)"
                        : "var(--destructive)"
                    }
                  />
                ))}
              </Bar>
              <Bar dataKey="pareProfit" name="Pare" fill="var(--primary)">
                {data.map((d, i) => (
                  <Cell
                    key={`pare-${i}`}
                    fill={
                      d.pareProfit >= 0
                        ? "var(--success)"
                        : "var(--destructive)"
                    }
                    fillOpacity={0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="px-1 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue trend
          </p>
          <p className="text-sm font-semibold text-foreground">
            per bulan × cabang
          </p>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={formatCompact}
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
                dataKey="semarangRevenue"
                name="Semarang"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="pareRevenue"
                name="Pare"
                stroke="var(--success)"
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
