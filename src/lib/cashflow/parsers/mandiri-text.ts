/**
 * Pemecah kolom "Keterangan" e-Statement Mandiri menjadi kolom-kolom kita. Modul murni (tanpa impor) supaya bisa diuji.
 *
 * Keterangan Mandiri berisi beberapa baris: jenis transaksi, lalu pihak lawan (bank, nama, nomor rekening), kode referensi,
 * dan terakhir memo bebas yang diketik pengirim. Yang dipisahkan di sini:
 *  - transactionDetails : baris pertama (jenis transaksi)
 *  - sourceDestination  : nama pihak lawan, TANPA nomor rekening dan TANPA kode referensi
 *  - notes              : memo bebas pengirim
 *  - reference          : kode referensi/ID pembayaran (mis. "Transfer Fee 17911700368574" jadi 17911700368574, ID gateway, kode DANA)
 *  - description        : seluruh baris digabung " · " (TIDAK diubah: kunci dedupe memakainya)
 */

export interface SplitKeterangan {
  transactionDetails: string | undefined;
  sourceDestination: string | undefined;
  notes: string | undefined;
  reference: string | undefined;
  description: string;
}

/** Token campuran huruf+angka yang panjang: ID transaksi/gateway, bukan nama. */
const ID_TOKEN = /(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{12,}/;
const FEE_LINE = /^Transfer Fee\s+(\d{6,})$/i;
const DANA_REF = /^DANA\d{6,}[A-Za-z0-9]*$/;

/** Seluruh baris adalah kode: tiap token memuat angka dan panjang, dan ada huruf (angka murni = nomor rekening/VA, bukan kode). */
function isWholeReferenceLine(l: string): boolean {
  if (DANA_REF.test(l)) return true;
  if (!/[A-Za-z]/.test(l)) return false;
  const tokens = l.split(/\s+/);
  return tokens.every((t) => /\d/.test(t) && t.length >= 8) && /\d{4}/.test(l);
}

/** Baris berakhir dengan satu token ID (mis. "GoPay Bank Transfer ID26137406548835LH"): teks di depannya tetap, ID jadi referensi. */
function splitTrailingId(l: string): { text: string; id: string } | null {
  const tokens = l.split(/\s+/);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  if (!ID_TOKEN.test(last) || last.length < 12) return null;
  const text = tokens.slice(0, -1).join(" ");
  return text.length >= 3 ? { text, id: last } : null;
}

/** Baris yang berakhir nomor rekening (≥ 6 digit di ujung): pihak lawan, bukan memo. */
const ACCOUNT_TAIL = /(^|\s)\d{6,}$/;

function isMemoLine(l: string): boolean {
  return /[A-Za-z]{2,}/.test(l) && !ACCOUNT_TAIL.test(l);
}

/** Buang nomor rekening yang berdiri sendiri (≥ 6 digit) dari nama pihak. */
export function stripAccountNumber(s: string): string | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/\s+\d{6,}\b/g, "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

export function splitKeterangan(raw: string): SplitKeterangan {
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { transactionDetails: undefined, sourceDestination: undefined, notes: undefined, reference: undefined, description: "Transaksi" };
  }
  const description = lines.join(" · ");
  if (lines.length === 1) {
    return { transactionDetails: lines[0], sourceDestination: undefined, notes: undefined, reference: undefined, description };
  }

  const [details, ...rest] = lines;
  const refs: string[] = [];
  const kept: string[] = [];
  for (const l of rest) {
    const fee = FEE_LINE.exec(l);
    if (fee) {
      refs.push(fee[1]);
      continue;
    }
    if (isWholeReferenceLine(l)) {
      refs.push(l);
      continue;
    }
    const trailing = splitTrailingId(l);
    if (trailing) {
      refs.push(trailing.id);
      kept.push(trailing.text);
      continue;
    }
    kept.push(l);
  }
  // "Dari" / "Ke" yang berdiri sendiri di satu baris menempel ke baris nama sesudahnya.
  if (kept.length > 1 && /^(Dari|Ke)$/i.test(kept[0])) kept.splice(0, 2, `${kept[0]} ${kept[1]}`);

  let notes: string | undefined;
  if (kept.length >= 2 && isMemoLine(kept[kept.length - 1])) notes = kept.pop();

  return {
    transactionDetails: details,
    sourceDestination: stripAccountNumber(kept.join(" ")),
    notes,
    reference: refs.length > 0 ? refs.join(" ") : undefined,
    description,
  };
}
