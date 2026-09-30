"use client";

import { useMemo, useRef, useState } from "react";
import { BadgeDollarSign, ChevronDown, Eye, MousePointerClick, Target, TrendingUp, Users } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { cn } from "@/lib/utils";
import type {
  MetaAdsAdsetGroup,
  MetaAdsInsights,
  MetaAdsSnapshot,
} from "@/lib/actions/meta-ads.actions";

const fmtInt = (n: number) => n.toLocaleString("id-ID");

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/70 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-[var(--teal-600)]">
          <Icon size={14} />
        </span>
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="mt-2 font-display text-xl font-extrabold tabular-nums text-foreground">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SnapshotGrid({ snapshot }: { snapshot: MetaAdsSnapshot }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <MetricCard icon={BadgeDollarSign} label="Spend" value={formatRp(snapshot.spend)} />
      <MetricCard icon={Users} label="Reach" value={fmtInt(snapshot.reach)} />
      <MetricCard
        icon={Eye}
        label="CPM"
        value={snapshot.cpm != null ? formatRp(snapshot.cpm) : "—"}
        sub="per 1.000 impresi"
      />
      <MetricCard
        icon={MousePointerClick}
        label="CPC"
        value={snapshot.cpc != null ? formatRp(snapshot.cpc) : "—"}
        sub={`${fmtInt(snapshot.clicks)} klik`}
      />
      <MetricCard
        icon={Target}
        label={snapshot.resultLabel ? `Hasil (${snapshot.resultLabel})` : "Hasil"}
        value={snapshot.results != null ? fmtInt(snapshot.results) : "—"}
      />
      <MetricCard
        icon={BadgeDollarSign}
        label="Biaya / Hasil"
        value={snapshot.costPerResult != null ? formatRp(snapshot.costPerResult) : "—"}
      />
      <MetricCard
        icon={TrendingUp}
        label="ROAS"
        value={snapshot.roas != null ? `${snapshot.roas.toFixed(2)}x` : "—"}
        sub={
          snapshot.roas == null
            ? "Butuh tracking nilai pembelian (pixel/CAPI)"
            : undefined
        }
      />
    </div>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

function ResultCell({ snapshot }: { snapshot: MetaAdsSnapshot }) {
  return (
    <td className="px-4 py-3 text-right tabular-nums text-foreground whitespace-nowrap">
      {snapshot.results != null ? fmtInt(snapshot.results) : "—"}
      {snapshot.resultLabel && (
        <span className="block text-[10.5px] text-muted-foreground">
          {snapshot.resultLabel}
        </span>
      )}
    </td>
  );
}

function AdsetGroupRow({ group }: { group: MetaAdsAdsetGroup }) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Membuka/menutup baris mengubah tinggi total tabel — kalau baris ini
  // sedang dekat bawah layar, browser meng-clamp posisi scroll ke tinggi
  // dokumen yang baru, yang terasa seperti "loncat ke atas" tanpa
  // diminta. Kunci baris yang diklik tetap di posisi layar yang sama
  // (bandingkan posisinya sebelum & sesudah toggle, kompensasi selisihnya)
  // supaya mouse tidak perlu ikut naik/turun untuk klik lagi.
  function toggle() {
    const before = rowRef.current?.getBoundingClientRect().top ?? null;
    setOpen((v) => !v);
    if (before == null) return;
    requestAnimationFrame(() => {
      const after = rowRef.current?.getBoundingClientRect().top;
      if (after == null) return;
      const delta = after - before;
      // `behavior: "instant"` wajib eksplisit — CSS `scroll-behavior:
      // smooth` di <html> (lihat app/globals) bikin bentuk 2-argumen
      // scrollBy ikut teranimasi, jadi kompensasinya sendiri malah
      // terlihat seperti loncatan.
      if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
    });
  }

  return (
    <>
      <tr
        ref={rowRef}
        className="border-b border-border/40 cursor-pointer bg-muted/40 hover:bg-muted/70"
        onClick={toggle}
      >
        <td className="px-4 py-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <ChevronDown
              size={13}
              className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground truncate max-w-[180px]">
                  {group.adsetName}
                </span>
                <StatusBadge label={group.statusLabel} active={group.statusActive} />
              </div>
              <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                Campaign: {group.campaignName || "—"} · {group.ads.length} ad
                {group.createdTime && <> · dibuat {formatShortDate(group.createdTime)}</>}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
          {formatRp(group.totals.spend)}
        </td>
        <ResultCell snapshot={group.totals} />
        <td className="px-4 py-3 text-right tabular-nums text-foreground whitespace-nowrap">
          {group.totals.costPerResult != null ? formatRp(group.totals.costPerResult) : "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-foreground whitespace-nowrap">
          {group.totals.roas != null ? `${group.totals.roas.toFixed(2)}x` : "—"}
        </td>
      </tr>
      {open &&
        group.ads.map((ad) => (
          <tr key={ad.adId} className="border-b border-border/30 last:border-0">
            <td className="pl-9 pr-4 py-2.5 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-foreground truncate max-w-[160px]">{ad.adName}</span>
                <StatusBadge label={ad.statusLabel} active={ad.statusActive} />
              </div>
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap">
              {formatRp(ad.spend)}
            </td>
            <ResultCell snapshot={ad} />
            <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap">
              {ad.costPerResult != null ? formatRp(ad.costPerResult) : "—"}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap">
              {ad.roas != null ? `${ad.roas.toFixed(2)}x` : "—"}
            </td>
          </tr>
        ))}
    </>
  );
}

type SortKey = "spend" | "status" | "roas" | "results" | "date";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "spend", label: "Spend terbesar" },
  { value: "status", label: "Aktif dulu" },
  { value: "roas", label: "ROAS tertinggi" },
  { value: "results", label: "Hasil terbanyak" },
  { value: "date", label: "Tanggal terbaru" },
];

function sortGroups(groups: MetaAdsAdsetGroup[], sortBy: SortKey): MetaAdsAdsetGroup[] {
  const sorted = [...groups];
  switch (sortBy) {
    case "status":
      sorted.sort(
        (a, b) => Number(b.statusActive) - Number(a.statusActive) || b.totals.spend - a.totals.spend
      );
      break;
    case "roas":
      sorted.sort((a, b) => (b.totals.roas ?? -1) - (a.totals.roas ?? -1));
      break;
    case "results":
      sorted.sort((a, b) => (b.totals.results ?? -1) - (a.totals.results ?? -1));
      break;
    case "date":
      sorted.sort(
        (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
      );
      break;
    default:
      sorted.sort((a, b) => b.totals.spend - a.totals.spend);
  }
  return sorted;
}

function AdsetBreakdownTable({ groups }: { groups: MetaAdsAdsetGroup[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const sorted = useMemo(() => sortGroups(groups, sortBy), [groups, sortBy]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Belum ada ad set dengan spend bulan ini.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="adset-sort" className="text-[11px] text-muted-foreground">
          Urutkan
        </label>
        <select
          id="adset-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded-lg border-2 border-foreground/15 bg-card px-2 py-1 text-[12px] font-medium focus:border-primary focus:outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Ad Set</th>
              <th className="px-4 py-3 text-right">Spend</th>
              <th className="px-4 py-3 text-right">Hasil</th>
              <th className="px-4 py-3 text-right">Biaya/Hasil</th>
              <th className="px-4 py-3 text-right">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((group) => (
              <AdsetGroupRow key={group.adsetId} group={group} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MetaAdsDashboard({ insights }: { insights: MetaAdsInsights }) {
  const periodLabel = insights.period === "last_month" ? "bulan kemarin" : "bulan ini";
  return (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <h2 className="font-display font-semibold text-[15px] text-foreground">
          Hari ini
        </h2>
        <SnapshotGrid snapshot={insights.today} />
      </section>
      <section className="space-y-2.5">
        <h2 className="font-display font-semibold text-[15px] text-foreground capitalize">
          {periodLabel === "bulan ini" ? "Bulan ini" : "Bulan kemarin"}
        </h2>
        <SnapshotGrid snapshot={insights.month} />
      </section>
      <section className="space-y-2.5">
        <h2 className="font-display font-semibold text-[15px] text-foreground">
          Per Ad Set ({periodLabel})
        </h2>
        <p className="text-[11px] text-muted-foreground -mt-1.5">
          Klik satu baris ad set untuk lihat ad-ad di dalamnya.
        </p>
        <AdsetBreakdownTable groups={insights.adsetGroups} />
      </section>
      <p className="text-[11px] text-muted-foreground">
        Ad account: {insights.accountName} · Sumber: Meta Marketing API
      </p>
      {/* Ruang cadangan scroll: tanpa ini, menutup baris ad set paling
          bawah SAAT sudah scroll mentok membuat browser meng-clamp
          posisi scroll ke tinggi dokumen yang baru (lebih pendek) — dan
          tidak ada cara mengoreksinya balik karena posisi lama itu
          sendiri sudah tidak ada lagi di dokumen. Spacer ini memberi
          headroom supaya penutupan baris (yang tingginya wajar) tidak
          pernah sampai memaksa clamp itu. */}
      <div className="h-56" aria-hidden="true" />
    </div>
  );
}
