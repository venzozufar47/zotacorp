/**
 * Domain types + status kartu SIM. Tipe DB di-maintain manual (tabel baru
 * belum masuk supabase/types.ts) — server action pakai `.from("sim_cards"
 * as never)` lalu map ke bentuk di bawah.
 *
 * Status dihitung dari tanggal WIB hari ini:
 *   grace_until  < hari ini            → "expired" (hangus, paling gawat)
 *   active_until < hari ini            → "grace"   (masuk masa tenggang)
 *   selain itu                          → "ok"
 *   kedua tanggal kosong                → "unset"
 *
 * Reminder hanya untuk yang SUDAH lewat (grace/expired) — sesuai keputusan
 * produk, bukan H-N sebelum jatuh tempo.
 */

export type SimStatus = "ok" | "grace" | "expired" | "unset";

export interface SimCard {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  phoneNumber: string;
  provider: string | null;
  label: string | null;
  /** Terisi bila PIC adalah karyawan terdaftar. */
  picUserId: string | null;
  /** Nama tampil PIC — dari profil bila terdaftar, else input manual. */
  picName: string | null;
  /** Nomor WA PIC — dari profil bila terdaftar, else input manual. */
  picPhone: string | null;
  picIsUser: boolean;
  /** YYYY-MM-DD */
  activeUntil: string | null;
  /** YYYY-MM-DD */
  graceUntil: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SimTopup {
  id: string;
  simCardId: string;
  toppedUpBy: string | null;
  toppedUpByName: string | null;
  proofPath: string;
  newActiveUntil: string | null;
  newGraceUntil: string | null;
  amountIdr: number | null;
  note: string | null;
  createdAt: string;
}

export const SIM_STATUS_LABELS: Record<SimStatus, string> = {
  ok: "Aman",
  grace: "Masa tenggang",
  expired: "Hangus",
  unset: "Tanggal belum diisi",
};

/** Selisih hari (a - b) untuk dua tanggal YYYY-MM-DD. UTC math supaya bebas TZ. */
export function diffDays(aYmd: string, bYmd: string): number {
  const a = Date.parse(`${aYmd}T00:00:00Z`);
  const b = Date.parse(`${bYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

type DatePair = { activeUntil: string | null; graceUntil: string | null };

/**
 * Status kartu pada tanggal WIB `todayYmd` (YYYY-MM-DD).
 *
 * Defensif terhadap data tidak konsisten (grace_until < active_until, mis.
 * hasil impor lama): "hangus" hanya bila masa aktif JUGA sudah lewat —
 * kalau masa aktif masih berjalan, kartu tetap dianggap aman.
 */
export function simStatus(card: DatePair, todayYmd: string): SimStatus {
  const { activeUntil, graceUntil } = card;
  if (!activeUntil && !graceUntil) return "unset";
  const activePassed = !activeUntil || diffDays(todayYmd, activeUntil) > 0;
  if (graceUntil && diffDays(todayYmd, graceUntil) > 0 && activePassed)
    return "expired";
  if (activeUntil && diffDays(todayYmd, activeUntil) > 0) return "grace";
  return "ok";
}

/** Perlu diingatkan? Hanya yang sudah lewat tenggat. */
export function isSimOverdue(status: SimStatus): boolean {
  return status === "grace" || status === "expired";
}

/**
 * Berapa hari telat dari tenggat yang relevan (grace_until bila sudah
 * hangus, active_until bila baru masuk tenggang). 0 bila belum lewat.
 */
export function daysLate(card: DatePair, todayYmd: string): number {
  const status = simStatus(card, todayYmd);
  if (status === "expired" && card.graceUntil) {
    return Math.max(0, diffDays(todayYmd, card.graceUntil));
  }
  if (status === "grace" && card.activeUntil) {
    return Math.max(0, diffDays(todayYmd, card.activeUntil));
  }
  return 0;
}

/** Ringkasan status untuk pesan WA / badge, mis. "tenggang, telat 3 hari". */
export function simStatusSummary(card: DatePair, todayYmd: string): string {
  const status = simStatus(card, todayYmd);
  if (!isSimOverdue(status)) return SIM_STATUS_LABELS[status];
  const late = daysLate(card, todayYmd);
  const base = status === "expired" ? "hangus" : "tenggang";
  return late > 0 ? `${base}, telat ${late} hari` : base;
}
