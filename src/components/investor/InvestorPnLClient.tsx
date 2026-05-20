"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PnLReport } from "@/lib/cashflow/pnl";
import { PnLSankey } from "@/components/admin/finance/PnLSankey";
import { PnLCharts } from "@/components/admin/finance/PnLCharts";
import { PnLTable } from "@/components/admin/finance/PnLTable";

function ymString(x: { year: number; month: number }): string {
  return `${x.year}-${String(x.month).padStart(2, "0")}`;
}

/**
 * PnL view investor — reuse PnLSankey + PnLCharts + PnLTable (read-only
 * display) tanpa PusatAllocationEditor (admin-only edit). Period
 * picker URL-sync ke /investor/finance/pnl.
 */
export function InvestorPnLClient({
  businessUnit,
  from,
  to,
  report,
  nonOperatingCategories,
}: {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  report: PnLReport;
  nonOperatingCategories: string[];
}) {
  const router = useRouter();
  const [fromStr, setFromStr] = useState(ymString(from));
  const [toStr, setToStr] = useState(ymString(to));

  function applyRange() {
    const params = new URLSearchParams();
    params.set("bu", businessUnit);
    params.set("from", fromStr);
    params.set("to", toStr);
    router.push(`/investor/finance/pnl?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
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

      <PnLSankey report={report} />
      <PnLCharts report={report} />
      <PnLTable
        report={report}
        nonOperatingCategories={nonOperatingCategories}
      />
    </div>
  );
}
