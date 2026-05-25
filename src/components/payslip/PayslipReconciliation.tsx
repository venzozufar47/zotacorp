"use client";

import { Sigma } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Payslip, PayslipSettings } from "@/lib/supabase/types";

interface Props {
  payslip: Payslip;
  settings: PayslipSettings | null;
}

type Row =
  | { kind: "item"; label: string; amount: number; sign: "+" | "−" | "" }
  | { kind: "subtotal"; label: string; amount: number }
  | { kind: "total"; label: string; amount: number };

/**
 * Math formula breakdown — shown on desktop only as the "transparency
 * proof" the karyawan can use to verify the net. Each basis renders a
 * slightly different formula tree (matches `computeNetTotal` in
 * payslip.actions.ts).
 */
export function PayslipReconciliation({ payslip: p, settings }: Props) {
  const { t } = useTranslation();
  const detail = t.payslipDetail;
  const basis = (settings?.calculation_basis ?? "presence") as
    | "presence"
    | "deliverables"
    | "both"
    | "fixed";

  const base = Number(p.base_salary);
  const prorated = Number(p.prorated_salary);
  const ot = Number(p.overtime_pay);
  const late = Number(p.late_penalty);
  const deliv = Number(p.deliverables_pay);
  const extra = Number(p.extra_work_pay);
  const bonus = Number(p.monthly_bonus);
  const debt = Number(p.debt_deduction);
  const other = Number(p.other_penalty);
  const net = Number(p.net_total);

  const rows: Row[] = [];

  if (basis === "fixed") {
    rows.push({ kind: "subtotal", label: detail.reconBase, amount: base });
  } else if (basis === "presence") {
    if (prorated > 0)
      rows.push({ kind: "item", label: detail.reconProrata, amount: prorated, sign: "" });
    if (ot > 0)
      rows.push({ kind: "item", label: detail.reconOvertime, amount: ot, sign: "+" });
    if (late > 0)
      rows.push({ kind: "item", label: detail.reconLate, amount: late, sign: "−" });
    rows.push({
      kind: "subtotal",
      label: detail.reconAttendanceBucket,
      amount: prorated + ot - late,
    });
  } else if (basis === "deliverables") {
    rows.push({
      kind: "subtotal",
      label: detail.reconDeliverablesBucket,
      amount: deliv,
    });
  } else {
    // both — weighted
    const attW = Math.max(0, Number(settings?.attendance_weight_pct ?? 50)) / 100;
    const delW = Math.max(0, Number(settings?.deliverables_weight_pct ?? 50)) / 100;
    const attBucket = prorated + ot - late;
    const delBucket = deliv;
    const weightedAtt = Math.round(attBucket * attW);
    const weightedDel = Math.round(delBucket * delW);
    if (prorated > 0)
      rows.push({ kind: "item", label: detail.reconProrata, amount: prorated, sign: "" });
    if (ot > 0)
      rows.push({ kind: "item", label: detail.reconOvertime, amount: ot, sign: "+" });
    if (late > 0)
      rows.push({ kind: "item", label: detail.reconLate, amount: late, sign: "−" });
    rows.push({
      kind: "item",
      label: detail.reconAttendanceWeighted.replace(
        "{w}",
        `${(attW * 100).toFixed(0)}%`
      ),
      amount: weightedAtt,
      sign: "",
    });
    if (deliv > 0)
      rows.push({ kind: "item", label: detail.reconDeliverables, amount: deliv, sign: "" });
    rows.push({
      kind: "item",
      label: detail.reconDeliverablesWeighted.replace(
        "{w}",
        `${(delW * 100).toFixed(0)}%`
      ),
      amount: weightedDel,
      sign: "+",
    });
    rows.push({
      kind: "subtotal",
      label: detail.reconCombinedBucket,
      amount: weightedAtt + weightedDel,
    });
  }

  // Add-ons after the bucket are common to all bases.
  if (extra > 0)
    rows.push({ kind: "item", label: detail.reconExtraWork, amount: extra, sign: "+" });
  if (bonus > 0)
    rows.push({ kind: "item", label: detail.reconBonus, amount: bonus, sign: "+" });
  if (debt > 0)
    rows.push({ kind: "item", label: detail.reconDebt, amount: debt, sign: "−" });
  if (other > 0)
    rows.push({ kind: "item", label: detail.reconOther, amount: other, sign: "−" });

  rows.push({ kind: "total", label: detail.reconNet, amount: net });

  return (
    <Card style={{ background: "#fbfcfd" }}>
      <CardContent className="px-6 py-5">
        <div className="flex items-center gap-2 mb-3">
          <Sigma size={15} />
          <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-foreground">
            {detail.reconTitle}
          </h3>
        </div>
        <div
          className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 tabular-nums text-[13px]"
          style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
        >
          {rows.map((r, i) => (
            <RowView key={`${r.label}-${i}`} row={r} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RowView({ row: r }: { row: Row }) {
  if (r.kind === "total") {
    return (
      <>
        <span
          className="font-semibold text-foreground"
          style={{ borderTop: "1px solid var(--foreground)", paddingTop: 6 }}
        >
          = {r.label}
        </span>
        <span
          className="text-right font-bold"
          style={{
            borderTop: "1px solid var(--foreground)",
            paddingTop: 6,
            color: "var(--primary, #117a8c)",
          }}
        >
          {formatIDR(r.amount)}
        </span>
      </>
    );
  }
  if (r.kind === "subtotal") {
    return (
      <>
        <span
          className="text-muted-foreground"
          style={{ borderTop: "1px dashed var(--border, #d2d2d7)", paddingTop: 6 }}
        >
          = {r.label}
        </span>
        <span
          className="text-right font-semibold text-foreground"
          style={{ borderTop: "1px dashed var(--border, #d2d2d7)", paddingTop: 6 }}
        >
          {formatIDR(r.amount)}
        </span>
      </>
    );
  }
  // item
  const color =
    r.sign === "+" ? "#1b7a3a" : r.sign === "−" ? "#a8261d" : undefined;
  return (
    <>
      <span className="text-muted-foreground">
        {r.sign ? `${r.sign} ` : ""}
        {r.label}
      </span>
      <span className="text-right" style={{ color }}>
        {r.sign ? `${r.sign} ` : ""}
        {formatIDR(r.amount)}
      </span>
    </>
  );
}
