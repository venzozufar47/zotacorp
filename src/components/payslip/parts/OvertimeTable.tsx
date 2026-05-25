"use client";

import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { formatDateShort, formatMins } from "@/lib/payslip/formatters";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { PayslipBreakdown } from "@/lib/supabase/types";

interface Props {
  rows: PayslipBreakdown["overtime_days"];
  /** When `fixed_per_day`, durasi tidak relevan (admin set rate tetap
   *  per hari OT), jadi kita tampilkan kolom 2 saja (Tanggal + Bayaran).
   *  Mode `hourly_tiered` → 3 kolom (Tanggal + Durasi + Bayaran). */
  mode: PayslipBreakdown["overtime_mode"];
}

/**
 * Per-day overtime table rendered when the karyawan expands the Lembur
 * row in the Earnings card. Mirrors the design's `OvertimeTable`.
 */
export function OvertimeTable({ rows, mode }: Props) {
  const { lang, t } = useTranslation();
  const detail = t.payslipDetail;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl px-3 py-2 text-[12px] italic text-muted-foreground bg-muted/40">
        {detail.emptyOvertime}
      </div>
    );
  }

  if (mode === "fixed_per_day") {
    return (
      <div className="rounded-xl px-3 py-2 bg-muted/40 border border-border">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[12px] tabular-nums">
          <HeaderCell>{detail.colDate}</HeaderCell>
          <HeaderCell align="right">{detail.colPay}</HeaderCell>
          {rows.map((r) => (
            <Row key={r.date}>
              <span>{formatDateShort(r.date, lang)}</span>
              <span className="text-right font-semibold" style={{ color: "#1b7a3a", fontFamily: "var(--font-mono, ui-monospace)" }}>
                + {formatIDR(r.pay)}
              </span>
            </Row>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl px-3 py-2 bg-muted/40 border border-border">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 text-[12px] tabular-nums">
        <HeaderCell>{detail.colDate}</HeaderCell>
        <HeaderCell align="right">{detail.colDuration}</HeaderCell>
        <HeaderCell align="right">{detail.colPay}</HeaderCell>
        {rows.map((r) => (
          <Row key={r.date}>
            <span>{formatDateShort(r.date, lang)}</span>
            <span className="text-right text-muted-foreground">
              {formatMins(r.minutes, "j", "m")}
            </span>
            <span className="text-right font-semibold" style={{ color: "#1b7a3a", fontFamily: "var(--font-mono, ui-monospace)" }}>
              + {formatIDR(r.pay)}
            </span>
          </Row>
        ))}
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
