/**
 * Mayar (payment gateway) — tarik transaksi lalu normalisasi ke
 * ParsedTransaction, sejajar dengan `sheet-import.ts`.
 *
 * Model pencatatan (keputusan bisnis, opsi "A"):
 *   credit = NET  = gross − biaya platform − biaya channel
 *   Gross + rincian biaya TIDAK jadi baris tersendiri; disimpan di
 *   `notes` supaya tetap bisa ditelusuri tanpa menggandakan revenue.
 *   Baris "Revenue" di PnL karena itu = angka net.
 *
 * Dua karakteristik API Mayar yang membentuk desain di sini:
 *
 * 1. `startAt`/`endAt` TIDAK berfungsi. Sudah diuji: rentang 30 hari dan
 *    7 hari mengembalikan payload identik (13 halaman, 620 transaksi,
 *    tanggal awal sama). Jadi kita selalu tarik seluruh riwayat lalu
 *    filter di sini. Murah selama riwayat masih ribuan baris; kalau
 *    nanti membengkak, ini titik yang perlu ditinjau ulang.
 *
 * 2. Fee baru muncul setelah settle. Transaksi berstatus `paid` punya
 *    `fee: []` — nilai net-nya belum final. Karena itu HANYA `settled`
 *    yang diimpor. Konsekuensinya transaksi masuk ke DB beberapa hari
 *    setelah tanggal transaksinya (lag settlement ±2–4 hari), tapi
 *    selalu dengan tanggal asli + angka final. Tidak pernah perlu
 *    meng-update baris yang sudah masuk.
 */

import type { ParsedTransaction } from "./types";

const MAYAR_BASE = "https://api.mayar.id/hl/v2";

/** Biaya platform Mayar. */
const FEE_PLATFORM = "mayar_fee";
/** Biaya channel (diteruskan dari Xendit). */
const FEE_CHANNEL = "xendit_fee";

/** Hanya status ini yang diakui sebagai pendapatan. */
const STATUS_SETTLED = "settled";

interface MayarFee {
  id?: string;
  balanceHistoryType?: string | null;
  debit?: number | null;
}

export interface MayarTransaction {
  id: string;
  credit?: number | null;
  status?: string | null;
  paymentMethod?: string | null;
  createdAt?: number | string | null;
  fee?: MayarFee[] | null;
  customer?: { name?: string | null } | null;
  paymentLink?: { name?: string | null } | null;
}

export interface MayarImportResult {
  transactions: ParsedTransaction[];
  warnings: string[];
  /** Jumlah baris mentah yang ditarik, sebelum filter status. */
  fetchedRaw: number;
  /** Baris yang dilewati karena belum settled. */
  skippedUnsettled: number;
}

/** `YYYY-MM-DD` menurut Asia/Jakarta — bukan UTC. */
const wibDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `HH:mm` menurut Asia/Jakarta. */
const wibTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** createdAt bisa datang sebagai detik atau milidetik — normalkan ke ms. */
function toMillis(raw: number | string | null | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function sumFee(tx: MayarTransaction, type: string): number {
  let total = 0;
  for (const f of tx.fee ?? []) {
    if (f?.balanceHistoryType === type) total += Number(f.debit) || 0;
  }
  return total;
}

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

/**
 * Tarik SELURUH transaksi lewat cursor pagination. `hasMore` +
 * `nextStartingAfter` yang menentukan berhenti; `maxPages` cuma
 * pengaman supaya cursor yang rusak tidak bikin loop tak berujung.
 */
export async function fetchMayarTransactions(
  apiKey: string,
  opts: { maxPages?: number } = {}
): Promise<MayarTransaction[]> {
  const maxPages = opts.maxPages ?? 300;
  const rows: MayarTransaction[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const url = new URL(`${MAYAR_BASE}/transactions`);
    url.searchParams.set("limit", "50"); // maksimum yang dizinkan Mayar
    if (cursor) url.searchParams.set("startingAfter", cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Mayar API gagal (HTTP ${res.status}). ${body.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as {
      data?: MayarTransaction[];
      hasMore?: boolean;
      nextStartingAfter?: string | null;
    };
    rows.push(...(json.data ?? []));
    cursor = json.hasMore ? json.nextStartingAfter ?? null : null;
    pages++;
  } while (cursor && pages < maxPages);

  if (cursor && pages >= maxPages) {
    throw new Error(
      `Mayar mengembalikan lebih dari ${maxPages} halaman — sync dihentikan agar tidak infinite loop.`
    );
  }
  return rows;
}

/**
 * Normalisasi transaksi Mayar → ParsedTransaction.
 *
 * `defaultBranch` diwarisi dari rekening (Mayar tidak punya konsep
 * cabang). `category` di-set eksplisit — tidak diserahkan ke rule
 * engine — karena semua baris di sini pasti pendapatan.
 */
export function mayarToTransactions(
  rows: MayarTransaction[],
  opts: { defaultBranch?: string | null; category?: string }
): MayarImportResult {
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const category = opts.category ?? "Revenue";
  let skippedUnsettled = 0;
  let skippedNoDate = 0;

  for (const tx of rows) {
    if (tx.status !== STATUS_SETTLED) {
      skippedUnsettled++;
      continue;
    }
    const ms = toMillis(tx.createdAt);
    if (ms === null) {
      skippedNoDate++;
      continue;
    }

    const gross = Number(tx.credit) || 0;
    const platform = sumFee(tx, FEE_PLATFORM);
    const channel = sumFee(tx, FEE_CHANNEL);
    const net = gross - platform - channel;

    if (net <= 0) {
      warnings.push(
        `Transaksi ${tx.id} punya net ${rp(net)} (gross ${rp(gross)}) — dilewati.`
      );
      continue;
    }

    const when = new Date(ms);
    const method = tx.paymentMethod?.trim() || "Mayar";
    const linkName = tx.paymentLink?.name?.trim() || null;

    transactions.push({
      date: wibDate.format(when),
      time: wibTime.format(when),
      // Nama pembayar, sejajar dengan kolom counterparty di rekening
      // bank. Email/HP sengaja tidak ikut disimpan.
      sourceDestination: tx.customer?.name?.trim() || undefined,
      transactionDetails: linkName ? `${method} — ${linkName}` : method,
      // Jejak gross + biaya ada di sini: angka credit sudah net, jadi
      // tanpa catatan ini rincian biayanya hilang sama sekali.
      notes:
        `Gross ${rp(gross)} · platform ${rp(platform)} · channel ${rp(channel)} · ` +
        `net ${rp(net)} · mayar:${tx.id}`,
      description: linkName ? `Mayar ${method} — ${linkName}` : `Mayar ${method}`,
      debit: 0,
      credit: net,
      category,
      branch: opts.defaultBranch ?? null,
    });
  }

  if (skippedNoDate > 0) {
    warnings.push(`${skippedNoDate} transaksi dilewati karena createdAt tidak valid.`);
  }
  if (transactions.length === 0 && rows.length > 0) {
    warnings.push(
      "Tidak ada transaksi settled untuk diimpor. Transaksi berstatus 'paid' belum cair dan sengaja tidak dihitung."
    );
  }

  return {
    transactions,
    warnings,
    fetchedRaw: rows.length,
    skippedUnsettled,
  };
}

/** Convenience: fetch + normalisasi dalam satu panggilan. */
export async function fetchAndParseMayar(
  apiKey: string,
  opts: { defaultBranch?: string | null; category?: string } = {}
): Promise<MayarImportResult> {
  const rows = await fetchMayarTransactions(apiKey);
  return mayarToTransactions(rows, opts);
}
