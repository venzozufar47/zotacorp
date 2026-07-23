"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Camera, TrendingUp, AlertTriangle, Percent } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  captureHppSnapshots,
  type CostingDashboard as Dashboard,
} from "@/lib/actions/costing.actions";
import { fmtPercent } from "./format";

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

  function selectBrand(bu: string) {
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
        <div className="px-4 py-2.5 border-b-2 border-foreground text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          Produk urut margin terendah
        </div>
        {data.rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Belum ada produk.
          </div>
        ) : (
          <ul>
            {data.rows.map((r) => {
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
                    <span className="flex-1 min-w-0 truncate font-medium text-[13px]">
                      {r.product.name}
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
