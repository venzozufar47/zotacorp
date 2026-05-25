"use client";

import { Clock, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { StatusPill } from "./parts/StatusPill";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Payslip } from "@/lib/supabase/types";
import type { EmployeeResponseKind } from "@/lib/actions/payslip.actions";

interface Props {
  payslip: Payslip;
}

/**
 * Compact pill row sitting under the NetHero. Communicates the slip's
 * lifecycle state at-a-glance: payment status + response status. The
 * "FINAL" pill is implicit in `PayslipMonthSwitcher`, so we don't
 * duplicate it here.
 */
export function PayslipStatusRow({ payslip: p }: Props) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  const paymentStatus = (p.payment_status ?? "unpaid") as "unpaid" | "paid";
  const response = (p.employee_response ?? "pending") as EmployeeResponseKind;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {paymentStatus === "paid" ? (
        <StatusPill tone="green" icon={<CheckCircle2 size={11} />}>
          {d.statusPaid}
        </StatusPill>
      ) : (
        <StatusPill tone="amber" icon={<Clock size={11} />}>
          {d.statusAwaitingTransfer}
        </StatusPill>
      )}
      {response === "pending" && (
        <StatusPill tone="neutral" icon={<Info size={11} />}>
          {d.statusNoResponse}
        </StatusPill>
      )}
      {response === "acknowledged" && (
        <StatusPill tone="teal" icon={<CheckCircle2 size={11} />}>
          {d.statusAcknowledged}
        </StatusPill>
      )}
      {response === "issue" && (
        <StatusPill tone="red" icon={<AlertCircle size={11} />}>
          {d.statusIssue}
        </StatusPill>
      )}
    </div>
  );
}
