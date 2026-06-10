"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIDR } from "@/lib/cashflow/format";
import type { YeoboBoothBookingWithFreelance } from "@/lib/yeobo-booth/types";
import { spaceRentRevenue } from "@/lib/yeobo-booth/types";

interface Props {
  /** Bookings dalam window 12 bulan terakhir (sudah di-filter di server). */
  bookings: YeoboBoothBookingWithFreelance[];
}

interface MonthlyAgg {
  ym: string; // YYYY-MM
  label: string;
  pendapatan: number;
  sesiCompleted: number;
}

function buildMonthlyAgg(
  bookings: YeoboBoothBookingWithFreelance[]
): MonthlyAgg[] {
  // Agregasi pendapatan by tanggal pembayaran (DP & pelunasan), sesi
  // completed by tanggal sesi.
  const map = new Map<string, MonthlyAgg>();
  function ensure(ym: string): MonthlyAgg {
    let row = map.get(ym);
    if (!row) {
      const [y, m] = ym.split("-").map(Number);
      const d = new Date(y, (m ?? 1) - 1, 1);
      const label = d.toLocaleDateString("id-ID", {
        month: "short",
        year: "2-digit",
      });
      row = { ym, label, pendapatan: 0, sesiCompleted: 0 };
      map.set(ym, row);
    }
    return row;
  }
  for (const b of bookings) {
    if (b.status === "completed") {
      ensure(b.tanggal.slice(0, 7)).sesiCompleted += 1;
    }
    if (b.status !== "cancelled" && b.dp_tanggal && b.dp_nominal) {
      ensure(b.dp_tanggal.slice(0, 7)).pendapatan += b.dp_nominal;
    }
    if (b.status !== "cancelled" && b.pelunasan_tanggal && b.pelunasan_nominal) {
      ensure(b.pelunasan_tanggal.slice(0, 7)).pendapatan += b.pelunasan_nominal;
    }
    // Sewa Space: tak ada tanggal pembayaran — revenue (harga/sesi ×
    // jumlah sesi) di-attribute ke bulan sesi (tanggal).
    if (b.status !== "cancelled" && b.booking_type === "space_rent") {
      ensure(b.tanggal.slice(0, 7)).pendapatan += spaceRentRevenue(b);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ym.localeCompare(b.ym));
}

export function LaporanCharts({ bookings }: Props) {
  const data = useMemo(() => buildMonthlyAgg(bookings), [bookings]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
        Belum ada data pembayaran atau sesi completed.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-display font-bold text-base mb-3">
          Pendapatan per Bulan
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--border)"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickFormatter={(v) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}jt`
                  : v >= 1_000
                    ? `${Math.round(v / 1_000)}rb`
                    : String(v)
              }
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => formatIDR(typeof v === "number" ? v : Number(v))}
            />
            <Bar
              dataKey="pendapatan"
              fill="var(--primary)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-display font-bold text-base mb-3">
          Jumlah Sesi Completed per Bulan
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--border)"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="sesiCompleted"
              fill="var(--accent)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
