import type { PosInsights } from "@/lib/actions/pos-insights.actions";

/**
 * Generate + download a styled, human-readable Excel report for the POS
 * Sales Insights screen. Runs fully client-side from the already-fetched
 * `insights` object (no re-query). `exceljs` is heavy, so it's imported
 * dynamically — keeps it out of the initial bundle. Mirrors the on-screen
 * data exactly for the currently selected period.
 */

const RP_FMT = '"Rp"#,##0';
const INT_FMT = "#,##0";
const PCT_FMT = "0%";

const DOW_FULL = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

function fmtDateID(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function sanitize(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "POS"
  );
}

export async function downloadPosInsightsExcel(args: {
  accountName: string;
  insights: PosInsights;
}): Promise<void> {
  const { accountName, insights } = args;
  const ExcelJS = (await import("exceljs")).default;

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

  type Col = {
    header: string;
    width: number;
    fmt?: string;
    align?: "left" | "right" | "center";
    total?: boolean;
  };

  /** Build a titled table sheet with styled header, zebra rows, optional
   *  Total row, frozen header, and per-column width / number format. */
  function addTableSheet(
    sheetName: string,
    cols: Col[],
    rows: (string | number)[][],
    opts?: { totalLabelIndex?: number }
  ) {
    const ws = wb.addWorksheet(sheetName);
    const n = cols.length;

    // Row 1: title (merged), Row 2: subtitle (merged), Row 3: blank.
    ws.mergeCells(1, 1, 1, n);
    ws.getCell(1, 1).value = `Insights Penjualan — ${accountName}`;
    ws.getCell(1, 1).font = titleFont;
    ws.mergeCells(2, 1, 2, n);
    ws.getCell(2, 1).value = `Periode: ${fmtDateID(insights.range.from)} – ${fmtDateID(
      insights.range.to
    )} (${insights.periodDays} hari)`;
    ws.getCell(2, 1).font = subFont;

    // Row 4: header.
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

    // Data rows.
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

    // Optional Total row (sum of numeric `total` columns).
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

  const s = insights.summary;

  // ── Sheet 1: Ringkasan (label / value, mixed formats) ──
  {
    const ws = wb.addWorksheet("Ringkasan");
    ws.mergeCells("A1:B1");
    ws.getCell("A1").value = `Insights Penjualan — ${accountName}`;
    ws.getCell("A1").font = titleFont;
    ws.mergeCells("A2:B2");
    ws.getCell("A2").value = `Periode: ${fmtDateID(insights.range.from)} – ${fmtDateID(
      insights.range.to
    )} (${insights.periodDays} hari)`;
    ws.getCell("A2").font = subFont;

    const header = ws.getRow(4);
    ["Metrik", "Nilai"].forEach((h, i) => {
      const cell = header.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      cell.border = border;
      cell.alignment = { horizontal: i === 0 ? "left" : "right" };
    });

    const rows: Array<[string, number, string]> = [
      ["Revenue", s.revenue, RP_FMT],
      ["Jumlah transaksi", s.txCount, INT_FMT],
      ["Rata-rata / transaksi", s.avgTicket, RP_FMT],
      ["Cash — Revenue", s.cashRevenue, RP_FMT],
      ["Cash — Transaksi", s.cashCount, INT_FMT],
      ["Cash — % transaksi", s.txCount ? s.cashCount / s.txCount : 0, PCT_FMT],
      ["QRIS — Revenue", s.qrisRevenue, RP_FMT],
      ["QRIS — Transaksi", s.qrisCount, INT_FMT],
      ["QRIS — % transaksi", s.txCount ? s.qrisCount / s.txCount : 0, PCT_FMT],
      ["Transaksi dibatalkan", s.voidedCount, INT_FMT],
    ];
    rows.forEach((r, ri) => {
      const row = ws.getRow(5 + ri);
      const label = row.getCell(1);
      label.value = r[0];
      label.border = border;
      const val = row.getCell(2);
      val.value = r[1];
      val.numFmt = r[2];
      val.alignment = { horizontal: "right" };
      val.border = border;
      if (ri % 2 === 1) {
        const fill = {
          type: "pattern" as const,
          pattern: "solid" as const,
          fgColor: { argb: ZEBRA },
        };
        label.fill = fill;
        val.fill = fill;
      }
    });
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 20;
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  // ── Sheet 2: Produk Paling Laku ──
  addTableSheet(
    "Produk Paling Laku",
    [
      { header: "Peringkat", width: 11, align: "center" },
      { header: "Produk", width: 38 },
      { header: "Qty terjual", width: 14, fmt: INT_FMT, align: "right", total: true },
      { header: "Revenue", width: 18, fmt: RP_FMT, align: "right", total: true },
    ],
    insights.topProducts.map((p, i) => [i + 1, p.productName, p.qty, p.revenue]),
    { totalLabelIndex: 1 }
  );

  // ── Sheet 3: Varian Paling Laku (skip if empty) ──
  if (insights.topVariants.length > 0) {
    addTableSheet(
      "Varian Paling Laku",
      [
        { header: "Peringkat", width: 11, align: "center" },
        { header: "Varian", width: 42 },
        { header: "Qty terjual", width: 14, fmt: INT_FMT, align: "right", total: true },
        { header: "Revenue", width: 18, fmt: RP_FMT, align: "right", total: true },
      ],
      insights.topVariants.map((v, i) => [i + 1, v.name, v.qty, v.revenue]),
      { totalLabelIndex: 1 }
    );
  }

  // ── Sheet: Tingkat Gula (skip kalau tak ada penjualan minuman) ──
  if (insights.sugarLevels.length > 0) {
    addTableSheet(
      "Tingkat Gula",
      [
        { header: "Tingkat gula", width: 20 },
        { header: "Qty terjual", width: 14, fmt: INT_FMT, align: "right", total: true },
        { header: "Revenue", width: 18, fmt: RP_FMT, align: "right", total: true },
      ],
      insights.sugarLevels.map((s) => [s.label, s.qty, s.revenue]),
      { totalLabelIndex: 0 }
    );
  }

  // ── Sheet 4: Revenue Harian ──
  addTableSheet(
    "Revenue Harian",
    [
      { header: "Tanggal", width: 18 },
      { header: "Transaksi", width: 14, fmt: INT_FMT, align: "right", total: true },
      { header: "Revenue", width: 18, fmt: RP_FMT, align: "right", total: true },
    ],
    insights.daily.map((d) => [fmtDateID(d.date), d.txCount, d.revenue]),
    { totalLabelIndex: 0 }
  );

  // ── Sheet 5: Jam Paling Rame (0–23) ──
  addTableSheet(
    "Jam Paling Rame",
    [
      { header: "Jam", width: 10, align: "center" },
      { header: "Transaksi", width: 14, fmt: INT_FMT, align: "right", total: true },
      { header: "Revenue", width: 18, fmt: RP_FMT, align: "right", total: true },
    ],
    insights.hourly.map((h) => [
      `${String(h.hour).padStart(2, "0")}:00`,
      h.txCount,
      h.revenue,
    ]),
    { totalLabelIndex: 0 }
  );

  // ── Sheet 6: Hari Paling Rame (Minggu–Sabtu) ──
  addTableSheet(
    "Hari Paling Rame",
    [
      { header: "Hari", width: 14 },
      { header: "Transaksi", width: 14, fmt: INT_FMT, align: "right", total: true },
      { header: "Revenue", width: 18, fmt: RP_FMT, align: "right", total: true },
    ],
    insights.dow.map((d) => [DOW_FULL[d.dow] ?? String(d.dow), d.txCount, d.revenue]),
    { totalLabelIndex: 0 }
  );

  // ── Build blob + trigger download ──
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Insights-Penjualan-${sanitize(accountName)}-${insights.range.from}_${insights.range.to}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
