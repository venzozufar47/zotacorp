import type { CostingProductWithHpp } from "@/lib/actions/costing.actions";
import {
  createStyledWorkbook,
  downloadBlob,
  slugify,
  RP_FMT,
  PCT_FMT,
  type ExcelCol,
} from "@/lib/export/excelSheet";

/**
 * Download daftar HPP semua produk satu brand ke Excel. Client-side;
 * `exceljs` di-import dinamis (heavy) supaya keluar dari bundle awal.
 */
export async function downloadHppExcel(args: {
  brand: string;
  rows: CostingProductWithHpp[];
}): Promise<void> {
  const { brand, rows } = args;
  const ExcelJS = (await import("exceljs")).default;
  const wb = createStyledWorkbook(ExcelJS);

  const cols: ExcelCol[] = [
    { header: "Produk", width: 32 },
    { header: "Kategori", width: 16 },
    { header: "Yield", width: 10, align: "right" },
    { header: "HPP / unit", width: 16, fmt: RP_FMT, align: "right", total: true },
    { header: "Harga jual", width: 16, fmt: RP_FMT, align: "right", total: true },
    { header: "Margin", width: 12, fmt: PCT_FMT, align: "right" },
  ];

  const errLabel = (e: string | null) =>
    e === "margin_too_high" ? "target >100%" : e === "yield_invalid" ? "yield 0" : "";
  const data: (string | number)[][] = rows.map((r) => {
    const b = r.breakdown;
    return [
      r.product.name,
      r.product.category ?? "",
      r.product.yield_qty,
      Math.round(b.hppUnit),
      // Produk error: beri label (bukan sel kosong yg ambigu).
      b.finalPrice != null ? Math.round(b.finalPrice) : errLabel(b.error),
      b.marginPercent != null ? b.marginPercent : errLabel(b.error),
    ];
  });

  const today = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  wb.addTableSheet(
    "Daftar HPP",
    `Daftar HPP — ${brand}`,
    `Per ${today} · ${rows.length} produk`,
    cols,
    data,
    { totalLabelIndex: 0 }
  );

  const blob = await wb.toBlob();
  downloadBlob(blob, `HPP-${slugify(brand)}-${slugify(today)}.xlsx`);
}
