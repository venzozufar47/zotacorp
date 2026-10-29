/**
 * GET /api/pengadaan/daftar-halal?bu=<cabang>[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * Unduh Daftar Bahan Halal (Lampiran 5) satu cabang sebagai xlsx: kop dari profil halal cabang, satu baris per bahan/merek,
 * sel yang masih kosong disorot kuning. Tanpa rentang tanggal = merek yang sedang dipakai. Hanya petugas pengadaan cabang itu
 * (atau admin).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { requireProcurementForBu } from "@/lib/actions/_gates";
import { buildHalalRows, type HalalRow } from "@/lib/procurement/halal-list";
import { isRealDate } from "@/lib/social/scorecard";
import { jakartaDateString } from "@/lib/utils/jakarta";

const COLS: { header: string; width: number; key: keyof HalalRow | "no" }[] = [
  { header: "No", width: 5, key: "no" },
  { header: "Nama dan Merek", width: 38, key: "name" },
  { header: "Jenis Bahan *)", width: 16, key: "kind" },
  { header: "Produsen", width: 24, key: "producer" },
  { header: "Negara", width: 14, key: "country" },
  { header: "Supplier", width: 22, key: "supplier" },
  { header: "Lembaga Penerbit Sertifikat Halal", width: 24, key: "issuer" },
  { header: "Nomor Sertifikat Halal", width: 22, key: "certNo" },
  { header: "Masa Berlaku Sertifikat Halal", width: 18, key: "validUntil" },
  { header: "Dokumen Pendukung", width: 28, key: "doc" },
];

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bu = url.searchParams.get("bu") ?? "";
  const gate = await requireProcurementForBu(bu);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.error === "Not signed in" ? 401 : 403 });

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  let range: { from: string; to: string } | undefined;
  if (from || to) {
    if (!from || !to || !isRealDate(from) || !isRealDate(to) || from > to) return NextResponse.json({ error: "Rentang tanggal tidak valid" }, { status: 400 });
    range = { from, to };
  }

  const today = jakartaDateString(new Date());
  const { rows, profile } = await buildHalalRows(createAdminClient(), bu, range);

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zota Corp";
  const ws = wb.addWorksheet("Daftar Bahan", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = COLS.map((c) => ({ width: c.width }));

  const last = COLS.length;
  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = "Lampiran 5. Daftar Bahan Halal";
  ws.getCell(1, 1).font = { bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, last);
  ws.getCell(3, 1).value = "DAFTAR BAHAN";
  ws.getCell(3, 1).font = { bold: true, size: 14 };
  ws.getCell(3, 1).alignment = { horizontal: "center" };
  ws.mergeCells(4, 1, 4, last);
  ws.getCell(4, 1).value = profile.businessName.toUpperCase();
  ws.getCell(4, 1).font = { bold: true, size: 12 };
  ws.getCell(4, 1).alignment = { horizontal: "center" };
  if (range) {
    ws.mergeCells(5, 1, 5, last);
    ws.getCell(5, 1).value = `Merek yang dipakai ${longDate(range.from)} s.d. ${longDate(range.to)}`;
    ws.getCell(5, 1).font = { italic: true, size: 10 };
    ws.getCell(5, 1).alignment = { horizontal: "center" };
  }

  const thin = { style: "thin" as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const headRow = 7;
  COLS.forEach((c, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  ws.getRow(headRow).height = 34;

  const GAP = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF2B3" } };
  rows.forEach((r, idx) => {
    const rowNo = headRow + 1 + idx;
    COLS.forEach((c, i) => {
      const cell = ws.getCell(rowNo, i + 1);
      if (c.key === "no") cell.value = idx + 1;
      else if (c.key === "validUntil" && r.validUntil) {
        cell.value = new Date(`${r.validUntil}T00:00:00Z`);
        cell.numFmt = "dd/mm/yyyy";
      } else cell.value = (r[c.key] as string | null) ?? "";
      cell.border = border;
      cell.alignment = { vertical: "top", wrapText: true, horizontal: c.key === "no" ? "center" : "left" };
      if (c.key !== "no" && c.key !== "name" && (r.gaps as string[]).includes(c.key)) cell.fill = GAP;
    });
  });

  let n = headRow + rows.length + 1;
  ws.mergeCells(n, 1, n, last);
  ws.getCell(n, 1).value = "*) bahan baku / bahan tambahan / bahan penolong";
  ws.getCell(n, 1).font = { italic: true, size: 10 };
  n += 2;
  ws.mergeCells(n, 1, n, last);
  ws.getCell(n, 1).value = `Ditetapkan di ${profile.place || "........"}, ${longDate(today)}`;
  n += 2;
  const half = Math.ceil(last / 2);
  ws.mergeCells(n, 1, n, half);
  ws.mergeCells(n, half + 1, n, last);
  ws.getCell(n, 1).value = "Pemilik Usaha";
  ws.getCell(n, half + 1).value = "Penyelia Halal";
  for (const c of [1, half + 1]) ws.getCell(n, c).font = { bold: true };
  for (const c of [1, half + 1]) ws.getCell(n, c).alignment = { horizontal: "center" };
  n += 4;
  ws.mergeCells(n, 1, n, half);
  ws.mergeCells(n, half + 1, n, last);
  ws.getCell(n, 1).value = profile.ownerName || "(Nama Pemilik Usaha)";
  ws.getCell(n, half + 1).value = profile.halalSupervisorName || "(Nama Penyelia Halal)";
  for (const c of [1, half + 1]) ws.getCell(n, c).alignment = { horizontal: "center" };

  const gapCount = rows.reduce((s, r) => s + r.gaps.length, 0);
  if (gapCount > 0) {
    ws.getCell(headRow - 1, 1).value = `Sel kuning = data belum lengkap (${gapCount}).`;
    ws.getCell(headRow - 1, 1).font = { italic: true, size: 9, color: { argb: "FF8A6D00" } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const slug = bu.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="daftar-bahan-halal-${slug}-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
