/**
 * Render + unduh PDF kontrak di sisi klien (preview/draft). Dynamic-import
 * @react-pdf/renderer supaya tidak masuk first-load bundle. Untuk kontrak yang
 * SUDAH `signed`, lebih baik unduh PDF immutable tersimpan via signed URL.
 */

import type { ContractRenderData } from "@/lib/actions/employment-contracts.actions";

function safeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function buildContractBlob(data: ContractRenderData): Promise<Blob> {
  const [{ pdf }, { ContractPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/employment-contracts/ContractPdfDocument"),
  ]);
  return pdf(
    <ContractPdfDocument
      bodyMarkdown={data.bodyMarkdown}
      fields={data.fields}
      lampiran={data.lampiran}
      employerName={data.employerName}
      employerRole={data.employerRole}
      employeeName={data.employeeName}
      employeeNik={data.employeeNik}
      signedAt={data.signedAt}
      employerSignatureDataUrl={data.employerSignatureDataUrl}
      employeeSignatureDataUrl={data.employeeSignatureDataUrl}
    />
  ).toBlob();
}

export async function downloadContractPdf(
  data: ContractRenderData
): Promise<void> {
  const blob = await buildContractBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Perjanjian-Kerja-${safeName(data.employeeName || "Karyawan")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Buka blob PDF di tab baru untuk preview di layar. */
export async function previewContractPdf(
  data: ContractRenderData
): Promise<void> {
  const blob = await buildContractBlob(data);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke setelah jeda agar tab sempat memuat.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
