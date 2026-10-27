"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Camera, TrendingUp, AlertTriangle, Percent, Search, X } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  captureHppSnapshots,
  type CostingDashboard as Dashboard,
} from "@/lib/actions/costing.actions";
import { rememberBrand } from "@/lib/costing/brands";
import { fmtPercent } from "./format";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-10-03" → "03 Okt 2026" */
const snapshotDateLabel = (ymd: string) => `${ymd.slice(8, 10)} ${MONTHS_SHORT[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;

type Row = Dashboard["rows"][number];
type SortKey =
  | "margin_asc" | "margin_desc" | "hpp_desc" | "hpp_asc" | "price_desc" | "price_asc"
  | "rise_desc" | "snap_desc" | "snap_asc" | "name_asc" | "name_desc";

/** Nilai kosong (null) selalu di akhir, kecuali margin terendah: margin tak valid justru perlu dilihat pertama. */
const num = (a: number | null, b: number | null, dir: 1 | -1, nullFirst = false) => {
  if (a == null && b == null) return 0;
  if (a == null) return nullFirst ? -1 : 1;
  if (b == null) return nullFirst ? 1 : -1;
  return (a - b) * dir;
};
const SORTS: { key: SortKey; label: string; title: string; cmp: (a: Row, b: Row) => number }[] = [
  { key: "margin_asc", label: "Margin terendah", title: "margin terendah", cmp: (a, b) => num(a.breakdown.marginPercent, b.breakdown.marginPercent, 1, true) },
  { key: "margin_desc", label: "Margin tertinggi", title: "margin tertinggi", cmp: (a, b) => num(a.breakdown.marginPercent, b.breakdown.marginPercent, -1) },
  { key: "hpp_desc", label: "HPP tertinggi", title: "HPP tertinggi", cmp: (a, b) => num(a.breakdown.hppUnit, b.breakdown.hppUnit, -1) },
  { key: "hpp_asc", label: "HPP terendah", title: "HPP terendah", cmp: (a, b) => num(a.breakdown.hppUnit, b.breakdown.hppUnit, 1) },
  { key: "price_desc", label: "Harga jual tertinggi", title: "harga jual tertinggi", cmp: (a, b) => num(a.breakdown.finalPrice ?? null, b.breakdown.finalPrice ?? null, -1) },
  { key: "price_asc", label: "Harga jual terendah", title: "harga jual terendah", cmp: (a, b) => num(a.breakdown.finalPrice ?? null, b.breakdown.finalPrice ?? null, 1) },
  { key: "rise_desc", label: "Kenaikan HPP terbesar", title: "kenaikan HPP terbesar", cmp: (a, b) => num(a.hppRosePct, b.hppRosePct, -1) },
  { key: "snap_desc", label: "Snapshot terbaru", title: "snapshot terbaru", cmp: (a, b) => (a.lastSnapshotDate && b.lastSnapshotDate ? b.lastSnapshotDate.localeCompare(a.lastSnapshotDate) : a.lastSnapshotDate ? -1 : b.lastSnapshotDate ? 1 : 0) },
  { key: "snap_asc", label: "Snapshot terlama", title: "snapshot terlama", cmp: (a, b) => (a.lastSnapshotDate && b.lastSnapshotDate ? a.lastSnapshotDate.localeCompare(b.lastSnapshotDate) : a.lastSnapshotDate ? 1 : b.lastSnapshotDate ? -1 : 0) },
  { key: "name_asc", label: "Nama A–Z", title: "nama A–Z", cmp: (a, b) => a.product.name.localeCompare(b.product.name, "id", { sensitivity: "base" }) },
  { key: "name_desc", label: "Nama Z–A", title: "nama Z–A", cmp: (a, b) => b.product.name.localeCompare(a.product.name, "id", { sensitivity: "base" }) },
];

export function CostingDashboard({
  brands,
  activeBrand,
  data,
}: {
  brands: string[];
  activeBrand: string | null;
  data: Dashboard;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("margin_asc");

  function selectBrand(bu: string) {
    rememberBrand(bu);
    router.push(`/admin/costing/dashboard?bu=${encodeURIComponent(bu)}`);
  }
  function snapshotAll() {
    if (!activeBrand) return;
    startTransition(async () => {
      const res = await captureHppSnapshots(activeBrand);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Snapshot ${res.data?.count ?? 0} produk diambil`);
      router.refresh();
    });
  }

  if (brands.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada brand. Tambahkan di{" "}
        <Link href="/admin/settings" className="underline">
          Settings
        </Link>
        .
      </p>
    );
  }

  // Pencarian hanya menyaring tampilan daftar; KPI di atas tetap dihitung dari semua produk.
  const q = query.trim().toLowerCase();
  const sort = SORTS.find((x) => x.key === sortKey) ?? SORTS[0];
  const shownRows = (q ? data.rows.filter((r) => r.product.name.toLowerCase().includes(q)) : [...data.rows]).sort(
    (a, b) => sort.cmp(a, b) || a.product.name.localeCompare(b.product.name, "id", { sensitivity: "base" })
  );

  // Bar RankList relatif thd margin tertinggi absolut (utk lebar bar).
  const maxMargin = Math.max(
    0.01,
    ...data.rows.map((r) => r.breakdown.marginPercent ?? 0)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/costing?bu=${encodeURIComponent(activeBrand ?? "")}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={13} /> Produk
        </Link>
        <select
          value={activeBrand ?? ""}
          onChange={(e) => selectBrand(e.target.value)}
          className="h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold"
        >
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={snapshotAll}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-60"
        >
          <Camera size={15} /> Ambil snapshot semua
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile
          icon={<Percent size={14} />}
          label="Rata-rata margin"
          value={
            data.avgMarginPercent != null
              ? fmtPercent(data.avgMarginPercent)
              : "—"
          }
          tone="default"
        />
        <Tile
          icon={<AlertTriangle size={14} />}
          label="Di bawah target margin"
          value={`${data.belowTargetCount}`}
          tone={data.belowTargetCount > 0 ? "warn" : "good"}
        />
        <Tile
          icon={<TrendingUp size={14} />}
          label="HPP naik >5%"
          value={`${data.hppRoseCount}`}
          tone={data.hppRoseCount > 0 ? "bad" : "good"}
        />
      </div>

      {/* RankList margin terendah */}
      <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 border-b-2 border-foreground">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Produk urut {sort.title}</span>
          <label className="ml-auto flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
            Urutkan
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-9 rounded-xl border-2 border-border bg-background px-2 text-base font-medium text-foreground sm:text-sm"
            >
              {SORTS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="relative block w-full sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk…"
              aria-label="Cari produk"
              className="h-9 w-full rounded-xl border-2 border-border bg-background pl-8 pr-8 text-base sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Hapus pencarian"
                className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X size={13} />
              </button>
            )}
          </label>
        </div>
        {data.rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Belum ada produk.
          </div>
        ) : shownRows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Tidak ada produk yang cocok dengan &ldquo;{query.trim()}&rdquo;.
          </div>
        ) : (
          <ul>
            {shownRows.map((r) => {
              const mp = r.breakdown.marginPercent;
              const below =
                mp != null &&
                r.product.price_method === "margin" &&
                mp < r.product.target_percent;
              const barPct =
                mp != null ? Math.max(2, (mp / maxMargin) * 100) : 0;
              const tone =
                r.breakdown.error || mp == null || mp <= 0
                  ? "bg-destructive"
                  : below || mp < 0.2
                    ? "bg-warning"
                    : "bg-success";
              return (
                <li
                  key={r.product.id}
                  className="relative border-b border-border/60 last:border-0"
                >
                  <div
                    className={`absolute inset-y-0 left-0 ${tone} opacity-10`}
                    style={{ width: `${barPct}%` }}
                    aria-hidden
                  />
                  <Link
                    href={`/admin/costing/${r.product.id}`}
                    className="relative flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
                  >
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="truncate font-medium text-[13px]">{r.product.name}</span>
                      <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
                        {r.lastSnapshotDate ? snapshotDateLabel(r.lastSnapshotDate) : "belum ada snapshot manual"}
                      </span>
                    </span>
                    {r.hppRosePct != null && r.hppRosePct > 0.05 && (
                      <span className="text-[10.5px] font-semibold text-destructive inline-flex items-center gap-0.5">
                        <TrendingUp size={11} /> HPP +
                        {fmtPercent(r.hppRosePct)}
                      </span>
                    )}
                    <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">
                      HPP {formatRp(r.breakdown.hppUnit)}
                    </span>
                    <span
                      className={`text-[13px] font-bold tabular-nums shrink-0 w-16 text-right ${
                        r.breakdown.error || mp == null || mp <= 0
                          ? "text-destructive"
                          : below || mp < 0.2
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {r.breakdown.error
                        ? "—"
                        : mp != null
                          ? fmtPercent(mp)
                          : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "default" | "warn" | "bad" | "good";
}) {
  const iconBg: Record<typeof tone, string> = {
    default: "bg-accent text-[var(--teal-600)]",
    warn: "bg-warning/15 text-warning",
    bad: "bg-destructive/15 text-destructive",
    good: "bg-success/15 text-success",
  };
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={`grid place-items-center size-6 rounded-md ${iconBg[tone]}`}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="font-display font-extrabold text-2xl tabular-nums">
        {value}
      </div>
    </div>
  );
}
