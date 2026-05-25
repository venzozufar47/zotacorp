/**
 * Shared PDF download helper. Used by both PayslipActionButtons
 * (full Unduh PDF button) and PayslipHistoryList (per-row icon
 * download). Dynamic-imports `@react-pdf/renderer` + the document
 * component so the heavy PDF deps stay out of the first-load bundle
 * for users who never download.
 */

import type {
  Payslip,
  PayslipDeliverable,
  PayslipSettings,
  Profile,
} from "@/lib/supabase/types";

export interface DownloadArgs {
  payslip: Payslip;
  deliverables: PayslipDeliverable[];
  settings: PayslipSettings | null;
  profile: Profile | null;
}

function safeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Trigger a browser download of the formal payslip PDF. Resolves when
 * the PDF blob has been created and the download anchor clicked.
 * Caller is responsible for managing its own loading state.
 */
export async function downloadPayslipPdf(args: DownloadArgs): Promise<void> {
  const { payslip: p, profile } = args;
  // Dynamic-import keeps @react-pdf/renderer (~200KB) out of the
  // first-load bundle for users who never print.
  const [{ pdf }, { PayslipPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/payslip/PayslipPdfDocument"),
  ]);

  const blob = await pdf(
    <PayslipPdfDocument
      payslip={args.payslip}
      deliverables={args.deliverables}
      settings={args.settings}
      profile={profile}
    />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name = safeName(profile?.full_name ?? "Karyawan");
  a.download = `Slip-Gaji-${name}-${p.year}-${String(p.month).padStart(2, "0")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
