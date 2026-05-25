"use client";

import { Check, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  derivePayslipStages,
  type PayslipStageStep,
} from "@/lib/payslip/lifecycle";
import { formatDateLong } from "@/lib/payslip/formatters";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Payslip } from "@/lib/supabase/types";

interface Props {
  payslip: Payslip;
}

/**
 * 4-step payment status timeline. Uses `derivePayslipStages` so the
 * states shown to karyawan match exactly what admin sees (per the
 * design requirement "konsisten dengan admin view").
 */
export function PayslipPaymentTimeline({ payslip: p }: Props) {
  const { lang, t } = useTranslation();
  const d = t.payslipDetail;
  const steps = derivePayslipStages({
    status: p.status,
    employee_response: p.employee_response,
    payment_status: p.payment_status,
  });

  const finalizedDate =
    p.updated_at && p.status === "finalized"
      ? formatDateLong(p.updated_at.slice(0, 10), lang)
      : null;
  const paymentDate = p.payment_at
    ? formatDateLong(p.payment_at.slice(0, 10), lang)
    : null;

  const stepCopy: Record<PayslipStageStep["key"], { title: string; body?: string }> = {
    finalized: {
      title: d.timelineFinalized,
      body: finalizedDate ?? undefined,
    },
    response: {
      title: d.timelineResponse,
      body:
        p.employee_response === "acknowledged"
          ? d.timelineResponseAck
          : p.employee_response === "issue"
            ? d.timelineResponseIssue
            : d.timelineResponseWaiting,
    },
    payment: {
      title: d.timelinePayment,
      body:
        p.payment_status === "paid"
          ? paymentDate
            ? d.timelinePaymentPaidAt.replace("{date}", paymentDate)
            : d.timelinePaymentPaid
          : d.timelinePaymentPending,
    },
    done: {
      title: d.timelineDone,
    },
  };

  return (
    <Card>
      <CardContent className="px-5 py-5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-semibold mb-3 text-muted-foreground">
          {d.timelineTitle}
        </div>
        <ol className="space-y-3">
          {steps.map((s, i, arr) => {
            const copy = stepCopy[s.key];
            const isLast = i === arr.length - 1;
            const isDone = s.status === "done";
            const isActive = s.status === "active";
            const isBlocked = s.status === "blocked";
            return (
              <li key={s.key} className="flex items-start gap-3 relative">
                {!isLast && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 11,
                      top: 24,
                      width: 1,
                      height: 28,
                      background: isDone
                        ? "var(--primary, #117a8c)"
                        : "var(--border, #d2d2d7)",
                    }}
                  />
                )}
                <span
                  className="grid place-items-center size-6 rounded-full shrink-0"
                  style={{
                    background: isBlocked
                      ? "#fdecea"
                      : isDone
                        ? "var(--primary, #117a8c)"
                        : isActive
                          ? "#eef7f9"
                          : "white",
                    border: isBlocked
                      ? "1px solid #f6c5bf"
                      : isDone
                        ? "none"
                        : isActive
                          ? "1px solid #b5dde6"
                          : "1px solid var(--border, #d2d2d7)",
                    color: isBlocked
                      ? "#a8261d"
                      : isDone
                        ? "white"
                        : isActive
                          ? "var(--primary, #117a8c)"
                          : "var(--muted-foreground)",
                  }}
                >
                  {isDone ? (
                    <Check size={12} strokeWidth={3} />
                  ) : isBlocked ? (
                    <AlertTriangle size={12} strokeWidth={2.5} />
                  ) : (
                    <span
                      className="size-2 rounded-full"
                      style={{
                        background: isActive
                          ? "var(--primary, #117a8c)"
                          : "var(--muted-foreground)",
                      }}
                    />
                  )}
                </span>
                <div className="leading-tight pt-0.5">
                  <div
                    className={`text-[12.5px] font-semibold ${
                      isDone || isActive || isBlocked
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {copy.title}
                  </div>
                  {copy.body && (
                    <div className="text-[11px] mt-0.5 text-muted-foreground">
                      {copy.body}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
