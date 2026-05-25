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
  harga_total: number;
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
  nama_klien: string;
  no_hp_klien?: string | null;
  tanggal: string; // YYYY-MM-DD
  jam_mulai: string; // HH:mm
  jam_selesai: string; // HH:mm
  lokasi_event?: string | null;
  harga_total: number;
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
  bank_account_id: string;
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

/** Business unit constant — dipakai di filter cashflow_transactions,
 *  bank_accounts dropdown, dan investor_business_unit_assignments. */
export const YEOBO_BOOTH_BU = "Yeobo Booth";

/** Kategori revenue yang ter-tag di setiap cashflow_transactions yang
 *  ter-generate dari pembayaran booking. Konsisten supaya PnL bisa
 *  agregasi by category. */
export const YEOBO_BOOTH_REVENUE_CATEGORY = "Yeobo Booth - Revenue";
