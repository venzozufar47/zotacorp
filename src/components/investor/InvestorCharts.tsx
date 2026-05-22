"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
} from "recharts";
import type { InvestorMonthlyRow } from "@/lib/investor/dashboard";

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

function fmtMonth(r: { year: number; month: number }) {
  return `${MONTH_NAMES[r.month - 1]} ${String(r.year).slice(2)}`;
}
function toJt(n: number) {
  return Math.round(n / 1e6);
}

export function RevenueChart({ rows }: { rows: InvestorMonthlyRow[] }) {
  const data = rows.map((r) => ({
    label: fmtMonth(r),
    revJt: toJt(r.revenue),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#e6e6ea" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}jt`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #d2d2d7",
          }}
          formatter={((v: number) => [`Rp ${v} jt`, "Revenue"]) as never}
        />
        <Bar dataKey="revJt" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PnLBreakdownChart({ rows }: { rows: InvestorMonthlyRow[] }) {
  const data = rows.map((r) => ({
    label: fmtMonth(r),
    revJt: toJt(r.revenue),
    expJt: toJt(r.cogs + r.opex),
    netJt: toJt(r.netProfit),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#e6e6ea" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}jt`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #d2d2d7",
          }}
          formatter={((v: number) => `Rp ${v} jt`) as never}
        />
        <Bar
          dataKey="revJt"
          name="Revenue"
          fill="var(--primary)"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="expJt"
          name="COGS + Opex"
          fill="#b5dde6"
          radius={[4, 4, 0, 0]}
        />
        <Line
          dataKey="netJt"
          name="Net profit"
          stroke="#1d6b3a"
          strokeWidth={2.2}
          dot={{ r: 2.5, fill: "#1d6b3a" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MarginTrendChart({ rows }: { rows: InvestorMonthlyRow[] }) {
  const data = rows.map((r) => ({
    label: fmtMonth(r),
    gpm: r.revenue ? (r.grossProfit / r.revenue) * 100 : 0,
    opm: r.revenue ? (r.operatingProfit / r.revenue) * 100 : 0,
    npm: r.revenue ? (r.netProfit / r.revenue) * 100 : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#e6e6ea" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #d2d2d7",
          }}
          formatter={((v: number) => `${v.toFixed(1)}%`) as never}
        />
        <Line
          dataKey="gpm"
          name="Gross PM"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="opm"
          name="Operating PM"
          stroke="#7c5cd6"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="npm"
          name="Net PM"
          stroke="#1d6b3a"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function UtilizationChart({ rows }: { rows: InvestorMonthlyRow[] }) {
  const data = rows.map((r) => ({
    label: fmtMonth(r),
    util: r.utilizationPct ?? 0,
    hasData: r.utilizationPct != null,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#e6e6ea" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #d2d2d7",
          }}
          formatter={((v: number) => `${v}% utilisasi`) as never}
        />
        <ReferenceLine
          y={80}
          stroke="#b42234"
          strokeDasharray="4 4"
          label={{
            value: "Target 80%",
            fontSize: 10,
            fill: "#b42234",
            position: "insideTopRight",
          }}
        />
        <Bar dataKey="util" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// keep Area imported to silence tree-shake/lint if not used elsewhere
void Area;
