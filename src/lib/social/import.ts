/**
 * Parser input manual konten sosmed.
 *
 * Sampai app review Meta/TikTok lolos, angka hanya bisa masuk lewat tangan.
 * Yang paling tidak menyiksa adalah menempel langsung dari spreadsheet, jadi
 * parser ini menerima TSV/CSV dengan baris header berbahasa bebas dan
 * memetakan sendiri kolomnya.
 *
 * Murni tanpa I/O supaya bisa diuji tanpa DB — penting karena angka hasil
 * parsing inilah yang nanti dipakai menilai orang.
 */

export interface ParsedPostRow {
  /** Baris ke berapa di input (1-based, tidak menghitung header) — dipakai
   *  melaporkan galat ke pengguna dengan tepat. */
  line: number;
  publishedDate: string; // YYYY-MM-DD
  publishedTime: string | null; // HH:MM
  caption: string | null;
  permalink: string | null;
  mediaType: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
}

export interface ParseResult {
  rows: ParsedPostRow[];
  errors: { line: number; message: string }[];
}

/** Sinonim kolom. Sengaja longgar: orang menempel dari mana saja, dan menolak
 *  data karena judul kolomnya "Suka" alih-alih "Likes" hanya membuat orang
 *  berhenti memakai fiturnya. */
const COLUMN_ALIASES: Record<keyof Omit<ParsedPostRow, "line">, string[]> = {
  publishedDate: ["tanggal", "date", "tgl", "publish", "published", "tanggal posting"],
  publishedTime: ["waktu", "time", "jam"],
  caption: ["caption", "judul", "keterangan", "deskripsi", "description", "konten"],
  permalink: ["link", "permalink", "url", "tautan"],
  mediaType: ["tipe", "type", "jenis", "format", "media"],
  views: ["views", "view", "tayangan", "penayangan", "ditonton", "plays"],
  likes: ["likes", "like", "suka", "disukai"],
  comments: ["comments", "comment", "komentar", "komen"],
  shares: ["shares", "share", "bagikan", "dibagikan"],
  saves: ["saves", "save", "simpan", "disimpan", "tersimpan"],
  reach: ["reach", "jangkauan", "akun dijangkau"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Angka gaya Indonesia dan gaya ringkas Instagram.
 *
 * "1.234" → 1234, "1,2rb" → 1200, "3,4 jt" → 3400000, "" → null.
 * Ini bukan kemewahan: Instagram MENAMPILKAN angka ringkas ("12,3 rb") dan
 * itulah yang orang salin. Memaksa mereka menerjemahkan sendiri adalah
 * undangan untuk salah ketik pada angka yang dipakai menilai kinerja.
 */
export function parseNumberID(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "" || s === "-" || s === "—") return null;

  const suffix = /(rb|ribu|k)\b/.test(s) ? 1_000 : /(jt|juta|m)\b/.test(s) ? 1_000_000 : 1;

  // Buang label satuan, sisakan digit dan pemisah.
  let body = s.replace(/(rb|ribu|k|jt|juta|m)\b/g, "").replace(/[^\d.,]/g, "").trim();
  if (body === "") return null;

  if (suffix > 1) {
    // Bentuk ringkas: koma/titik = pemisah desimal ("1,2rb" = 1200).
    body = body.replace(",", ".");
    const n = Number(body);
    return Number.isFinite(n) ? Math.round(n * suffix) : null;
  }

  // Bentuk penuh: titik & koma adalah pemisah ribuan ("1.234.567").
  const n = Number(body.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Terima 2026-03-01, 01/03/2026, 1-3-2026. Kembalikan YYYY-MM-DD atau null. */
export function parseDateID(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function parseTimeID(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function splitLine(line: string): string[] {
  // Tab lebih dulu: tempelan dari spreadsheet selalu tab-separated, dan
  // caption sering mengandung koma yang akan mengacaukan pemisahan koma.
  if (line.includes("\t")) return line.split("\t");
  return line.split(",");
}

/**
 * Ubah teks tempelan menjadi baris terstruktur.
 *
 * Baris pertama WAJIB header — tanpanya tidak ada cara aman menebak kolom
 * mana yang mana, dan menebak salah berarti menaruh jumlah komentar di kolom
 * views tanpa seorang pun sadar.
 */
export function parsePastedPosts(text: string): ParseResult {
  const errors: { line: number; message: string }[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ line: 0, message: "Butuh baris header + minimal satu baris data." }],
    };
  }

  const headers = splitLine(lines[0]).map(normalizeHeader);
  const colIndex: Partial<Record<keyof Omit<ParsedPostRow, "line">, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.some((a) => h === a || h.startsWith(a)));
    if (idx >= 0) colIndex[field as keyof typeof colIndex] = idx;
  }

  if (colIndex.publishedDate == null) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message:
            'Kolom tanggal tidak ditemukan. Beri judul kolom "Tanggal" (atau "Date").',
        },
      ],
    };
  }

  const at = (cells: string[], key: keyof typeof colIndex): string | undefined => {
    const i = colIndex[key];
    return i == null ? undefined : cells[i];
  };

  const rows: ParsedPostRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const lineNo = i;
    const date = parseDateID(at(cells, "publishedDate"));
    if (!date) {
      errors.push({
        line: lineNo,
        message: `Tanggal tidak terbaca: "${at(cells, "publishedDate") ?? ""}"`,
      });
      continue;
    }
    rows.push({
      line: lineNo,
      publishedDate: date,
      publishedTime: parseTimeID(at(cells, "publishedTime")),
      caption: at(cells, "caption")?.trim() || null,
      permalink: at(cells, "permalink")?.trim() || null,
      mediaType: at(cells, "mediaType")?.trim().toLowerCase() || null,
      views: parseNumberID(at(cells, "views")),
      likes: parseNumberID(at(cells, "likes")),
      comments: parseNumberID(at(cells, "comments")),
      shares: parseNumberID(at(cells, "shares")),
      saves: parseNumberID(at(cells, "saves")),
      reach: parseNumberID(at(cells, "reach")),
    });
  }
  return { rows, errors };
}

/**
 * ID stabil untuk postingan yang diinput manual.
 *
 * Postingan manual tidak punya id platform, padahal unique key tabel adalah
 * (account_id, external_post_id). ID diturunkan dari isinya supaya menempel
 * ULANG data yang sama memperbarui baris, bukan menggandakannya — orang pasti
 * akan menempel rentang yang tumpang tindih minggu depan.
 *
 * Permalink dipakai kalau ada karena itu identitas paling kuat; kalau tidak,
 * kombinasi tanggal + potongan caption.
 */
export function manualPostId(row: {
  permalink: string | null;
  publishedDate: string;
  caption: string | null;
}): string {
  if (row.permalink) {
    return `manual:${row.permalink.trim().replace(/\/+$/, "").toLowerCase()}`;
  }
  const slug = (row.caption ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `manual:${row.publishedDate}:${slug || "tanpa-caption"}`;
}
