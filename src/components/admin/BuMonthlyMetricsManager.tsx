"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { upsertBuMetric, type BuMonthlyMetric } from "@/lib/actions/investor-metrics.actions";

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

export function BuMonthlyMetricsManager({
  businessUnits,
  initialMetrics,
  initialBu,
}: {
  businessUnits: string[];
  initialMetrics: BuMonthlyMetric[];
  initialBu: string;
}) {
  const [bu, setBu] = useState(initialBu);
  const [rows, setRows] = useState<BuMonthlyMetric[]>(initialMetrics);
  const [pending, startTransition] = useTransition();

  // Re-fetch ketika BU berubah — pakai endpoint server action via
  // fetch ke /api... eh, kita gak punya endpoint. Reload page dengan
  // ?bu= query.
  useEffect(() => {
    if (bu === initialBu) return;
    window.location.assign(`/admin/investors?tab=metrics&bu=${encodeURIComponent(bu)}`);
  }, [bu, initialBu]);

  function updateCell(
    year: number,
    month: number,
    patch: Partial<BuMonthlyMetric>
  ) {
    setRows((prev) =>
      prev.map((r) =>
        r.periodYear === year && r.periodMonth === month
          ? { ...r, ...patch }
          : r
      )
    );
  }

  function save(row: BuMonthlyMetric) {
    startTransition(async () => {
      const res = await upsertBuMetric({
        businessUnit: row.businessUnit,
        periodYear: row.periodYear,
        periodMonth: row.periodMonth,
        utilizationPct: row.utilizationPct,
        // ordersCount/uniqueCustomers — only persist when admin
        // explicitly overrides (auto-derived stays null in DB).
        ordersCount: row.ordersAutoDerived ? null : row.ordersCount,
        uniqueCustomers: row.customersAutoDerived
          ? null
          : row.uniqueCustomers,
        productionCapacityMax: row.productionCapacityMax,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal simpan");
        return;
      }
      toast.success("Metric tersimpan");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-xs flex items-center gap-2">
          <span className="text-muted-foreground">Unit bisnis:</span>
          <select
            value={bu}
            onChange={(e) => setBu(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            {businessUnits.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        {pending && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Menyimpan…
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Utilization wajib admin input. Orders &amp; Customers di-auto
        derive dari pos_sales untuk BU yang punya rekening POS;
        admin bisa override dengan mengetik manual.
      </p>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bulan
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Utilization (%)
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Orders
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Unique customers
              </th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Kapasitas max
              </th>
              <th className="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.periodYear}-${r.periodMonth}`}
                className="border-t border-border align-middle"
              >
                <td className="px-3 py-2 font-medium">
                  {MONTH_NAMES[r.periodMonth - 1]} {r.periodYear}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.1"
                    value={r.utilizationPct ?? ""}
                    onChange={(e) =>
                      updateCell(r.periodYear, r.periodMonth, {
                        utilizationPct:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                    className="w-20 rounded border border-border bg-background px-2 py-1 text-sm tabular-nums text-right"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      value={r.ordersCount ?? ""}
                      onChange={(e) =>
                        updateCell(r.periodYear, r.periodMonth, {
                          ordersCount:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          ordersAutoDerived: false,
                        })
                      }
                      placeholder="—"
                      className="w-24 rounded border border-border bg-background px-2 py-1 text-sm tabular-nums text-right"
                    />
                    {r.ordersAutoDerived && (
                      <span
                        className="text-[9px] uppercase tracking-wider font-bold text-primary px-1 py-0.5 rounded bg-primary/10"
                        title="Auto-derived dari pos_sales"
                      >
                        auto
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      value={r.uniqueCustomers ?? ""}
                      onChange={(e) =>
                        updateCell(r.periodYear, r.periodMonth, {
                          uniqueCustomers:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          customersAutoDerived: false,
                        })
                      }
                      placeholder="—"
                      className="w-24 rounded border border-border bg-background px-2 py-1 text-sm tabular-nums text-right"
                    />
                    {r.customersAutoDerived && (
                      <span
                        className="text-[9px] uppercase tracking-wider font-bold text-primary px-1 py-0.5 rounded bg-primary/10"
                        title="Auto-derived dari pos_sales"
                      >
                        auto
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={r.productionCapacityMax ?? ""}
                    onChange={(e) =>
                      updateCell(r.periodYear, r.periodMonth, {
                        productionCapacityMax:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                    placeholder="—"
                    className="w-24 rounded border border-border bg-background px-2 py-1 text-sm tabular-nums text-right"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => save(r)}
                    disabled={pending}
                    className="text-primary text-xs font-semibold hover:underline"
                  >
                    Simpan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
