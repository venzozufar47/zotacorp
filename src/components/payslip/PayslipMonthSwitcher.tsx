"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { formatMonthYear, periodKey } from "@/lib/payslip/formatters";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Payslip } from "@/lib/supabase/types";

interface Props {
  payslips: Payslip[];
  active: Payslip;
}

/**
 * Header chip showing the currently selected period. Click to open a
 * dropdown listing all available payslips for quick switching. Updates
 * the URL via `?p=YYYY-MM` so the selection is shareable and browser
 * history works.
 */
export function PayslipMonthSwitcher({ payslips, active }: Props) {
  const { lang, t } = useTranslation();
  const d = t.payslipDetail;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const select = (p: Payslip) => {
    setOpen(false);
    router.replace(`/payslips?p=${periodKey(p.year, p.month)}`, { scroll: false });
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-2xl px-4 py-3 bg-card border border-border hover:bg-muted/30 transition-colors"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid place-items-center size-8 rounded-xl"
            style={{ background: "#eef7f9", color: "var(--primary, #117a8c)" }}
          >
            <Calendar size={16} />
          </span>
          <div className="text-left leading-tight">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
              {d.switcherPeriodLabel}
            </div>
            <div
              className="text-[14px] font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display, Poppins)" }}
            >
              {formatMonthYear(active.year, active.month, lang)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1 z-20 max-h-72 overflow-y-auto rounded-2xl bg-card border border-border shadow-lg p-1.5"
        >
          {payslips.map((p) => {
            const isActive = p.id === active.id;
            const isPaid = p.payment_status === "paid";
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => select(p)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  isActive ? "bg-muted" : "hover:bg-muted/50"
                }`}
                title={isPaid ? d.historyPaid : d.historyUnpaid}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isActive ? (
                    <CheckCircle2 size={14} className="text-primary shrink-0" />
                  ) : (
                    <span className="w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="text-[13px] font-medium truncate">
                    {formatMonthYear(p.year, p.month, lang)}
                  </span>
                </span>
                {/* Small status dot — green = paid, amber = awaiting transfer.
                    Replaces the cryptic "BELUM" / "DIBAYAR" pill. */}
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{
                    background: isPaid ? "#1b7a3a" : "#d39a00",
                    boxShadow: "0 0 0 2px rgba(255,255,255,0.7)",
                  }}
                  aria-label={isPaid ? d.historyPaid : d.historyUnpaid}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
