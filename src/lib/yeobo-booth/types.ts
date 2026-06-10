/**
 * Local TypeScript interfaces untuk modul Yeobo Booth.
 *
 * Tabel ini belum ada di `src/lib/supabase/types.ts` karena types
 * auto-generated dari `supabase gen types` yang baru di-run setelah
 * migration di-apply. Action + komponen pakai interface di sini sambil
 * menunggu regen.
 */

export type BookingStatus =
  | "scheduled"
  | "ongoing"
  | "completed"
  | "cancelled";

export type PaymentStatus = "belum_bayar" | "dp" | "lunas";

/**
 * Tipe booking Yeobo Booth:
 *  - "event_hire": sewa untuk acara (wedding, dll) — harga_total + alur DP/pelunasan.
 *  - "space_rent": sewa space (operator) — TANPA DP/pelunasan; revenue =
 *    harga_per_sesi × jumlah_sesi, biaya = biaya_sewa_space + (bagi_hasil_per_sesi ?? 0) × jumlah_sesi.
 */
export type BookingType = "event_hire" | "space_rent";

export type CancellationKind = "forfeit" | "refund";

export type ReminderCheckpoint = "H-7" | "H-3" | "H-1";

export const CANCELLATION_KIND_LABEL: Record<CancellationKind, string> = {
  forfeit: "Hangus",
  refund: "Refund",
};

export interface YeoboBoothFreelance {
  id: string;
  nama: string;
  no_hp: string | null;
  fee_per_sesi: number | null;
  aktif: boolean;
  catatan: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface YeoboBoothBooking {
  id: string;
  nama_klien: string;
  no_hp_klien: string | null;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  lokasi_event: string | null;
  /** Untuk event_hire: harga klien. Untuk space_rent: revenue (di-derive
   *  server = harga_per_sesi × jumlah_sesi) sehingga read existing tetap benar. */
  harga_total: number;
  booking_type: BookingType;
  // ── space_rent only (null untuk event_hire) ──
  biaya_sewa_space: number | null;
  harga_per_sesi: number | null;
  bagi_hasil_per_sesi: number | null;
  jumlah_sesi: number | null;
  payment_status: PaymentStatus;
  dp_nominal: number | null;
  dp_tanggal: string | null;
  dp_bank_account_id: string | null;
  dp_cashflow_transaction_id: string | null;
  pelunasan_nominal: number | null;
  pelunasan_tanggal: string | null;
  pelunasan_bank_account_id: string | null;
  pelunasan_cashflow_transaction_id: string | null;
  status: BookingStatus;
  cancellation_kind: CancellationKind | null;
  catatan: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface YeoboBoothBookingWithFreelance extends YeoboBoothBooking {
  freelance: YeoboBoothFreelance[];
}

export interface YeoboBoothReminderLog {
  id: string;
  booking_id: string;
  checkpoint: ReminderCheckpoint;
  sent_at: string;
  status: "sent" | "failed" | "skipped";
  error_message: string | null;
  recipient_count: number;
}

/**
 * Checkpoint reminder yang dapat dikonfigurasi. `days_before` = N pada
 * "H-N" (offset hari sebelum tanggal sesi), `send_hour` = jam kirim WIB
 * (0–23). `message_template` null → pakai template generik. Disimpan di
 * tabel `yeobo_booth_reminder_checkpoints` (migrasi 091).
 */
export interface YeoboBoothReminderCheckpoint {
  id: string;
  days_before: number;
  send_hour: number;
  enabled: boolean;
  label: string | null;
  message_template: string | null;
}

/**
 * Nomor WA penerima reminder Yeobo Booth — daftar custom yang dikelola
 * admin (tabel `yeobo_booth_reminder_recipients`). `phone_e164` = E.164
 * tanpa '+'.
 */
export interface YeoboBoothReminderRecipient {
  id: string;
  label: string;
  phone_e164: string;
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Input DTOs
// ─────────────────────────────────────────────────────────────────────

export interface CreateFreelanceInput {
  nama: string;
  no_hp?: string | null;
  fee_per_sesi?: number | null;
  catatan?: string | null;
}

export interface UpdateFreelanceInput extends CreateFreelanceInput {
  id: string;
  aktif: boolean;
}

export interface CreateBookingInput {
  booking_type: BookingType;
  nama_klien: string;
  no_hp_klien?: string | null;
  tanggal: string; // YYYY-MM-DD
  jam_mulai: string; // HH:mm
  jam_selesai: string; // HH:mm
  lokasi_event?: string | null;
  /** event_hire: wajib. space_rent: diabaikan (server derive dari per-sesi). */
  harga_total?: number;
  // space_rent only:
  biaya_sewa_space?: number | null;
  harga_per_sesi?: number | null;
  bagi_hasil_per_sesi?: number | null;
  jumlah_sesi?: number | null;
  catatan?: string | null;
  freelance_ids: string[];
}

export interface UpdateBookingInput
  extends Omit<CreateBookingInput, "freelance_ids"> {
  id: string;
  status: BookingStatus;
  freelance_ids: string[];
}

export interface RecordPaymentInput {
  booking_id: string;
  kind: "dp" | "lunas";
  nominal: number;
  tanggal: string; // YYYY-MM-DD
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  belum_bayar: "Belum Bayar",
  dp: "DP",
  lunas: "Lunas",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  scheduled: "Terjadwal",
  ongoing: "Berlangsung",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  event_hire: "Event Hire",
  space_rent: "Sewa Space",
};

// ── Helper ekonomi space_rent (operator) — dipakai form/detail/laporan ──
type SpaceRentFields = {
  biaya_sewa_space: number | null;
  harga_per_sesi: number | null;
  bagi_hasil_per_sesi: number | null;
  jumlah_sesi: number | null;
};

/** Pendapatan space_rent = harga_per_sesi × jumlah_sesi. */
export function spaceRentRevenue(b: SpaceRentFields): number {
  return (b.harga_per_sesi ?? 0) * (b.jumlah_sesi ?? 0);
}
/** Biaya space_rent = biaya_sewa_space + (bagi_hasil_per_sesi ?? 0) × jumlah_sesi. */
export function spaceRentCosts(b: SpaceRentFields): number {
  return (
    (b.biaya_sewa_space ?? 0) +
    (b.bagi_hasil_per_sesi ?? 0) * (b.jumlah_sesi ?? 0)
  );
}
/** Profit space_rent = revenue − costs. */
export function spaceRentProfit(b: SpaceRentFields): number {
  return spaceRentRevenue(b) - spaceRentCosts(b);
}

/** Business unit constant — dipakai di filter cashflow_transactions,
 *  bank_accounts dropdown, dan investor_business_unit_assignments. */
export const YEOBO_BOOTH_BU = "Yeobo Booth";

/** Kategori revenue yang ter-tag di setiap cashflow_transactions yang
 *  ter-generate dari pembayaran booking. Konsisten supaya PnL bisa
 *  agregasi by category. */
export const YEOBO_BOOTH_REVENUE_CATEGORY = "Yeobo Booth - Revenue";
