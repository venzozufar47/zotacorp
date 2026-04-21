"use client";

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

/**
 * 10% padding around [min, max] so the shaded profit/loss bands
 * extend slightly beyond the furthest data point. Returns [min, max]
 * where both sides are clamped to 0 if all data is one-sided (avoids
 * a loss-zone band appearing when no branch is loss-making).
 */
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
    semarangNetDiv: m.byBranch.Semarang.netDividen,
    pareNetDiv: m.byBranch.Pare.netDividen,
  }));

  // Compute symmetric y-domain padding so the zero-line sits mid-chart
  // when values straddle it — the positive/negative shaded bands then
  // read as equal visual weight.
  const allProfit = data.flatMap((d) => [d.semarangProfit, d.pareProfit]);
  const allNetDiv = data.flatMap((d) => [d.semarangNetDiv, d.pareNetDiv]);
  const profitDomain = computeDomain(allProfit);
  const netDivDomain = computeDomain(allNetDiv);

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
                domain={profitDomain}
              />
              {/* Profit/loss zone shading — green band above zero, red below. */}
              {profitDomain[1] > 0 ? (
                <ReferenceArea
                  y1={0}
                  y2={profitDomain[1]}
                  fill="var(--success)"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
              ) : null}
              {profitDomain[0] < 0 ? (
                <ReferenceArea
                  y1={profitDomain[0]}
                  y2={0}
                  fill="var(--destructive)"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
              ) : null}
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
              {/* Bars colored by branch identity (teal + amber) to
                  match the Net Dividen line chart. Profit/loss sign
                  is already conveyed by the shaded zones — coloring
                  bars by sign would redundantly (and confusingly)
                  overload the palette. */}
              <Bar
                dataKey="semarangProfit"
                name="Semarang"
                fill="var(--primary)"
              />
              <Bar dataKey="pareProfit" name="Pare" fill="#c2410c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="px-1 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Net Dividen (Profit Owner)
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
                domain={netDivDomain}
              />
              {netDivDomain[1] > 0 ? (
                <ReferenceArea
                  y1={0}
                  y2={netDivDomain[1]}
                  fill="var(--success)"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
              ) : null}
              {netDivDomain[0] < 0 ? (
                <ReferenceArea
                  y1={netDivDomain[0]}
                  y2={0}
                  fill="var(--destructive)"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
              ) : null}
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
              {/* Stroke colors chosen to avoid green/red so they're
                  not confused with the profit/loss zone shading.
                  Teal (primary) + amber read as two distinct branches
                  at a glance without either reading as "good/bad". */}
              <Line
                type="monotone"
                dataKey="semarangNetDiv"
                name="Semarang"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="pareNetDiv"
                name="Pare"
                stroke="#c2410c"
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
