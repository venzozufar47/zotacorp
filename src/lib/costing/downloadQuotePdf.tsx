import type { CostingProductWithHpp } from "@/lib/actions/costing.actions";
import { slugify, downloadBlob } from "@/lib/export/excelSheet";

/**
 * Download PDF kutipan harga satu produk. `@react-pdf/renderer` +
 * dokumen di-import dinamis (heavy) supaya keluar dari bundle awal.
 */
export async function downloadQuotePdf(args: {
  brand: string;
  row: CostingProductWithHpp;
}): Promise<void> {
  const [{ pdf }, { CostingQuotePdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/costing/CostingQuotePdfDocument"),
  ]);
  const date = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const blob = await pdf(
    <CostingQuotePdfDocument brand={args.brand} row={args.row} date={date} />
  ).toBlob();
  downloadBlob(
    blob,
    `Kutipan-${slugify(args.row.product.name)}-${slugify(date)}.pdf`
  );
}
