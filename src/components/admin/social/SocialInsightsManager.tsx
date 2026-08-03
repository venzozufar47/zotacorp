"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  LayoutGrid,
  Users,
  TrendingUp,
  AlertTriangle,
  CalendarDays,
  Info,
  PencilLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateID } from "@/lib/utils/date-formats";
import { Sparkline } from "@/components/admin/costing/Sparkline";
import { SocialTrendChartsLazy } from "./SocialTrendChartsLazy";
import { SocialManualInput } from "./SocialManualInput";
import { SOCIAL_METRICS, metricGaps } from "@/lib/social/metrics";
import { PLATFORM_LABELS, type SocialAccount, type SocialFormOptions, type SocialKpiTarget } from "@/lib/social/types";
import type { DateRange } from "@/lib/utils/date-range";
import type { SocialDashboard } from "@/lib/actions/social.actions";

type Tab = "ringkasan" | "konten" | "kreator" | "tren" | "input";

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: "ringkasan", label: "Ringkasan", icon: BarChart3 },
  { key: "konten", label: "Konten", icon: LayoutGrid },
  { key: "kreator", label: "Kreator", icon: Users },
  { key: "tren", label: "Tren", icon: TrendingUp },
  { key: "input", label: "Input Manual", icon: PencilLine },
];

/** Metrik yang masuk akal untuk memeringkat kreator. */
const RANK_METRICS = SOCIAL_METRICS.filter((m) => m.scopes.includes("creator"));

function fmt(n: number | null | undefined, opts?: { percent?: boolean }): string {
  // Sengaja "—" dan bukan 0: null berarti provider tidak menyediakan angkanya,
  // dan menuliskan 0 adalah klaim palsu bahwa nilainya nol.
  if (n == null) return "—";
  if (opts?.percent) return `${(n * 100).toFixed(2)}%`;
  return n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export function SocialInsightsManager({
  range,
  dashboard,
  error,
  accounts,
  options,
  targets,
  filters,
}: {
  range: DateRange;
  dashboard: SocialDashboard | null;
  error: string | null;
  accounts: SocialAccount[];
  options: SocialFormOptions;
  targets: SocialKpiTarget[];
  filters: { bu: string; platform: string; account: string };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [rankMetric, setRankMetric] = useState("views24hAvg");

  function push(next: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = {
      from,
      to,
      bu: filters.bu,
      platform: filters.platform,
      account: filters.account,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    router.push(`/admin/social?${p.toString()}`);
  }

  function preset(days: number) {
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const start = new Date(today.getTime() - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
    setFrom(start);
    setTo(end);
    push({ from: start, to: end });
  }

  /** Platform yang tidak bisa menyuplai metrik peringkat yang sedang dipilih —
   *  peringatan ini yang mencegah kreator TikTok dinilai nol pada angka yang
   *  memang tidak pernah ada di API-nya. */
  const rankWarning = useMemo(() => {
    if (!dashboard) return null;
    const key = RANK_METRICS.find((m) => m.key === rankMetric)?.key ?? "";
    const gaps = metricGaps(key);
    const hit = dashboard.platformsInView.filter((p) => gaps.includes(p));
    if (hit.length === 0) return null;
    return hit.map((p) => PLATFORM_LABELS[p as "tiktok"] ?? p).join(" & ");
  }, [dashboard, rankMetric]);

  const sortedCreators = useMemo(() => {
    if (!dashboard) return [];
    const pick = (c: (typeof dashboard.creators)[number]): number => {
      switch (rankMetric) {
        case "posts_count": return c.posts;
        case "views_total": return c.views ?? -1;
        case "views_median": return c.viewsMedian ?? -1;
        case "engagement_rate": return c.engagementRate ?? -1;
        case "likes_total": return c.likes ?? -1;
        case "comments_total": return c.comments ?? -1;
        case "shares_total": return c.shares ?? -1;
        case "saves_total": return c.saves ?? -1;
        case "reach_total": return c.reach ?? -1;
        default: return c.views24hAvg ?? -1;
      }
    };
    return [...dashboard.creators].sort((a, b) => pick(b) - pick(a));
  }, [dashboard, rankMetric]);

  const noData = !dashboard || dashboard.posts.length === 0;

  return (
    <div className="space-y-4">
      {/* Kontrol rentang + filter */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Dari</span>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Sampai</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Unit bisnis</span>
            <select value={filters.bu} onChange={(e) => push({ bu: e.target.value })} className={selectCls}>
              <option value="">Semua unit</option>
              {options.businessUnits.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Platform</span>
            <select value={filters.platform} onChange={(e) => push({ platform: e.target.value })} className={selectCls}>
              <option value="">Semua platform</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Akun</span>
            <select value={filters.account} onChange={(e) => push({ account: e.target.value })} className={selectCls}>
              <option value="">Semua akun</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {PLATFORM_LABELS[a.platform]} · @{a.handle}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => push({ from, to })}>Terapkan</Button>
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => preset(d)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] hover:bg-muted"
            >
              <CalendarDays size={12} /> {d === 365 ? "1 tahun" : `${d} hari`}
            </button>
          ))}
          <span className="text-[12px] text-muted-foreground ml-auto">
            {formatDateID(range.from)} – {formatDateID(range.to)}
          </span>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-[13px]">{error}</p>
      )}

      {/* Tab */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium border-2 transition",
                on
                  ? "bg-primary text-primary-foreground border-foreground shadow-hard-sm"
                  : "bg-card border-border hover:bg-muted"
              )}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "input" && <SocialManualInput accounts={accounts} />}

      {noData && !error && tab !== "input" && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-6 text-center space-y-1">
          <Info className="mx-auto text-muted-foreground" size={20} />
          <p className="font-display font-bold text-[14px]">Belum ada data konten</p>
          <p className="text-[12.5px] text-muted-foreground max-w-lg mx-auto">
            {dashboard?.accountsInView === 0
              ? "Belum ada akun yang cocok dengan filter ini."
              : "Belum ada konten pada rentang ini. Sambil menunggu app review Instagram/TikTok disetujui, kamu bisa mengisinya lewat tab Input Manual."}
          </p>
        </div>
      )}

      {dashboard && !noData && tab === "ringkasan" && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Konten terbit" value={fmt(dashboard.totals.posts)} />
          <Kpi label="Total views" value={fmt(dashboard.totals.views)} />
          <Kpi label="Total jangkauan" value={fmt(dashboard.totals.reach)} hint="Tidak tersedia di TikTok" />
          <Kpi label="Engagement rate" value={fmt(dashboard.totals.engagementRate, { percent: true })} />
          <Kpi label="Like" value={fmt(dashboard.totals.likes)} />
          <Kpi label="Komentar" value={fmt(dashboard.totals.comments)} />
          <Kpi label="Share" value={fmt(dashboard.totals.shares)} />
          <Kpi
            label="Pertumbuhan follower"
            value={
              dashboard.totals.followerGrowth == null
                ? "—"
                : `${dashboard.totals.followerGrowth >= 0 ? "+" : ""}${fmt(dashboard.totals.followerGrowth)}`
            }
          />
        </div>
      )}

      {dashboard && !noData && tab === "konten" && (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums">
            <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr className="text-left">
                <th className="p-2">Konten</th>
                <th className="p-2">Akun</th>
                <th className="p-2">Kreator</th>
                <th className="p-2 text-right">Views</th>
                <th className="p-2 text-right">@24j</th>
                <th className="p-2 text-right">@48j</th>
                <th className="p-2 text-right">@7h</th>
                <th className="p-2 text-right">ER</th>
                <th className="p-2">Tren</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.posts.map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="p-2 max-w-[280px]">
                    <div className="flex gap-2">
                      {p.thumbnail_url && (
                        // URL CDN kedaluwarsa & host-nya tidak didaftarkan ke
                        // next/image dengan sengaja — pakai <img> biasa.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnail_url}
                          alt=""
                          loading="lazy"
                          className="size-10 rounded-lg object-cover border border-border"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-[11.5px]">{p.caption ?? "—"}</div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {formatDateID(p.published_date)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-2 whitespace-nowrap">@{p.accountHandle}</td>
                  <td className="p-2 whitespace-nowrap">{p.creatorName ?? "—"}</td>
                  <td className="p-2 text-right">{fmt(p.views)}</td>
                  <td className="p-2 text-right">{fmt(p.v24)}</td>
                  <td className="p-2 text-right">{fmt(p.v48)}</td>
                  <td className="p-2 text-right">{fmt(p.v7d)}</td>
                  <td className="p-2 text-right">{fmt(p.engagement_rate, { percent: true })}</td>
                  <td className="p-2"><Sparkline values={p.trajectory} width={80} height={24} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dashboard && !noData && tab === "kreator" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] text-muted-foreground">Peringkat berdasarkan</label>
            <select
              value={rankMetric}
              onChange={(e) => setRankMetric(e.target.value)}
              className="h-9 rounded-xl border border-border bg-card px-3 text-[13px]"
            >
              {RANK_METRICS.map((m) => (
                <option key={m.key} value={m.key === "views_24h_avg" ? "views24hAvg" : m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {rankWarning && (
            <p className="flex items-start gap-2 rounded-xl border-2 border-tertiary bg-tertiary/15 px-3 py-2 text-[12.5px]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>{rankWarning}</strong> tidak menyediakan metrik ini lewat API — kreator
                di platform itu akan tampak kosong. Jangan pakai metrik ini untuk memeringkat
                lintas platform.
              </span>
            </p>
          )}

          <div className="rounded-2xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-[12.5px] tabular-nums">
              <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">#</th>
                  <th className="p-2">Kreator</th>
                  <th className="p-2 text-right">Konten</th>
                  <th className="p-2 text-right">Views</th>
                  <th className="p-2 text-right">Median</th>
                  <th className="p-2 text-right">Rata² @24j</th>
                  <th className="p-2 text-right">ER</th>
                  <th className="p-2 text-right">Jangkauan</th>
                </tr>
              </thead>
              <tbody>
                {sortedCreators.map((c, i) => (
                  <tr key={c.creatorId ?? "none"} className="border-t border-border">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2 font-medium">{c.creatorName}</td>
                    <td className="p-2 text-right">{c.posts}</td>
                    <td className="p-2 text-right">{fmt(c.views)}</td>
                    <td className="p-2 text-right">{fmt(c.viewsMedian)}</td>
                    <td className="p-2 text-right">
                      {fmt(c.views24hAvg)}
                      {c.views24hSample > 0 && c.views24hSample < c.posts && (
                        <span className="text-[10px] text-muted-foreground"> ({c.views24hSample}/{c.posts})</span>
                      )}
                    </td>
                    <td className="p-2 text-right">{fmt(c.engagementRate, { percent: true })}</td>
                    <td className="p-2 text-right">{fmt(c.reach)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11.5px] text-muted-foreground">
            Kolom <strong>Rata² @24j</strong> memakai tangkapan 24 jam pertama tiap konten,
            sehingga konten lama tidak otomatis unggul. Angka dalam kurung = berapa konten yang
            sudah punya tangkapan itu.
          </p>

          {targets.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-3">
              <h4 className="font-display font-bold text-[13px] mb-1">Target KPI aktif</h4>
              <ul className="text-[12px] space-y-0.5">
                {targets.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span>
                      {t.creatorName ?? t.accountLabel ?? t.businessUnitName} · {t.metricKey}
                    </span>
                    <span className="tabular-nums">
                      {t.comparator === "gte" ? "≥" : "≤"} {t.targetValue.toLocaleString("id-ID")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {dashboard && !noData && tab === "tren" && <SocialTrendChartsLazy daily={dashboard.daily} />}
    </div>
  );
}

const selectCls = "mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-extrabold text-[22px] tabular-nums leading-tight">{value}</div>
      {hint && value === "—" && (
        <div className="text-[10.5px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
