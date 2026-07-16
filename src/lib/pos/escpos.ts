/**
 * Minimal ESC/POS byte builder untuk printer thermal 58mm (Font A = 32
 * kolom). Tanpa dependency — cukup untuk struk POS sederhana.
 *
 * Dipakai bareng RawBT (lihat `rawbt.ts`): byte hasil `build()` di-base64
 * lalu dikirim ke app RawBT via Android intent URL, yang meneruskannya
 * apa adanya ke printer Bluetooth.
 *
 * Catatan perangkat: Sano P5880 V2 (dan mayoritas printer mobile murah)
 * TIDAK punya auto-cutter, jadi kita tak memakai `GS V`; cukup umpan
 * beberapa baris di akhir supaya struk lewat tear-bar. Isomorphic —
 * tidak menyentuh DOM, aman diimpor di server maupun client.
 */

/** Lebar kertas efektif dalam karakter untuk Font A pada 58mm. */
export const COLS = 32;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Encode string ke byte 1-per-char (Latin1/ASCII). Karakter non-ASCII
 * (>0xFF) diganti "?" supaya tidak memproduksi byte multi-oktet UTF-8
 * yang dibaca printer sebagai sampah. Struk kita ASCII-only (Rupiah
 * "Rp" + angka), jadi ini cukup.
 */
/** Ganti punctuation tipografis umum ke ASCII sebelum encode, supaya
 *  tidak jadi "?" di printer (mis. em/en dash "—" dari nama varian). */
const ASCII_FOLD: Record<string, string> = {
  "—": "-", // — em dash
  "–": "-", // – en dash
  "‘": "'", // ' left single quote
  "’": "'", // ' right single quote
  "“": '"', // " left double quote
  "”": '"', // " right double quote
  "…": "...", // … ellipsis
  "×": "x", // × multiply
  "•": "*", // • bullet
  " ": " ", // nbsp
};

function encodeLatin1(str: string): number[] {
  const out: number[] = [];
  for (const ch of str) {
    const folded = ASCII_FOLD[ch] ?? ch;
    for (let i = 0; i < folded.length; i++) {
      const code = folded.charCodeAt(i);
      out.push(code <= 0xff ? code : 0x3f /* '?' */);
    }
  }
  return out;
}

export class EscPosBuilder {
  private bytes: number[] = [];

  /** ESC @ — reset printer ke kondisi default. Panggil di awal. */
  init(): this {
    this.bytes.push(ESC, 0x40);
    return this;
  }

  /** ESC a n — perataan: 0 kiri, 1 tengah, 2 kanan. */
  align(a: "left" | "center" | "right"): this {
    const n = a === "center" ? 1 : a === "right" ? 2 : 0;
    this.bytes.push(ESC, 0x61, n);
    return this;
  }

  /** ESC E n — tebal on/off. */
  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /**
   * GS ! n — ukuran karakter. normal = 1x; tall = 2x tinggi saja (lebar
   * tetap → aman untuk baris ber-kolom seperti TOTAL); double = 2x
   * lebar & tinggi (untuk brand header).
   * (n: bit 0-3 tinggi, bit 4-7 lebar; 0x01 = tall, 0x11 = double.)
   */
  size(s: "normal" | "tall" | "double"): this {
    const n = s === "double" ? 0x11 : s === "tall" ? 0x01 : 0x00;
    this.bytes.push(GS, 0x21, n);
    return this;
  }

  /** Tulis teks apa adanya (tanpa newline). */
  text(str: string): this {
    this.bytes.push(...encodeLatin1(str));
    return this;
  }

  /** Tulis teks lalu newline. */
  textLine(str = ""): this {
    this.bytes.push(...encodeLatin1(str), LF);
    return this;
  }

  /** Garis pemisah selebar kertas. */
  line(ch = "-"): this {
    return this.textLine(ch.repeat(COLS));
  }

  /**
   * Baris dua-kolom: `left` rata kiri, `right` rata kanan, dipisah spasi
   * agar total tepat COLS karakter. Kalau kepanjangan, `left` dipotong.
   */
  row(left: string, right: string): this {
    const space = Math.max(1, COLS - right.length);
    let l = left;
    if (l.length > space - 1) l = l.slice(0, space - 1);
    const gap = COLS - l.length - right.length;
    return this.textLine(l + " ".repeat(Math.max(1, gap)) + right);
  }

  /** Umpan `n` baris kosong. */
  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.bytes.push(LF);
    return this;
  }

  /** Hasil akhir sebagai Uint8Array siap kirim ke printer. */
  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Encode Uint8Array ke base64 tanpa Buffer (browser-safe). Chunked
 * supaya tidak kena limit argumen `String.fromCharCode` untuk payload
 * besar. Dipakai `rawbt.ts` untuk menyusun intent URL.
 */
export function bytesToBase64(u8: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    const slice = u8.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  // btoa ada di browser & Node modern (global). Ini util client-first.
  return btoa(binary);
}

/**
 * Decode byte ESC/POS jadi teks perkiraan (buang control byte) untuk
 * PRATINJAU di layar tanpa printer. Bukan render presisi — hanya untuk
 * memeriksa tata letak kolom/angka. Melewati sekuens ESC/GS.
 */
export function escPosToPreviewText(u8: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < u8.length) {
    const b = u8[i];
    if (b === ESC) {
      // ESC @ (2 byte) atau ESC x n (3 byte) — lewati sesuai perintah.
      const cmd = u8[i + 1];
      if (cmd === 0x40) i += 2;
      else i += 3;
      continue;
    }
    if (b === GS) {
      i += 3; // GS ! n
      continue;
    }
    if (b === LF) {
      out += "\n";
      i += 1;
      continue;
    }
    out += String.fromCharCode(b);
    i += 1;
  }
  return out;
}
