"use client";

import { useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { formatMins } from "@/lib/payslip/formatters";
import { OvertimeTable } from "./parts/OvertimeTable";
import { DeliverablesTable } from "./parts/DeliverablesTable";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type {
  Payslip,
  PayslipBreakdown,
  PayslipDeliverable,
  PayslipSettings,
} from "@/lib/supabase/types";

interface Props {
  payslip: Payslip;
  deliverables: PayslipDeliverable[];
  settings: PayslipSettings | null;
}

type EarningRow = {
  key: string;
  label: string;
  amount: number;
  note?: string;
  expandKey?: "overtime" | "extra_work" | "deliverables";
};

/**
 * Build the basis-conditional earnings list. Each card sticks to what
 * the karyawan's actual calculation produces — overtime/late only
 * affect net for presence/both; deliverables only for deliverables/both;
 * fixed shows the flat base salary.
 */
function buildEarnings(
  p: Payslip,
  basis: string,
  breakdown: PayslipBreakdown | null,
  detail: ReturnType<typeof useTranslation>["t"]["payslipDetail"]
): EarningRow[] {
  const rows: EarningRow[] = [];
  const base = Number(p.base_salary);
  const prorated = Number(p.prorated_salary);
  const ot = Number(p.overtime_pay);
  const extra = Number(p.extra_work_pay);
  const deliv = Number(p.deliverables_pay);
  const bonus = Number(p.monthly_bonus);
  const cakeBonus = Number(p.cake_bonus ?? 0);
  const bonusDayPay = Number(p.bonus_day_pay ?? 0);

  if (basis === "presence" || basis === "both") {
    if (prorated > 0) {
      const overworked = p.actual_work_days > p.expected_work_days;
      rows.push({
        key: "prorata",
        label: overworked
          ? detail.earningProrataExtra
          : detail.earningProrata,
        amount: prorated,
        note:
          base > 0
            ? detail.earningProrataNote
                .replace("{base}", formatIDR(base))
                .replace("{actual}", String(p.actual_work_days))
                .replace("{expected}", String(p.expected_work_days))
            : undefined,
      });
    }
    if (bonusDayPay > 0) {
      const bdays = breakdown?.bonus_days ?? [];
      const totalHours = bdays.reduce((a, r) => a + r.hours, 0);
      rows.push({
        key: "bonus_day",
        label: detail.earningBonusDay,
        amount: bonusDayPay,
        note: detail.earningBonusDayNote
          .replace("{days}", String(bdays.length))
          .replace("{hours}", String(Math.round(totalHours * 10) / 10)),
      });
    }
    if (ot > 0) {
      const totalOtMin = (breakdown?.overtime_days ?? []).reduce(
        (a, r) => a + r.minutes,
        0
      );
      rows.push({
        key: "overtime",
        label: detail.earningOvertime,
        amount: ot,
        note: detail.earningOvertimeNote
          .replace("{days}", String(breakdown?.overtime_days.length ?? 0))
          .replace("{duration}", formatMins(totalOtMin, "j", "m")),
        expandKey: "overtime",
      });
    }
  }
  if (basis === "fixed") {
    if (base > 0) {
      rows.push({
        key: "base",
        label: detail.earningFixedBase,
        amount: base,
        note: detail.earningFixedNote,
      });
    }
  }
  if (basis === "deliverables" || basis === "both") {
    if (deliv > 0) {
      rows.push({
        key: "deliverables",
        label: detail.earningDeliverables,
        amount: deliv,
        note: detail.earningDeliverablesNote.replace(
          "{pct}",
          Number(p.deliverables_achievement_pct).toFixed(1)
        ),
        expandKey: "deliverables",
      });
    }
  }
  if (extra > 0) {
    const entries = breakdown?.extra_work_days?.length ?? 0;
    rows.push({
      key: "extra_work",
      label: detail.earningExtraWork,
      amount: extra,
      note: entries > 0
        ? detail.earningExtraWorkNote.replace("{entries}", String(entries))
        : undefined,
      expandKey: entries > 0 ? "extra_work" : undefined,
    });
  }
  if (bonus > 0) {
    rows.push({
      key: "bonus",
      label: detail.earningBonus,
      amount: bonus,
      note: p.monthly_bonus_note ?? undefined,
    });
  }
  if (cakeBonus > 0) {
    rows.push({
      key: "cake_bonus",
      label: "Bonus Cake",
      amount: cakeBonus,
      note: p.cake_bonus_note ?? undefined,
    });
  }
  return rows;
}

export function PayslipEarningsCard({
  payslip: p,
  deliverables,
  settings,
}: Props) {
  const { t } = useTranslation();
  const detail = t.payslipDetail;
  const basis = settings?.calculation_basis ?? "presence";
  const breakdown = p.breakdown_json as PayslipBreakdown | null;
  const rows = buildEarnings(p, basis, breakdown, detail);

  // Sum the rendered rows for the subtotal — by definition equal to gross
  // since deductions live in their own card. We trust the displayed rows
  // over p.gross-like derived fields to keep the math visible.
  const gross = rows.reduce((a, r) => a + r.amount, 0);

  const [openOT, setOpenOT] = useState(false);
  const [openDeliv, setOpenDeliv] = useState(false);
  const [openExtra, setOpenExtra] = useState(false);

  if (rows.length === 0) {
    return null;
  }

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
              style={{ background: "#e8f7ee", color: "#1b7a3a" }}
            >
              <Plus size={13} />
            </span>
            {detail.earningsTitle}
          </h3>
          <div
            className="text-[13.5px] font-bold tabular-nums"
            style={{ color: "#1b7a3a", fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            + {formatIDR(gross)}
          </div>
        </div>

        <div className="divide-y divide-border">
          {rows.map((r) => {
            const isOpen =
              r.expandKey === "overtime"
                ? openOT
                : r.expandKey === "deliverables"
                  ? openDeliv
                  : r.expandKey === "extra_work"
                    ? openExtra
                    : false;
            const toggle = () => {
              if (r.expandKey === "overtime") setOpenOT((v) => !v);
              if (r.expandKey === "deliverables") setOpenDeliv((v) => !v);
              if (r.expandKey === "extra_work") setOpenExtra((v) => !v);
            };
            return (
              <div key={r.key}>
                <LineItem
                  label={r.label}
                  note={r.note}
                  amount={r.amount}
                  sign="+"
                  expandable={Boolean(r.expandKey)}
                  open={isOpen}
                  onToggle={r.expandKey ? toggle : undefined}
                />
                {r.expandKey === "overtime" && isOpen && breakdown && (
                  <div className="pb-3">
                    <OvertimeTable
                      rows={breakdown.overtime_days}
                      mode={breakdown.overtime_mode}
                    />
                  </div>
                )}
                {r.expandKey === "deliverables" && isOpen && (
                  <div className="pb-3">
                    <DeliverablesTable
                      rows={deliverables}
                      weightedAchievementPct={Number(p.deliverables_achievement_pct)}
                    />
                  </div>
                )}
                {r.expandKey === "extra_work" && isOpen && breakdown && (
                  <div className="pb-3">
                    <ExtraWorkTable rows={breakdown.extra_work_days ?? []} />
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between py-3">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {detail.earningsSubtotal}
            </div>
            <div
              className="text-[14.5px] font-bold tabular-nums"
              style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
            >
              {formatIDR(gross)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

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
          <span
            className="grid place-items-center size-5 mt-0.5 rounded-md text-muted-foreground border border-border"
          >
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

function ExtraWorkTable({
  rows,
}: {
  rows: NonNullable<PayslipBreakdown["extra_work_days"]>;
}) {
  const { t, lang } = useTranslation();
  const detail = t.payslipDetail;
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl px-3 py-2 bg-muted/40 border border-border">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 text-[12px] tabular-nums">
        <div
          className="text-[10px] uppercase tracking-[0.1em] font-semibold pb-1 text-muted-foreground"
          style={{ borderBottom: "1px dashed var(--border, #d2d2d7)" }}
        >
          {detail.colDate}
        </div>
        <div
          className="text-[10px] uppercase tracking-[0.1em] font-semibold pb-1 text-right text-muted-foreground"
          style={{ borderBottom: "1px dashed var(--border, #d2d2d7)" }}
        >
          {detail.colKind}
        </div>
        <div
          className="text-[10px] uppercase tracking-[0.1em] font-semibold pb-1 text-right text-muted-foreground"
          style={{ borderBottom: "1px dashed var(--border, #d2d2d7)" }}
        >
          {detail.colPay}
        </div>
        {rows.map((r, idx) => {
          const [y, m, d] = r.date.split("-").map(Number);
          const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
          const dateStr = dt.toLocaleDateString(
            lang === "id" ? "id-ID" : "en-US",
            { weekday: "short", day: "numeric", month: "short" }
          );
          return (
            <ExtraWorkRow key={`${r.date}-${idx}`}>
              <span>{dateStr}</span>
              <span className="text-right capitalize text-muted-foreground">{r.kind}</span>
              <span
                className="text-right font-semibold"
                style={{ color: "#1b7a3a", fontFamily: "var(--font-mono, ui-monospace)" }}
              >
                + {formatIDR(r.pay)}
              </span>
            </ExtraWorkRow>
          );
        })}
      </div>
    </div>
  );
}

function ExtraWorkRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
