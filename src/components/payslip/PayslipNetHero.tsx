"use client";

import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { formatMonthYear } from "@/lib/payslip/formatters";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Payslip } from "@/lib/supabase/types";

interface Props {
  payslip: Payslip;
  /** Total earnings (gross). When undefined, hides the Bruto sub-stat. */
  gross?: number;
  /** Total deductions. When undefined, hides the Potongan sub-stat. */
  totalDeduction?: number;
  /** When true, also shows kehadiran sub-stat. Only relevant for
   *  presence/both basis. */
  showAttendance?: boolean;
}

/**
 * Gradient teal hero card per Slip Gaji design. Net total is the
 * dominant visual — sub-stats appear as small label/value pairs below.
 * Background uses the design's exact 3-stop linear gradient.
 */
export function PayslipNetHero({
  payslip: p,
  gross,
  totalDeduction,
  showAttendance,
}: Props) {
  const { lang, t } = useTranslation();
  const d = t.payslipDetail;
  const periodLabel = formatMonthYear(p.year, p.month, lang);

  return (
    <div
      className="rounded-2xl p-5 text-white relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #117a8c 0%, #08475a 50%, #04222b 100%)",
      }}
    >
      {/* Decorative rings — purely cosmetic */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -60,
          top: -60,
          width: 220,
          height: 220,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -120,
          top: -10,
          width: 220,
          height: 220,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />

      <div className="relative">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <span className="text-[10.5px] uppercase tracking-[0.16em] font-semibold opacity-80">
            {d.netHeroLabel} · {periodLabel}
          </span>
        </div>
        <div
          className="leading-none"
          style={{ fontFamily: "var(--font-display, Poppins, system-ui, sans-serif)" }}
        >
          <div className="text-[32px] sm:text-[40px] lg:text-[44px] font-bold tabular-nums leading-none">
            {formatIDR(Number(p.net_total))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] opacity-90">
          {gross != null && gross > 0 && (
            <span>
              <span className="opacity-70">{d.heroGross}</span>{" "}
              {formatIDR(gross)}
            </span>
          )}
          {totalDeduction != null && totalDeduction > 0 && (
            <span>
              <span className="opacity-70">{d.heroDeduction}</span> −{" "}
              {formatIDR(totalDeduction)}
            </span>
          )}
          {showAttendance && (
            <span>
              <span className="opacity-70">{d.heroAttendance}</span>{" "}
              {p.actual_work_days}/{p.expected_work_days} {d.heroDaysSuffix}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
