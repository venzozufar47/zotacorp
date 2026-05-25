"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PayslipMonthSwitcher } from "./PayslipMonthSwitcher";
import { PayslipNetHero } from "./PayslipNetHero";
import { PayslipStatusRow } from "./PayslipStatusRow";
import { PayslipContextStrip } from "./PayslipContextStrip";
import { PayslipAttendanceBar } from "./PayslipAttendanceBar";
import { PayslipEarningsCard } from "./PayslipEarningsCard";
import { PayslipDeductionsCard } from "./PayslipDeductionsCard";
import { PayslipReconciliation } from "./PayslipReconciliation";
import { PayslipActionButtons } from "./PayslipActionButtons";
import { PayslipHelpFooter } from "./PayslipHelpFooter";
import { PayslipPaymentTimeline } from "./PayslipPaymentTimeline";
import { PayslipHistoryList } from "./PayslipHistoryList";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { parsePeriodKey } from "@/lib/payslip/formatters";
import type {
  Payslip,
  PayslipDeliverable,
  PayslipSettings,
  Profile,
} from "@/lib/supabase/types";
import type { DisputeRow } from "@/lib/actions/payslip-disputes.actions";

interface Props {
  payslips: Payslip[];
  deliverablesByPayslip: Record<string, PayslipDeliverable[]>;
  settings: PayslipSettings | null;
  profile: Profile | null;
  /** Disputes filed by the karyawan against their settings (gaji pokok,
   *  basis, hari kerja). Threaded into PayslipContextStrip so each
   *  disputable cell can show a Lapor button or open-dispute badge. */
  disputes: DisputeRow[];
}

/**
 * Client orchestrator for the detail view. Reads `?p=YYYY-MM` from
 * the URL to pick which payslip to render; defaults to the latest.
 * Responsive grid: main column 2/3, right rail 1/3 on lg+; full-width
 * single column on smaller screens (rail collapses to nothing — keeps
 * mobile minimal per design).
 */
export function PayslipDetailView({
  payslips,
  deliverablesByPayslip,
  settings,
  profile,
  disputes,
}: Props) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  const searchParams = useSearchParams();
  const periodParam = searchParams.get("p");

  const active = useMemo(() => {
    const parsed = parsePeriodKey(periodParam);
    if (parsed) {
      const match = payslips.find(
        (p) => p.year === parsed.year && p.month === parsed.month
      );
      if (match) return match;
    }
    return payslips[0] ?? null;
  }, [payslips, periodParam]);

  if (!active) {
    // Shouldn't happen — parent renders LockedNotice when payslips.length === 0
    return null;
  }

  const activeDeliverables = deliverablesByPayslip[active.id] ?? [];
  const basis = settings?.calculation_basis ?? "presence";
  const showAttendanceBar = basis === "presence" || basis === "both";

  // Compute gross / total-deduction for the hero sub-stats. Mirrors
  // EarningsCard / DeductionsCard logic so the numbers always match.
  const gross =
    (basis === "presence" || basis === "both"
      ? Number(active.prorated_salary) + Number(active.overtime_pay)
      : 0) +
    (basis === "deliverables" || basis === "both"
      ? Number(active.deliverables_pay)
      : 0) +
    (basis === "fixed" ? Number(active.base_salary) : 0) +
    Number(active.extra_work_pay) +
    Number(active.monthly_bonus);
  const totalDeduction =
    ((basis === "presence" || basis === "both")
      ? Number(active.late_penalty)
      : 0) +
    Number(active.debt_deduction) +
    Number(active.other_penalty);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main column */}
      <div className="lg:col-span-2 space-y-5">
        <PayslipMonthSwitcher payslips={payslips} active={active} />
        <PayslipNetHero
          payslip={active}
          gross={gross}
          totalDeduction={totalDeduction}
          showAttendance={showAttendanceBar}
        />
        <PayslipStatusRow payslip={active} />

        <section className="space-y-3">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {d.calcSectionTitle}
          </h3>
          <PayslipContextStrip
            payslip={active}
            settings={settings}
            disputes={disputes}
          />
          {showAttendanceBar && <PayslipAttendanceBar payslip={active} />}
        </section>

        <PayslipEarningsCard
          payslip={active}
          deliverables={activeDeliverables}
          settings={settings}
        />
        <PayslipDeductionsCard payslip={active} settings={settings} />

        <div className="hidden lg:block">
          <PayslipReconciliation payslip={active} settings={settings} />
        </div>

        <PayslipActionButtons
          payslip={active}
          deliverables={activeDeliverables}
          settings={settings}
          profile={profile}
        />

        <PayslipHelpFooter />
      </div>

      {/* Right rail (desktop only) */}
      <aside className="hidden lg:flex flex-col gap-6 lg:sticky lg:top-6 self-start">
        <PayslipPaymentTimeline payslip={active} />
        <PayslipHistoryList
          payslips={payslips}
          active={active}
          deliverablesByPayslip={deliverablesByPayslip}
          settings={settings}
          profile={profile}
        />
      </aside>
    </div>
  );
}
