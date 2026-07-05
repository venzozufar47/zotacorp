"use client";

import { useState } from "react";
import { Minus, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { formatMins } from "@/lib/payslip/formatters";
import { LateTable } from "./parts/LateTable";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type {
  Payslip,
  PayslipBreakdown,
  PayslipSettings,
} from "@/lib/supabase/types";

interface Props {
  payslip: Payslip;
  settings: PayslipSettings | null;
}

type DeductionRow = {
  key: string;
  label: string;
  amount: number;
  note?: string;
  longNote?: string | null;
  expandKey?: "late";
};

function buildDeductions(
  p: Payslip,
  basis: string,
  breakdown: PayslipBreakdown | null,
  detail: ReturnType<typeof useTranslation>["t"]["payslipDetail"]
): DeductionRow[] {
  const rows: DeductionRow[] = [];
  const late = Number(p.late_penalty);
  const debt = Number(p.debt_deduction);
  const other = Number(p.other_penalty);

  // late_penalty only affects net for presence/both basis. For
  // fixed/deliverables it would just be a phantom number — suppress.
  if (
    (basis === "presence" || basis === "both" || basis === "daily") &&
    late > 0
  ) {
    const lateDays = (breakdown?.late_days ?? []).filter((d) => !d.excused);
    const totalRawMin = lateDays.reduce((a, r) => a + r.raw_minutes, 0);
    rows.push({
      key: "late",
      label: detail.deductionLate,
      amount: late,
      note: detail.deductionLateNote
        .replace("{days}", String(lateDays.length))
        .replace("{duration}", formatMins(totalRawMin, "j", "m")),
      expandKey: "late",
    });
  }
  if (debt > 0) {
    rows.push({
      key: "debt",
      label: detail.deductionDebt,
      amount: debt,
      longNote: p.debt_deduction_note,
    });
  }
  if (other > 0) {
    rows.push({
      key: "other",
      label: detail.deductionOther,
      amount: other,
      note: p.other_penalty_note ?? undefined,
    });
  }
  return rows;
}

export function PayslipDeductionsCard({ payslip: p, settings }: Props) {
  const { t } = useTranslation();
  const detail = t.payslipDetail;
  const basis = settings?.calculation_basis ?? "presence";
  const breakdown = p.breakdown_json as PayslipBreakdown | null;
  const rows = buildDeductions(p, basis, breakdown, detail);
  const total = rows.reduce((a, r) => a + r.amount, 0);

  const [openLate, setOpenLate] = useState(true);

  // No deductions → hide the card entirely so the page doesn't show
  // an empty "Potongan" header.
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardContent className="px-5 py-5">
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-[13.5px] font-semibold flex items-center gap-2 text-foreground"
            style={{ fontFamily: "var(--font-display, Poppins)" }}
          >
            <span
              className="grid place-items-center size-6 rounded-md"
              style={{ background: "#fdecea", color: "#a8261d" }}
            >
              <Minus size={13} />
            </span>
            {detail.deductionsTitle}
          </h3>
          <div
            className="text-[13.5px] font-bold tabular-nums"
            style={{ color: "#a8261d", fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            − {formatIDR(total)}
          </div>
        </div>

        <div>
          {rows.map((r) => {
            const isOpen = r.expandKey === "late" ? openLate : false;
            const toggle = () => {
              if (r.expandKey === "late") setOpenLate((v) => !v);
            };
            return (
              <div key={r.key}>
                <LineItem
                  label={r.label}
                  note={r.note}
                  amount={r.amount}
                  sign="−"
                  expandable={Boolean(r.expandKey)}
                  open={isOpen}
                  onToggle={r.expandKey ? toggle : undefined}
                />
                {r.longNote && (
                  <pre className="text-[10.5px] text-muted-foreground/80 leading-snug whitespace-pre-wrap font-sans pl-3 mb-2">
                    {r.longNote}
                  </pre>
                )}
                {r.expandKey === "late" && isOpen && breakdown && (
                  <div className="pb-3">
                    <LateTable
                      rows={breakdown.late_days}
                      graceMin={breakdown.grace_period_min}
                      penaltyMode={breakdown.late_penalty_mode}
                      dailyCap={breakdown.late_penalty_daily_cap}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function LineItem({
  label,
  note,
  amount,
  sign,
  expandable,
  open,
  onToggle,
}: {
  label: string;
  note?: string;
  amount: number;
  sign: "+" | "−";
  expandable: boolean;
  open: boolean;
  onToggle?: () => void;
}) {
  const amtColor = sign === "+" ? "#1b7a3a" : "#a8261d";
  return (
    <button
      type="button"
      onClick={expandable ? onToggle : undefined}
      className="w-full flex items-start justify-between text-left py-3"
      style={{ cursor: expandable ? "pointer" : "default" }}
    >
      <div className="flex items-start gap-2 min-w-0">
        {expandable && (
          <span className="grid place-items-center size-5 mt-0.5 rounded-md text-muted-foreground border border-border">
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium leading-tight text-foreground">
            {label}
          </div>
          {note && (
            <div className="text-[11.5px] leading-snug mt-0.5 text-muted-foreground break-words">
              {note}
            </div>
          )}
        </div>
      </div>
      <div
        className="text-right tabular-nums font-semibold whitespace-nowrap pl-3"
        style={{
          color: amtColor,
          fontFamily: "var(--font-mono, ui-monospace)",
          fontSize: 13.5,
        }}
      >
        {sign} {formatIDR(amount)}
      </div>
    </button>
  );
}
