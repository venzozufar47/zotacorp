/**
 * Download helper untuk PDF "Hasil Evaluasi 360°" per karyawan. Sama
 * seperti downloadPayslipPdf: dynamic-import @react-pdf/renderer +
 * dokumennya supaya dependency ~200KB itu tidak masuk bundle awal untuk
 * admin yang tidak pernah unduh PDF.
 */

import type { RoundResponseDTO, SubjectNotesDTO } from "@/lib/actions/evaluation-360.actions";

export interface DownloadEvaluation360PdfArgs {
  subjectName: string;
  roundTitle: string;
  responses: RoundResponseDTO[];
  notes: SubjectNotesDTO | null;
}

function safeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Trigger unduhan PDF hasil evaluasi 360° satu karyawan. Resolves
 * setelah blob PDF dibuat dan link unduh diklik. Caller mengurus
 * loading state sendiri.
 */
export async function downloadEvaluation360Pdf(
  args: DownloadEvaluation360PdfArgs
): Promise<void> {
  const [{ pdf }, { Evaluation360PdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/evaluation-360/Evaluation360PdfDocument"),
  ]);

  const blob = await pdf(
    <Evaluation360PdfDocument
      subjectName={args.subjectName}
      roundTitle={args.roundTitle}
      responses={args.responses}
      notes={args.notes}
    />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Evaluasi-360-${safeName(args.subjectName)}-${safeName(args.roundTitle)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
