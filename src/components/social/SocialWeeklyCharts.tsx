"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SocialReportPage } from "@/lib/actions/social-report.actions";

/**
 * Bagan laporan mingguan: Performance (views, viewers, engagement rate), Audience (followers, net follows, follows, unfollows) dan
 * Routine (post, reels, stories). Bisa per akun atau gabungan semua akun satu brand. SELALU dimuat lewat pembungkus
 * lazy — recharts besar dan tidak boleh masuk bundle awal.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const shortDate = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
// Maksimal 2 desimal (tanpa nol di belakang): dengan 1 desimal, tick sumbu yang berdekatan bisa tampil kembar (3.5rb, 3.5rb).
const trim = (n: number) => String(Number(n.toFixed(2)));
const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `${trim(n / 1_000_000)}jt` : Math.abs(n) >= 1_000 ? `${trim(n / 1_000)}rb` : String(n));
const AXIS = { fontSize: 11, fill: "var(--color-muted-foreground)" };
const WEEKS = 12;

const C = {
  a: "var(--color-primary, #0e7490)",
  b: "var(--color-warning, #d97706)",
  c: "var(--color-success, #16a34a)",
  d: "var(--color-destructive, #dc2626)",
};

export function SocialWeeklyCharts({ page }: { page: SocialReportPage }) {
  const [scope, setScope] = useState<string>(`brand:${page.brands[0]?.id ?? ""}`);

  const data = useMemo(() => {
    const [kind, id] = scope.split(":");
    const accountIds = new Set(
      page.brands.flatMap((b) => (kind === "brand" ? (b.id === id ? b.accounts : []) : b.accounts.filter((a) => a.id === id))).map((a) => a.id)
    );
    const byWeek = new Map<string, { accounts: number; views: number; viewers: number; interactions: number; followers: number; follows: number; unfollows: number; posts: number; reels: number; stories: number }>();
    for (const r of page.history) {
      if (!accountIds.has(r.accountId)) continue;
      const cur = byWeek.get(r.weekStart) ?? { accounts: 0, views: 0, viewers: 0, interactions: 0, followers: 0, follows: 0, unfollows: 0, posts: 0, reels: 0, stories: 0 };
      cur.accounts += 1;
      cur.views += r.views;
      cur.viewers += r.viewers;
      cur.interactions += r.interactions;
      cur.followers += r.followers;
      cur.follows += r.follows;
      cur.unfollows += r.unfollows;
      cur.posts += r.posts;
      cur.reels += r.reels;
      cur.stories += r.stories;
      byWeek.set(r.weekStart, cur);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-WEEKS)
      .map(([w, v]) => ({
        week: shortDate(w),
        ...v,
        // Gabungan beberapa akun: minggu yang belum dilaporkan semua akun tidak boleh menampilkan followers yang "turun" palsu.
        followers: v.accounts < accountIds.size ? null : v.followers,
        net: v.follows - v.unfollows,
        // Engagement rate = interaksi ÷ views (%), sama dengan definisi di scorecard; tanpa views → kosong, bukan 0%.
        engagement: v.views > 0 ? Math.round((v.interactions / v.views) * 10_000) / 100 : null,
      }));
  }, [page, scope]);

  return (
    <div className="space-y-4">
      <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Tampilkan</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 rounded-lg border-2 border-border bg-background px-2.5 text-[13px]">
          {page.brands.map((b) => (
            <optgroup key={b.id} label={b.label}>
              <option value={`brand:${b.id}`}>{b.label} — semua platform</option>
              {b.accounts.map((a) => (
                <option key={a.id} value={`account:${a.id}`}>
                  {b.label} — {a.platform === "instagram" ? "Instagram" : "TikTok"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="text-muted-foreground">{WEEKS} minggu terakhir yang sudah dilaporkan</span>
      </label>

      {data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">Belum ada laporan mingguan untuk pilihan ini.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Performance">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={AXIS} />
                <YAxis tick={AXIS} tickFormatter={compact} width={46} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="views" name="Views" stroke={C.a} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="viewers" name="Viewers" stroke={C.b} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Performance — engagement rate">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={AXIS} />
                <YAxis tick={AXIS} tickFormatter={(v: number) => `${v}%`} width={46} domain={[0, "auto"]} />
                <Tooltip formatter={(v) => (typeof v === "number" ? `${v}%` : v)} />
                <Line type="monotone" dataKey="engagement" name="Engagement rate" stroke={C.d} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Audience — followers">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={AXIS} />
                <YAxis tick={AXIS} tickFormatter={compact} width={46} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="followers" name="Followers" stroke={C.a} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Audience — follows, unfollows, net follows">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={AXIS} />
                <YAxis tick={AXIS} width={40} />
                <Tooltip />
                <Legend />
                <Bar dataKey="follows" name="Follows" fill={C.c} radius={[3, 3, 0, 0]} />
                <Bar dataKey="unfollows" name="Unfollows" fill={C.d} radius={[3, 3, 0, 0]} />
                <Bar dataKey="net" name="Net follows" fill={C.a} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Routine — post, reels, stories">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={AXIS} />
                <YAxis tick={AXIS} width={34} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="posts" name="Post" fill={C.a} radius={[3, 3, 0, 0]} />
                <Bar dataKey="reels" name="Reels" fill={C.b} radius={[3, 3, 0, 0]} />
                <Bar dataKey="stories" name="Stories" fill={C.c} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-3.5">
      <h4 className="mb-2 font-display text-[13px] font-bold">{title}</h4>
      {children}
    </div>
  );
}
