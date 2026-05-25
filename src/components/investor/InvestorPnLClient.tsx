"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { PnLReport } from "@/lib/cashflow/pnl";
import {
  MonthRangePicker,
  formatYM,
  parseYM,
  ymLabelShort,
} from "@/components/shared/MonthRangePicker";
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
  const [pickerOpen, setPickerOpen] = useState(false);

  function applyRange(newFrom: string, newTo: string) {
    const params = new URLSearchParams();
    params.set("bu", businessUnit);
    params.set("from", newFrom);
    params.set("to", newTo);
    router.push(`/investor/finance/pnl?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-border bg-card p-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Periode:
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="press-feedback inline-flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-xs font-semibold hover:border-primary/50 transition"
        >
          <CalendarDays size={13} strokeWidth={2.2} className="text-primary" />
          <span className="tabular-nums">
            {ymLabelShort(parseYM(fromStr))} – {ymLabelShort(parseYM(toStr))}
          </span>
          <ChevronDown size={11} strokeWidth={2.4} className="opacity-70" />
        </button>
        {pickerOpen && (
          <MonthRangePicker
            value={{ from: parseYM(fromStr), to: parseYM(toStr) }}
            onApply={(range) => {
              const f = formatYM(range.from);
              const t = formatYM(range.to);
              setFromStr(f);
              setToStr(t);
              setPickerOpen(false);
              applyRange(f, t);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
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
