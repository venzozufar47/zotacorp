"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { PnLReport } from "@/lib/cashflow/pnl";
import { PusatAllocationEditor } from "./PusatAllocationEditor";
import { PnLTable } from "./PnLTable";
import { PnLCharts } from "./PnLCharts";

interface Props {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  report: PnLReport;
  presets: { credit: string[]; debit: string[] };
  nonOperatingCategories: string[];
}

function ymString(x: { year: number; month: number }): string {
  return `${x.year}-${String(x.month).padStart(2, "0")}`;
}

function labelYM(year: number, month: number): string {
  const names = [
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
  return `${names[month - 1]} ${year}`;
}

/**
 * Top-level PnL UI. Period picker syncs via URL so the server can
 * re-fetch with force-dynamic. Allocation editor + table below
 * operate on the report already returned.
 */
export function PnLClient({
  businessUnit,
  from,
  to,
  report,
  nonOperatingCategories,
}: Props) {
  const router = useRouter();
  const [fromStr, setFromStr] = useState(ymString(from));
  const [toStr, setToStr] = useState(ymString(to));

  // Count unallocated / unbalanced across the range for banner.
  const unallocatedByMonth = useMemo(() => {
    const out: Array<{
      year: number;
      month: number;
      label: string;
      items: Array<{ category: string; side: "credit" | "debit"; pusatTotal: number }>;
    }> = [];
    for (const m of report.months) {
      const missing = m.pusatBreakdown.filter(
        (p) => p.unallocated || p.unbalanced
      );
      if (missing.length === 0) continue;
      out.push({
        year: m.year,
        month: m.month,
        label: labelYM(m.year, m.month),
        items: missing.map((p) => ({
          category: p.category,
          side: p.side,
          pusatTotal: p.pusatTotal,
        })),
      });
    }
    return out;
  }, [report]);

  function applyRange() {
    const params = new URLSearchParams();
    params.set("bu", businessUnit);
    params.set("from", fromStr);
    params.set("to", toStr);
    router.push(`/admin/finance/pnl?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      {/* Period picker */}
      <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-border bg-card p-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Periode:
        </span>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Dari</span>
          <input
            type="month"
            value={fromStr}
            onChange={(e) => setFromStr(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Sampai</span>
          <input
            type="month"
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
        </label>
        <button
          type="button"
          onClick={applyRange}
          className="ml-auto inline-flex items-center h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition"
        >
          Terapkan
        </button>
      </div>

      {/* Warning banner */}
      {unallocatedByMonth.length > 0 && (
        <div className="rounded-2xl border-2 border-warning/40 bg-warning/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-warning flex items-center gap-2">
            <AlertTriangle size={14} />
            {unallocatedByMonth.reduce(
              (s, m) => s + m.items.length,
              0
            )}{" "}
            kategori Pusat belum teralokasi penuh
          </p>
          <p className="text-xs text-foreground leading-snug">
            Selama belum teralokasi atau balanced, transaksi Pusat
            tersebut <strong>tidak dihitung</strong> ke PnL cabang. Isi
            split Semarang + Pare-nya di tabel alokasi di bawah.
          </p>
          <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-5 list-disc">
            {unallocatedByMonth.slice(0, 5).map((m) => (
              <li key={`${m.year}-${m.month}`}>
                <strong className="text-foreground">{m.label}</strong>:{" "}
                {m.items
                  .slice(0, 3)
                  .map(
                    (it) =>
                      `${it.category} (${
                        it.side === "credit" ? "+" : "−"
                      } Rp ${it.pusatTotal.toLocaleString("id-ID")})`
                  )
                  .join(", ")}
                {m.items.length > 3 && ` · +${m.items.length - 3} lainnya`}
              </li>
            ))}
            {unallocatedByMonth.length > 5 && (
              <li>
                …dan {unallocatedByMonth.length - 5} bulan lainnya di tabel di
                bawah
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Charts */}
      <PnLCharts report={report} />

      {/* Main PnL table */}
      <PnLTable report={report} nonOperatingCategories={nonOperatingCategories} />

      {/* Pusat allocation editor — shown below since it's the action
          admin takes to fix the warning banner above. */}
      <PusatAllocationEditor businessUnit={businessUnit} report={report} />
    </div>
  );
}
