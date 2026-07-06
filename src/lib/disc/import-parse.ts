/**
 * Parser PDF hasil DISC Frexor ("Hasil Attitude Test [DISC]") untuk fitur
 * import admin. Dua lapis:
 *
 *  1. `parseFrexorText` — baca text layer via `unpdf` (sudah dependency,
 *     jalan di serverless): nama, posisi, tanggal, pattern Grafik 1 & 2
 *     (nama + nomor + label "X Tinggi").
 *  2. `extractGraphPoints` — best-effort baca titik data kedua line chart
 *     dari operator vektor PDF (pdfjs). Titik digambar sebagai lingkaran
 *     kecil (kurva Bezier); pusatnya dikelompokkan per chart (kiri/kanan),
 *     diurutkan per sumbu-x (D,I,S,C), lalu dinormalisasi 0–100 terhadap
 *     tinggi chart. Kalau hasil tidak meyakinkan → null (admin isi manual
 *     / pakai bentuk referensi pattern).
 */

import { extractText, getDocumentProxy } from "unpdf";

export interface FrexorParsedPattern {
  name: string; // "Conductor"
  num: number; // 27
  high: string; // "D Tinggi"
}

export interface FrexorParsed {
  nama: string | null;
  posisi: string | null;
  /** ISO date (yyyy-mm-dd) dari "Senin, 06 Juli 2026". */
  tanggal: string | null;
  pattern1: FrexorParsedPattern | null;
  pattern2: FrexorParsedPattern | null;
  /** Nilai grafik hasil ekstraksi vektor; null bila gagal/meragukan. */
  graph1: { d: number; i: number; s: number; c: number } | null;
  graph2: { d: number; i: number; s: number; c: number } | null;
}

const BULAN: Record<string, string> = {
  januari: "01", februari: "02", maret: "03", april: "04", mei: "05",
  juni: "06", juli: "07", agustus: "08", september: "09", oktober: "10",
  november: "11", desember: "12",
};

function parseTanggalId(raw: string): string | null {
  // "Senin, 06 Juli 2026" / "06 Juli 2026"
  const m = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const bulan = BULAN[m[2].toLowerCase()];
  if (!bulan) return null;
  return `${m[3]}-${bulan}-${String(Number(m[1])).padStart(2, "0")}`;
}

export async function parseFrexorText(pdf: Uint8Array): Promise<FrexorParsed> {
  const { text } = await extractText(pdf, { mergePages: true });
  const t = Array.isArray(text) ? text.join("\n") : text;

  const nama = t.match(/Nama:\s*([^\n]+?)(?:\s+Posisi:|\n)/)?.[1]?.trim() ?? null;
  const posisi = t.match(/Posisi:\s*([^\n]+?)(?:\s+Tanggal:|\n)/)?.[1]?.trim() ?? null;
  const tglRaw = t.match(/Tanggal:\s*([^\n]+)/)?.[1] ?? "";
  const tanggal = parseTanggalId(tglRaw);

  // Pattern muncul sebagai "Conductor #27" diikuti "D Tinggi" — urutan
  // kemunculan pertama = Grafik 1, kedua = Grafik 2.
  const patRe = /([A-Za-z]+)\s*#(\d{1,2})\s+([DISC])\s*Tinggi/g;
  const pats: FrexorParsedPattern[] = [];
  for (const m of t.matchAll(patRe)) {
    pats.push({ name: m[1], num: Number(m[2]), high: `${m[3]} Tinggi` });
  }
  // Fallback: kadang nama pattern & "X Tinggi" terpisah baris — tangkap
  // pasangan "Name #NN" lalu cari "X Tinggi" terdekat setelahnya.
  if (pats.length < 2) {
    pats.length = 0;
    const nameRe = /([A-Za-z]+)\s*#(\d{1,2})/g;
    const nums: Array<{ name: string; num: number; idx: number }> = [];
    for (const m of nameRe.exec(t) ? t.matchAll(nameRe) : []) {
      nums.push({ name: m[1], num: Number(m[2]), idx: m.index ?? 0 });
    }
    for (const n of nums.slice(0, 2)) {
      const rest = t.slice(n.idx, n.idx + 200);
      const high = rest.match(/([DISC])\s*Tinggi/)?.[1];
      pats.push({ name: n.name, num: n.num, high: high ? `${high} Tinggi` : "" });
    }
  }

  const graphs = await extractGraphPoints(pdf).catch(() => null);

  return {
    nama,
    posisi,
    tanggal,
    pattern1: pats[0] ?? null,
    pattern2: pats[1] ?? null,
    graph1: graphs?.graph1 ?? null,
    graph2: graphs?.graph2 ?? null,
  };
}

/**
 * Ekstraksi titik data chart dari operator vektor halaman 1. Heuristik:
 * kumpulkan kurva Bezier tertutup kecil (lingkaran titik data), ambil
 * pusatnya, buang yang di luar area chart, kelompokkan jadi 2 chart
 * berdasarkan gap sumbu-x, ambil 4 titik per chart terurut x → D,I,S,C.
 * Normalisasi y → 0–100 dengan asumsi titik ekstrem chart mengikuti
 * bounding box sumbu chart yang digambar sebagai garis.
 */
export async function extractGraphPoints(pdf: Uint8Array): Promise<{
  graph1: { d: number; i: number; s: number; c: number };
  graph2: { d: number; i: number; s: number; c: number };
} | null> {
  const doc = await getDocumentProxy(pdf);
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  const OPS = (await import("pdfjs-dist/legacy/build/pdf.mjs")).OPS as Record<string, number>;

  // Kumpulkan segmen curve (c) per constructPath — lingkaran marker terdiri
  // dari 4 kurva Bezier dengan bbox kecil (~<12pt).
  const centers: Array<{ x: number; y: number }> = [];
  const rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.constructPath) continue;
    const [pathOps, coords] = ops.argsArray[i] as [number[], number[]];
    // Lacak bounding box path ini.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = 0; k + 1 < coords.length; k += 2) {
      const x = coords[k];
      const y = coords[k + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX)) continue;
    const w = maxX - minX;
    const h = maxY - minY;
    const hasCurve = pathOps.includes(OPS.curveTo);
    if (hasCurve && w > 1 && w < 14 && h > 1 && h < 14) {
      centers.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    } else if (!hasCurve && w > 100 && h > 100) {
      // Kotak besar — kandidat frame chart.
      rects.push({ x0: minX, y0: minY, x1: maxX, y1: maxY });
    }
  }

  if (centers.length < 8 || rects.length < 2) return null;

  // Dua frame chart = dua rect paling kiri-atas berukuran mirip.
  rects.sort((a, b) => a.x0 - b.x0);
  const frame1 = rects[0];
  const frame2 = rects.find((r) => r.x0 > frame1.x1 - 10) ?? rects[1];

  const inFrame = (c: { x: number; y: number }, f: typeof frame1) =>
    c.x >= f.x0 - 2 && c.x <= f.x1 + 2 && c.y >= f.y0 - 2 && c.y <= f.y1 + 2;

  const pick = (f: typeof frame1) => {
    const pts = centers.filter((c) => inFrame(c, f));
    if (pts.length !== 4) return null;
    pts.sort((a, b) => a.x - b.x); // D, I, S, C
    // PDF user-space y naik ke atas; nilai = posisi relatif dalam frame.
    const val = (y: number) => Math.round(((y - f.y0) / (f.y1 - f.y0)) * 100);
    return { d: val(pts[0].y), i: val(pts[1].y), s: val(pts[2].y), c: val(pts[3].y) };
  };

  const g1 = pick(frame1);
  const g2 = pick(frame2);
  if (!g1 || !g2) return null;
  const sane = (g: { d: number; i: number; s: number; c: number }) =>
    [g.d, g.i, g.s, g.c].every((v) => v >= 0 && v <= 100);
  if (!sane(g1) || !sane(g2)) return null;
  return { graph1: g1, graph2: g2 };
}
