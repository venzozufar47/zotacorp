"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Receipt, Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { formatMonthYear, periodKey } from "@/lib/payslip/formatters";
import { downloadPayslipPdf } from "@/lib/payslip/downloadPdf";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type {
  Payslip,
  PayslipDeliverable,
  PayslipSettings,
  Profile,
} from "@/lib/supabase/types";

interface Props {
  payslips: Payslip[];
  active: Payslip;
  /** Required for the per-row PDF download button to assemble the
   *  document with the right deliverables / metadata. */
  deliverablesByPayslip: Record<string, PayslipDeliverable[]>;
  settings: PayslipSettings | null;
  profile: Profile | null;
  /** Max items to render. Default 6 to match design density. */
  limit?: number;
}

/**
 * Desktop right-rail widget listing recent payslips. Each row:
 *  - left part is a Link to `?p=YYYY-MM` (switches the detail view)
 *  - right part shows the net amount and a small ghost icon button
 *    for downloading that row's PDF. The button sits as a sibling
 *    of the Link so download never triggers navigation.
 *
 * Hidden on mobile (parent uses `hidden lg:flex`).
 */
export function PayslipHistoryList({
  payslips,
  active,
  deliverablesByPayslip,
  settings,
  profile,
  limit = 6,
}: Props) {
  const { lang, t } = useTranslation();
  const d = t.payslipDetail;
  const items = payslips.slice(0, limit);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function download(p: Payslip) {
    setPendingId(p.id);
    try {
      await downloadPayslipPdf({
        payslip: p,
        deliverables: deliverablesByPayslip[p.id] ?? [],
        settings,
        profile,
      });
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error(d.toastPdfFailed);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardContent className="px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
            {d.historyTitle}
          </div>
        </div>
        <ul>
          {items.map((p, idx) => {
            const isActive = p.id === active.id;
            const isLast = idx === items.length - 1;
            const isPaid = p.payment_status === "paid";
            const isDownloading = pendingId === p.id;
            return (
              <li
                key={p.id}
                style={{
                  borderBottom: isLast
                    ? "none"
                    : "1px solid var(--border, #d2d2d7)",
                }}
              >
                <div
                  className={`flex items-center gap-2 py-2.5 px-1 -mx-1 rounded-lg ${
                    isActive ? "bg-muted/40" : "hover:bg-muted/30"
                  } transition-colors`}
                >
                  <Link
                    href={`/payslips?p=${periodKey(p.year, p.month)}`}
                    scroll={false}
                    className="flex-1 flex items-center justify-between min-w-0 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="grid place-items-center size-8 rounded-lg shrink-0"
                        style={{
                          background: isActive ? "#eef7f9" : "#f5f5f7",
                          color: isActive
                            ? "var(--primary, #117a8c)"
                            : "var(--muted-foreground)",
                        }}
                      >
                        <Receipt size={14} />
                      </span>
                      <div className="leading-tight min-w-0">
                        <div
                          className={`text-[12.5px] font-semibold truncate ${
                            isActive ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {formatMonthYear(p.year, p.month, lang)}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground truncate">
                          {isPaid ? d.historyPaid : d.historyUnpaid}
                        </div>
                      </div>
                    </div>
                    <div
                      className="text-[12.5px] tabular-nums font-semibold shrink-0"
                      style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
                    >
                      {formatIDR(Number(p.net_total))}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => download(p)}
                    disabled={isDownloading}
                    aria-label={d.actionDownloadPdf}
                    title={d.actionDownloadPdf}
                    className="shrink-0 grid place-items-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-60"
                  >
                    {isDownloading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Download size={13} />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
