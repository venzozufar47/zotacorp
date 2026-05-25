"use client";

import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { PayslipDeliverable } from "@/lib/supabase/types";

interface Props {
  rows: PayslipDeliverable[];
  /** Weighted overall achievement % stored on the payslip — surfaced at
   *  the bottom as the aggregate the karyawan's deliverables_pay was
   *  computed from. */
  weightedAchievementPct: number;
}

/**
 * Per-target deliverables table rendered when the karyawan expands the
 * Deliverables row in the Earnings card. Each row shows target /
 * realization / weight / achievement so the math is fully traceable.
 */
export function DeliverablesTable({ rows, weightedAchievementPct }: Props) {
  const { t } = useTranslation();
  const detail = t.payslipDetail;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl px-3 py-2 text-[12px] italic text-muted-foreground bg-muted/40">
        {detail.emptyDeliverables}
      </div>
    );
  }

  return (
    <div className="rounded-xl px-3 py-2 bg-muted/40 border border-border">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 text-[12px] tabular-nums">
        <HeaderCell>{detail.colDeliverable}</HeaderCell>
        <HeaderCell align="right">{detail.colTargetReal}</HeaderCell>
        <HeaderCell align="right">{detail.colWeight}</HeaderCell>
        <HeaderCell align="right">{detail.colAchievement}</HeaderCell>
        {rows.map((r) => {
          const target = Number(r.target);
          const real = Number(r.realization);
          const weight = Number(r.weight_pct);
          const ach = target > 0 ? (real / target) * 100 : 0;
          return (
            <Row key={r.id}>
              <span className="truncate">{r.name}</span>
              <span className="text-right text-muted-foreground">
                {real}/{target}
              </span>
              <span className="text-right text-muted-foreground">{weight}%</span>
              <span
                className="text-right font-semibold"
                style={{
                  color: ach >= 100 ? "#1b7a3a" : ach >= 80 ? "#8a5a00" : "#a8261d",
                  fontFamily: "var(--font-mono, ui-monospace)",
                }}
              >
                {ach.toFixed(1)}%
              </span>
            </Row>
          );
        })}
      </div>
      <div
        className="mt-2 pt-2 text-[10.5px] leading-snug flex items-baseline justify-between text-muted-foreground"
        style={{ borderTop: "1px dashed var(--border, #d2d2d7)" }}
      >
        <span>{detail.weightedAchievement}</span>
        <span
          className="font-semibold tabular-nums"
          style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
        >
          {weightedAchievementPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function HeaderCell({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div
      className="text-[10px] uppercase tracking-[0.1em] font-semibold pb-1 text-muted-foreground"
      style={{ textAlign: align, borderBottom: "1px dashed var(--border, #d2d2d7)" }}
    >
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
