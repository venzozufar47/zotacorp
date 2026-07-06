"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DISC_FACTOR_COLOR } from "@/lib/disc/data/dimensions";
import type { DiscGraphValues } from "@/lib/disc/scoring";

/**
 * Line chart D-I-S-C 0–100 ala laporan Frexor: empat titik terhubung,
 * garis tengah 50 sebagai pembatas tinggi/rendah.
 */
export function DiscGraphChart({ values }: { values: DiscGraphValues }) {
  const data = [
    { factor: "D", nilai: values.d, fill: DISC_FACTOR_COLOR.D },
    { factor: "I", nilai: values.i, fill: DISC_FACTOR_COLOR.I },
    { factor: "S", nilai: values.s, fill: DISC_FACTOR_COLOR.S },
    { factor: "C", nilai: values.c, fill: DISC_FACTOR_COLOR.C },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="factor"
          tick={{ fontSize: 13, fontWeight: 700 }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine y={50} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <Tooltip
          formatter={(v: unknown) => [String(v), "Nilai"]}
          labelFormatter={(l) => `Faktor ${l}`}
          contentStyle={{
            borderRadius: 12,
            border: "2px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Line
          type="linear"
          dataKey="nilai"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={{ r: 5, strokeWidth: 2, fill: "var(--primary)" }}
          activeDot={{ r: 7 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
