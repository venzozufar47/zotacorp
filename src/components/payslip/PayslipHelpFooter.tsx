"use client";

import { HelpCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Help banner at the bottom of the payslip detail view explaining the
 * dispute flow. Teal-tinted to match the design's accent palette.
 */
export function PayslipHelpFooter() {
  const { t } = useTranslation();
  const d = t.payslipDetail;

  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
      style={{
        background: "#eef7f9",
        border: "1px solid #b5dde6",
      }}
    >
      <HelpCircle size={16} style={{ color: "#0c5d6c" }} />
      <div
        className="text-[11.5px] leading-snug"
        style={{ color: "#0c5d6c" }}
        dangerouslySetInnerHTML={{ __html: d.helpFooterHtml }}
      />
    </div>
  );
}
