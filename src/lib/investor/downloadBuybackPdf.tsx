import type { BuybackReportDetail } from "@/lib/actions/yeobo-buyback.actions";
import { slugify, downloadBlob } from "@/lib/export/excelSheet";

/**
 * Download PDF laporan buyback aset. `@react-pdf/renderer` + dokumen
 * di-import dinamis (heavy) supaya keluar dari bundle awal.
 */
export async function downloadBuybackPdf(
  report: BuybackReportDetail
): Promise<void> {
  const [{ pdf }, { BuybackReportPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/BuybackReportPdfDocument"),
  ]);
  const blob = await pdf(
    <BuybackReportPdfDocument report={report} />
  ).toBlob();
  downloadBlob(blob, `${slugify(report.title)}.pdf`);
}
