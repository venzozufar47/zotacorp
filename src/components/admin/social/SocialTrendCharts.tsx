"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { DailyPoint } from "@/lib/social/analytics";

/**
 * Grafik tren. SELALU dimuat lewat pembungkus lazy (SocialTrendChartsLazy) —
 * recharts ±102KB gz dan tidak boleh masuk bundle awal halaman admin.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}rb`;
  return String(n);
}

const AXIS = { fontSize: 11, fill: "var(--color-muted-foreground)" };

/** Tooltip recharts meneruskan ValueType (bisa string/array/undefined), jadi
 *  koersi eksplisit — hari tanpa data sengaja tampil "—", bukan 0. */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function SocialTrendCharts({ daily }: { daily: DailyPoint[] }) {
  // Hari tanpa data dikirim sebagai null, BUKAN 0 — recharts memutus garis di
  // situ, yang jujur menggambarkan "tidak ada data" alih-alih mengarang
  // penurunan ke nol.
  const data = daily.map((d) => ({
    date: shortDate(d.date),
    views: d.views,
    posts: d.posts,
    er: d.engagementRate != null ? d.engagementRate * 100 : null,
    followers: d.followers,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Views harian">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickFormatter={compact} width={48} />
            <Tooltip
              formatter={(v) => [num(v)?.toLocaleString("id-ID") ?? "—", "Views"]}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
            <Bar dataKey="views" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Pertumbuhan follower">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickFormatter={compact} width={48} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v) => [num(v)?.toLocaleString("id-ID") ?? "—", "Follower"]}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
            <Line
              type="monotone"
              dataKey="followers"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Engagement rate (%)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} interval="preserveStartEnd" />
            <YAxis tick={AXIS} width={40} tickFormatter={(v) => `${v.toFixed(1)}`} />
            <Tooltip
              formatter={(v) => {
                const n = num(v);
                return [n != null ? `${n.toFixed(2)}%` : "—", "ER"];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
            <Line
              type="monotone"
              dataKey="er"
              stroke="var(--color-tertiary)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Jumlah konten terbit">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} interval="preserveStartEnd" />
            <YAxis tick={AXIS} width={32} allowDecimals={false} />
            <Tooltip
              formatter={(v) => [String(num(v) ?? 0), "Konten"]}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
            <Bar dataKey="posts" fill="var(--color-quaternary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <h4 className="font-display font-bold text-[13px] mb-2">{title}</h4>
      {children}
    </div>
  );
}
