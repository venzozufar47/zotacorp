/**
 * Util workbook Excel bergaya (header teal, zebra, Total, frozen header)
 * — digeneralkan dari pola exportInsightsExcel.ts supaya modul lain
 * (mis. costing) tak menyalin ulang. `exceljs` di-import dinamis oleh
 * pemanggil (heavy). Client-only (download via anchor).
 */

export const RP_FMT = '"Rp"#,##0';
export const INT_FMT = "#,##0";
export const PCT_FMT = "0.0%";

export interface ExcelCol {
  header: string;
  width: number;
  fmt?: string;
  align?: "left" | "right" | "center";
  total?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface StyledWorkbook {
  addTableSheet: (
    sheetName: string,
    title: string,
    subtitle: string | null,
    cols: ExcelCol[],
    rows: (string | number)[][],
    opts?: { totalLabelIndex?: number }
  ) => void;
  toBlob: () => Promise<Blob>;
}

/** Buat workbook bergaya. `ExcelJS` = modul hasil `(await import("exceljs")).default`. */
export function createStyledWorkbook(ExcelJS: any): StyledWorkbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zota Corp";
  wb.created = new Date();

  const TEAL = "FF117A8C";
  const ZEBRA = "FFF4F8FA";
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const titleFont = { bold: true, size: 14, color: { argb: "FF1A1A1A" } };
  const subFont = { italic: true, size: 10, color: { argb: "FF6E6E73" } };
  const thin = { style: "thin" as const, color: { argb: "FFD9E2E6" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  function addTableSheet(
    sheetName: string,
    title: string,
    subtitle: string | null,
    cols: ExcelCol[],
    rows: (string | number)[][],
    opts?: { totalLabelIndex?: number }
  ) {
    const ws = wb.addWorksheet(sheetName);
    const n = cols.length;

    ws.mergeCells(1, 1, 1, n);
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = titleFont;
    if (subtitle) {
      ws.mergeCells(2, 1, 2, n);
      ws.getCell(2, 1).value = subtitle;
      ws.getCell(2, 1).font = subFont;
    }

    const headerRowIdx = 4;
    const header = ws.getRow(headerRowIdx);
    cols.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = headerFont;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      cell.alignment = { vertical: "middle", horizontal: c.align ?? "left" };
      cell.border = border;
    });
    header.height = 20;

    rows.forEach((r, ri) => {
      const row = ws.getRow(headerRowIdx + 1 + ri);
      cols.forEach((c, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = r[ci] ?? "";
        cell.alignment = { horizontal: c.align ?? "left" };
        if (c.fmt) cell.numFmt = c.fmt;
        cell.border = border;
        if (ri % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: ZEBRA },
          };
        }
      });
    });

    if (cols.some((c) => c.total) && rows.length > 0) {
      const totalRow = ws.getRow(headerRowIdx + 1 + rows.length);
      cols.forEach((c, ci) => {
        const cell = totalRow.getCell(ci + 1);
        if (ci === (opts?.totalLabelIndex ?? 0)) {
          cell.value = "Total";
        } else if (c.total) {
          cell.value = rows.reduce(
            (s, r) => s + (typeof r[ci] === "number" ? (r[ci] as number) : 0),
            0
          );
          if (c.fmt) cell.numFmt = c.fmt;
        }
        cell.font = { bold: true };
        cell.alignment = { horizontal: c.align ?? "left" };
        cell.border = border;
      });
    }

    cols.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width;
    });
    ws.views = [{ state: "frozen", ySplit: headerRowIdx }];
  }

  async function toBlob(): Promise<Blob> {
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  return { addTableSheet, toBlob };
}

/** Trigger download sebuah Blob dengan nama file. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Slug aman untuk nama file. */
export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export"
  );
}
