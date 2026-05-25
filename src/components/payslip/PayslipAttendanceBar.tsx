"use client";

import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Payslip } from "@/lib/supabase/types";

interface Props {
  payslip: Payslip;
}

/**
 * Progress bar visualizing actual / expected attendance. Only rendered
 * by the parent for presence/both basis — fixed/deliverables hide it.
 */
export function PayslipAttendanceBar({ payslip: p }: Props) {
  const { t } = useTranslation();
  const d = t.payslipDetail;

  const expected = Math.max(p.expected_work_days, 1);
  const actual = p.actual_work_days;
  const pctRaw = (actual / expected) * 100;
  // Clamp displayed bar to [0, 100] — overworked karyawan (>100%) still
  // shows full bar, with the numeric label conveying the overage.
  const pctClamped = Math.min(Math.max(pctRaw, 0), 100);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          {d.attendanceBarLabel}
        </span>
        <span
          className="text-[12px] tabular-nums font-semibold text-foreground"
          style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
        >
          {actual}/{expected} ({pctRaw.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pctClamped}%`, background: "var(--primary, #117a8c)" }}
        />
      </div>
    </div>
  );
}
