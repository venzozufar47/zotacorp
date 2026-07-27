/**
 * Kapan sebuah postingan harus difoto ulang metriknya.
 *
 * Angka postingan terus naik setelah publish, jadi membandingkan kreator dari
 * satu angka akhir selalu memihak postingan yang lebih tua. Modul ini menentukan
 * titik-titik waktu yang ditangkap supaya "views 24 jam pertama" — pembanding
 * yang netral terhadap umur — benar-benar tersedia.
 *
 * Murni tanpa I/O supaya bisa diuji tanpa DB maupun jaringan, mengikuti
 * preseden decideCheckoutGate di src/lib/attendance/stock-opname-gate.ts.
 */

/** Tonggak awal: rapat di jam-jam pertama (saat kurva paling curam), makin
 *  jarang setelahnya. Harus urut menaik — dueSlots mengandalkan itu. */
export const POST_SLOTS = [
  { slot: "h1", ageMin: 60 },
  { slot: "h3", ageMin: 180 },
  { slot: "h6", ageMin: 360 },
  { slot: "h12", ageMin: 720 },
  { slot: "h24", ageMin: 1440 },
  { slot: "h48", ageMin: 2880 },
  { slot: "h72", ageMin: 4320 },
  { slot: "d7", ageMin: 10080 },
  { slot: "d14", ageMin: 20160 },
  { slot: "d30", ageMin: 43200 },
] as const;

/** Setelah d30 cukup sekali sehari, lalu berhenti total. Postingan berumur
 *  3 bulan praktis tidak bergerak lagi; terus memotretnya hanya membakar
 *  kuota API yang dibutuhkan postingan baru. */
export const LONG_TAIL_DAYS = 90;

const MINUTE_MS = 60_000;
const DAY_MIN = 1440;

export function ageMinutes(publishedAt: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(publishedAt)) / MINUTE_MS);
}

/** Label slot ekor panjang untuk sebuah tanggal (UTC — hanya dipakai sebagai
 *  kunci unik harian, bukan untuk ditampilkan). */
export function daySlot(d: Date): string {
  return `day:${d.toISOString().slice(0, 10)}`;
}

/**
 * Slot yang jatuh tempo sekarang untuk satu postingan: sudah cukup umur DAN
 * belum pernah ditangkap.
 *
 * `captured` adalah slot yang sudah ada di DB. Karena antrean kerja diturunkan
 * dari keadaan DB dan bukan dari cursor, cron yang mati di tengah jalan aman —
 * tick berikutnya menghitung ulang dan melanjutkan persis di titik berhenti.
 */
export function dueSlots(
  publishedAt: string,
  now: Date,
  captured: ReadonlySet<string>
): string[] {
  const age = ageMinutes(publishedAt, now);
  if (age < 0) return []; // terjadwal ke masa depan / jam server meleset
  const out: string[] = [];

  for (const s of POST_SLOTS) {
    if (age < s.ageMin) break; // menaik → sisanya pasti belum waktunya
    if (!captured.has(s.slot)) out.push(s.slot);
  }

  // Ekor panjang: satu tangkapan per hari sampai LONG_TAIL_DAYS, lalu beku.
  const lastMilestone = POST_SLOTS[POST_SLOTS.length - 1].ageMin;
  if (age >= lastMilestone && age <= LONG_TAIL_DAYS * DAY_MIN) {
    const slot = daySlot(now);
    if (!captured.has(slot)) out.push(slot);
  }
  return out;
}

/**
 * Prioritas antrean — makin kecil makin mendesak.
 *
 * Saat budget API menipis, postingan berumur 2 jam harus selalu mengalahkan
 * yang berumur 3 minggu: jendela awal itulah yang tidak bisa diulang kalau
 * terlewat, sedangkan angka postingan lama masih akan ada besok.
 */
export function postPriority(publishedAt: string, now: Date): number {
  return Math.max(0, ageMinutes(publishedAt, now));
}

/**
 * Nilai metrik pada umur tertentu, dipilih dari deret waktu yang tersimpan.
 *
 * Sengaja memakai age_minutes, BUKAN label slot: cron berjalan tiap 15 menit
 * sehingga slot "h1" sebenarnya tertangkap pada usia 60-75 menit. Mengambil
 * berdasarkan umur sebenarnya membuat perbandingan antar postingan jujur.
 *
 * Mengembalikan null bila belum ada tangkapan dalam jendela itu — jangan
 * diganti 0, karena 0 berarti "benar-benar nol views" dan akan meracuni
 * rata-rata leaderboard.
 */
export function valueAtAge<T extends { age_minutes: number }>(
  samples: readonly T[],
  maxAgeMinutes: number,
  pick: (s: T) => number | null | undefined
): number | null {
  let best: T | null = null;
  for (const s of samples) {
    if (s.age_minutes > maxAgeMinutes) continue;
    if (pick(s) == null) continue;
    if (!best || s.age_minutes > best.age_minutes) best = s;
  }
  return best ? pick(best) ?? null : null;
}
