"use client";

import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { formatDateShort, formatMins } from "@/lib/payslip/formatters";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { PayslipBreakdown } from "@/lib/supabase/types";

interface Props {
  rows: PayslipBreakdown["late_days"];
  /** Grace period in minutes — drives the explainer footer. */
  graceMin: number;
  /** Caps + mode for the explainer footer. */
  penaltyMode: PayslipBreakdown["late_penalty_mode"];
  dailyCap?: number;
}

/**
 * Per-day late penalty table rendered when the karyawan expands the
 * Telat row in the Deductions card. Red-tinted to match the design.
 * Shows excused / capped status on individual rows.
 */
export function LateTable({ rows, graceMin, penaltyMode, dailyCap }: Props) {
  const { lang, t } = useTranslation();
  const detail = t.payslipDetail;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl px-3 py-2 text-[12px] italic text-muted-foreground bg-muted/40">
        {detail.emptyLate}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: "#fdf6f5", border: "1px solid #f6c5bf" }}
    >
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 text-[12px] tabular-nums">
        <HeaderCell>{detail.colDate}</HeaderCell>
        <HeaderCell align="right">{detail.colLate}</HeaderCell>
        <HeaderCell align="right">{detail.colAfterGrace}</HeaderCell>
        <HeaderCell align="right">{detail.colPenalty}</HeaderCell>
        {rows.map((r) => {
          const capped = r.penalty_pre_cap != null && r.penalty_pre_cap > r.penalty;
          return (
            <Row key={r.date}>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>{formatDateShort(r.date, lang)}</span>
                  {r.excused && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                      style={{ background: "#eef7f9", color: "#0c5d6c", border: "1px solid #b5dde6" }}
                    >
                      {detail.lateExcused}
                    </span>
                  )}
                  {capped && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                      style={{ background: "#fff4e0", color: "#8a5a00", border: "1px solid #f3d699" }}
                      title={`Aslinya ${formatIDR(r.penalty_pre_cap!)}`}
                    >
                      {detail.lateCapped}
                    </span>
                  )}
                </div>
                {r.excused && r.excuse_note && (
                  <span className="text-[10px] italic text-muted-foreground break-words leading-snug">
                    “{r.excuse_note}”
                  </span>
                )}
              </div>
              <span className="text-right text-muted-foreground">
                {formatMins(r.raw_minutes, "j", "m")}
              </span>
              <span className="text-right text-muted-foreground">
                {r.excused ? "—" : formatMins(r.after_grace_minutes, "j", "m")}
              </span>
              <span
                className="text-right font-semibold"
                style={{ color: "#a8261d", fontFamily: "var(--font-mono, ui-monospace)" }}
              >
                {r.penalty > 0 ? `− ${formatIDR(r.penalty)}` : "—"}
              </span>
            </Row>
          );
        })}
      </div>
      <div
        className="mt-2 pt-2 text-[10.5px] leading-snug"
        style={{ color: "#6b3a35", borderTop: "1px dashed #f6c5bf" }}
      >
        {graceMin > 0 && (
          <p>{detail.graceExplainer.replace("{min}", String(graceMin))}</p>
        )}
        {penaltyMode === "per_day" && <p>{detail.perDayExplainer}</p>}
        {dailyCap != null && dailyCap > 0 && (
          <p>{detail.capExplainer.replace("{cap}", formatIDR(dailyCap))}</p>
        )}
      </div>
    </div>
  );
}

function HeaderCell({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div
      className="text-[10px] uppercase tracking-[0.1em] font-semibold pb-1"
      style={{ color: "#a8261d", textAlign: align, borderBottom: "1px dashed #f6c5bf" }}
    >
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
