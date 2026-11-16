/**
 * Pengaman agar penjualan Mamaya House tidak tercatat di POS Haengbo Semarang.
 *
 * Mamaya punya rekening POS sendiri (insight & PnL terpisah), tetapi katalognya masih kosong sehingga kasir mengetik
 * pesanannya sebagai item bebas di POS Semarang. Dua pengaman di POSClient: (1) item bebas yang namanya berbau Mamaya
 * memunculkan pilihan pindah ke POS Mamaya; (2) pesanan besar berisi item bebas wajib memilih asalnya. Modul murni
 * kecuali helper serah-terima (sessionStorage, dibungkus try/catch).
 */

/** Nilai total item bebas (Rp) mulai dari mana kasir wajib memilih asal pesanan. */
export const BIG_FREE_ORDER_MIN = 500_000;

// Kata kunci yang dipakai kasir untuk barang Mamaya pada data Oktober 2026 (nama bisa salah ketik: "snak dos").
const MAMAYA_PATTERNS: readonly RegExp[] = [
  /mamaya/i,
  /\bsna?c?k\b/i, // snack / snak
  /roti\s+manis/i,
  /roti\s+coklat/i,
  /roti\s+gulung/i,
  /roti\s+unyil/i,
];

export function looksLikeMamaya(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && MAMAYA_PATTERNS.some((re) => re.test(n));
}

export interface HandoffItem {
  name: string;
  price: number;
  qty: number;
}

const HANDOFF_KEY = "pos-handoff-to-mamaya";
/** Serah-terima basi (mis. kasir tak jadi membuka POS Mamaya) tidak boleh muncul belakangan di transaksi lain. */
const HANDOFF_TTL_MS = 10 * 60 * 1000;

/** Simpan item bebas untuk dilanjutkan di POS Mamaya. false bila penyimpanan browser tidak tersedia. */
export function saveMamayaHandoff(items: HandoffItem[], nowMs: number = Date.now()): boolean {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ at: nowMs, items }));
    return true;
  } catch {
    return false;
  }
}

/** Ambil sekali lalu hapus. Mengabaikan data kedaluwarsa atau yang bentuknya tidak sah. */
export function takeMamayaHandoff(nowMs: number = Date.now()): HandoffItem[] {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (raw === null) return [];
    sessionStorage.removeItem(HANDOFF_KEY);
    const env: unknown = JSON.parse(raw);
    if (!env || typeof env !== "object") return [];
    const { at, items: parsed } = env as { at?: unknown; items?: unknown };
    if (typeof at !== "number" || nowMs - at > HANDOFF_TTL_MS || nowMs < at) return [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is HandoffItem =>
        !!x &&
        typeof x.name === "string" &&
        x.name.trim() !== "" &&
        Number.isFinite(x.price) &&
        x.price >= 0 &&
        Number.isInteger(x.qty) &&
        x.qty > 0
    );
  } catch {
    return [];
  }
}
