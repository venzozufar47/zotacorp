"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireYeoboBoothAccess, type ActionResult } from "./_gates";
import {
  createPaymentCashflowTx,
  deletePaymentCashflowTx,
} from "@/lib/yeobo-booth/cashflow";
import type {
  CreateBookingInput,
  RecordPaymentInput,
  UpdateBookingInput,
  YeoboBoothBooking,
  YeoboBoothBookingWithFreelance,
  YeoboBoothFreelance,
} from "@/lib/yeobo-booth/types";

const timeRegex = /^[0-2][0-9]:[0-5][0-9]$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createBookingSchema = z
  .object({
    nama_klien: z.string().trim().min(1, "Nama klien wajib"),
    no_hp_klien: z.string().trim().optional().nullable(),
    tanggal: z.string().regex(dateRegex, "Tanggal harus YYYY-MM-DD"),
    jam_mulai: z.string().regex(timeRegex, "Jam mulai harus HH:mm"),
    jam_selesai: z.string().regex(timeRegex, "Jam selesai harus HH:mm"),
    lokasi_event: z.string().trim().optional().nullable(),
    harga_total: z
      .number()
      .nonnegative("Harga tidak boleh negatif"),
    catatan: z.string().trim().optional().nullable(),
    freelance_ids: z.array(z.string().uuid()),
  })
  .refine((v) => v.jam_selesai > v.jam_mulai, {
    message: "Jam selesai harus lebih besar dari jam mulai",
    path: ["jam_selesai"],
  });

const updateBookingSchema = z
  .object({
    id: z.string().uuid(),
    nama_klien: z.string().trim().min(1),
    no_hp_klien: z.string().trim().optional().nullable(),
    tanggal: z.string().regex(dateRegex),
    jam_mulai: z.string().regex(timeRegex),
    jam_selesai: z.string().regex(timeRegex),
    lokasi_event: z.string().trim().optional().nullable(),
    harga_total: z.number().nonnegative(),
    catatan: z.string().trim().optional().nullable(),
    freelance_ids: z.array(z.string().uuid()),
    status: z.enum(["scheduled", "ongoing", "completed", "cancelled"]),
  })
  .refine((v) => v.jam_selesai > v.jam_mulai, {
    message: "Jam selesai harus lebih besar dari jam mulai",
    path: ["jam_selesai"],
  });

const recordPaymentSchema = z.object({
  booking_id: z.string().uuid(),
  kind: z.enum(["dp", "lunas"]),
  nominal: z.number().positive("Nominal harus > 0"),
  tanggal: z.string().regex(dateRegex),
  bank_account_id: z.string().uuid(),
});

// ─────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────

export interface ListBookingsFilters {
  fromDate?: string;
  toDate?: string;
  status?: YeoboBoothBooking["status"];
  paymentStatus?: YeoboBoothBooking["payment_status"];
  freelanceId?: string;
  search?: string;
}

export async function listBookings(
  filters: ListBookingsFilters = {}
): Promise<YeoboBoothBookingWithFreelance[]> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return [];
  const supabase = await createClient();

  let q = supabase
    .from("yeobo_booth_bookings" as never)
    .select("*")
    .order("tanggal", { ascending: true })
    .order("jam_mulai", { ascending: true });
  if (filters.fromDate) q = q.gte("tanggal", filters.fromDate);
  if (filters.toDate) q = q.lte("tanggal", filters.toDate);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
  if (filters.search) q = q.ilike("nama_klien", `%${filters.search}%`);

  const { data: bookings } = await q;
  const rows = (bookings ?? []) as unknown as YeoboBoothBooking[];
  if (rows.length === 0) return [];

  // Hydrate freelance per booking
  const bookingIds = rows.map((b) => b.id);
  const { data: assignments } = await supabase
    .from("yeobo_booth_booking_freelance" as never)
    .select("booking_id, freelance_id")
    .in("booking_id", bookingIds);
  const assignRows =
    (assignments ?? []) as unknown as {
      booking_id: string;
      freelance_id: string;
    }[];
  const freelanceIds = Array.from(
    new Set(assignRows.map((a) => a.freelance_id))
  );
  let freelanceById = new Map<string, YeoboBoothFreelance>();
  if (freelanceIds.length > 0) {
    const { data: freelances } = await supabase
      .from("yeobo_booth_freelance" as never)
      .select("*")
      .in("id", freelanceIds);
    freelanceById = new Map(
      (
        (freelances ?? []) as unknown as YeoboBoothFreelance[]
      ).map((f) => [f.id, f])
    );
  }

  // Optional filter by freelance_id setelah hydrate.
  const filtered = filters.freelanceId
    ? rows.filter((b) =>
        assignRows.some(
          (a) =>
            a.booking_id === b.id && a.freelance_id === filters.freelanceId
        )
      )
    : rows;

  return filtered.map((b) => ({
    ...b,
    freelance: assignRows
      .filter((a) => a.booking_id === b.id)
      .map((a) => freelanceById.get(a.freelance_id))
      .filter((x): x is YeoboBoothFreelance => Boolean(x)),
  }));
}

export async function getBooking(
  id: string
): Promise<YeoboBoothBookingWithFreelance | null> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return null;
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("yeobo_booth_bookings" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return null;
  const b = booking as unknown as YeoboBoothBooking;

  const { data: assignments } = await supabase
    .from("yeobo_booth_booking_freelance" as never)
    .select("freelance_id")
    .eq("booking_id", id);
  const ids =
    ((assignments ?? []) as unknown as { freelance_id: string }[]).map(
      (a) => a.freelance_id
    );
  let freelance: YeoboBoothFreelance[] = [];
  if (ids.length > 0) {
    const { data: rows } = await supabase
      .from("yeobo_booth_freelance" as never)
      .select("*")
      .in("id", ids);
    freelance = (rows ?? []) as unknown as YeoboBoothFreelance[];
  }
  return { ...b, freelance };
}

// ─────────────────────────────────────────────────────────────────────
// Write — booking CRUD
// ─────────────────────────────────────────────────────────────────────

export async function createBooking(
  input: CreateBookingInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalid",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yeobo_booth_bookings" as never)
    .insert({
      nama_klien: parsed.data.nama_klien,
      no_hp_klien: parsed.data.no_hp_klien ?? null,
      tanggal: parsed.data.tanggal,
      jam_mulai: parsed.data.jam_mulai,
      jam_selesai: parsed.data.jam_selesai,
      lokasi_event: parsed.data.lokasi_event ?? null,
      harga_total: parsed.data.harga_total,
      catatan: parsed.data.catatan ?? null,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Gagal membuat booking" };
  }
  const bookingId = (data as { id: string }).id;

  if (parsed.data.freelance_ids.length > 0) {
    const rows = parsed.data.freelance_ids.map((fid) => ({
      booking_id: bookingId,
      freelance_id: fid,
    }));
    const { error: assignErr } = await supabase
      .from("yeobo_booth_booking_freelance" as never)
      .insert(rows as never);
    if (assignErr) {
      // Best-effort cleanup — booking sudah ada, error di m2m.
      await supabase
        .from("yeobo_booth_bookings" as never)
        .delete()
        .eq("id", bookingId);
      return { ok: false, error: assignErr.message };
    }
  }

  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true, data: { id: bookingId } };
}

export async function updateBooking(
  input: UpdateBookingInput
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = updateBookingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalid",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("yeobo_booth_bookings" as never)
    .update({
      nama_klien: parsed.data.nama_klien,
      no_hp_klien: parsed.data.no_hp_klien ?? null,
      tanggal: parsed.data.tanggal,
      jam_mulai: parsed.data.jam_mulai,
      jam_selesai: parsed.data.jam_selesai,
      lokasi_event: parsed.data.lokasi_event ?? null,
      harga_total: parsed.data.harga_total,
      catatan: parsed.data.catatan ?? null,
      status: parsed.data.status,
    } as never)
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  // Replace m2m assignments — delete-then-insert (simpler than diff).
  await supabase
    .from("yeobo_booth_booking_freelance" as never)
    .delete()
    .eq("booking_id", parsed.data.id);
  if (parsed.data.freelance_ids.length > 0) {
    const rows = parsed.data.freelance_ids.map((fid) => ({
      booking_id: parsed.data.id,
      freelance_id: fid,
    }));
    const { error: assignErr } = await supabase
      .from("yeobo_booth_booking_freelance" as never)
      .insert(rows as never);
    if (assignErr) return { ok: false, error: assignErr.message };
  }

  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true };
}

/** Soft cancel — preserves audit trail. Pembayaran yang sudah masuk
 *  TIDAK otomatis ter-reverse: admin harus hapus cashflow tx manual
 *  kalau memang mau refund (trigger DB akan clear FK di booking). */
export async function cancelBooking(id: string): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("yeobo_booth_bookings" as never)
    .update({ status: "cancelled" } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Write — pembayaran (auto cashflow integration)
// ─────────────────────────────────────────────────────────────────────

export async function recordPayment(
  input: RecordPaymentInput
): Promise<ActionResult<{ txId: string }>> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalid",
    };
  }
  const supabase = await createClient();

  // 1. Load booking — butuh nama_klien/tanggal untuk description tx +
  //    validasi nominal terhadap harga_total.
  const { data: bookingRow, error: bErr } = await supabase
    .from("yeobo_booth_bookings" as never)
    .select("*")
    .eq("id", parsed.data.booking_id)
    .maybeSingle();
  if (bErr) return { ok: false, error: bErr.message };
  if (!bookingRow) return { ok: false, error: "Booking tidak ditemukan" };
  const booking = bookingRow as unknown as YeoboBoothBooking;
  if (booking.status === "cancelled") {
    return { ok: false, error: "Booking sudah dibatalkan" };
  }

  // 2. Validasi: pembayaran tidak boleh melebihi sisa tagihan.
  const sudahDP = booking.dp_nominal ?? 0;
  const sudahLunas = booking.pelunasan_nominal ?? 0;
  const sisaTagihan = booking.harga_total - sudahDP - sudahLunas;
  if (sisaTagihan <= 0) {
    return { ok: false, error: "Booking sudah lunas, tidak ada sisa tagihan" };
  }
  if (parsed.data.nominal > sisaTagihan) {
    return {
      ok: false,
      error: `Nominal (${parsed.data.nominal.toLocaleString("id-ID")}) melebihi sisa tagihan (${sisaTagihan.toLocaleString("id-ID")})`,
    };
  }
  if (parsed.data.kind === "dp" && booking.dp_cashflow_transaction_id) {
    return {
      ok: false,
      error: "DP sudah tercatat. Hapus dulu DP lama untuk input ulang.",
    };
  }
  if (parsed.data.kind === "lunas" && booking.pelunasan_cashflow_transaction_id) {
    return {
      ok: false,
      error: "Pelunasan sudah tercatat.",
    };
  }

  // 3. Buat cashflow tx via admin client (bypass RLS — Yeobo Booth
  //    admin tidak punya policy WRITE di cashflow_*).
  const cf = await createPaymentCashflowTx({
    bookingId: booking.id,
    kind: parsed.data.kind,
    nominal: parsed.data.nominal,
    tanggal: parsed.data.tanggal,
    bankAccountId: parsed.data.bank_account_id,
    booking: { nama_klien: booking.nama_klien, tanggal: booking.tanggal },
    createdByUserId: gate.userId,
  });
  if (!cf.ok || !cf.txId) {
    return { ok: false, error: cf.error ?? "Gagal membuat cashflow tx" };
  }

  // 4. Update booking dengan field pembayaran + FK + payment_status.
  const totalBayarBaru =
    parsed.data.kind === "dp"
      ? sudahDP + parsed.data.nominal + sudahLunas
      : sudahDP + sudahLunas + parsed.data.nominal;
  const nextStatus =
    totalBayarBaru >= booking.harga_total ? "lunas" : "dp";

  const updatePatch: Record<string, unknown> = {
    payment_status: nextStatus,
  };
  if (parsed.data.kind === "dp") {
    updatePatch.dp_nominal = parsed.data.nominal;
    updatePatch.dp_tanggal = parsed.data.tanggal;
    updatePatch.dp_bank_account_id = parsed.data.bank_account_id;
    updatePatch.dp_cashflow_transaction_id = cf.txId;
  } else {
    updatePatch.pelunasan_nominal = parsed.data.nominal;
    updatePatch.pelunasan_tanggal = parsed.data.tanggal;
    updatePatch.pelunasan_bank_account_id = parsed.data.bank_account_id;
    updatePatch.pelunasan_cashflow_transaction_id = cf.txId;
  }

  const { error: updErr } = await supabase
    .from("yeobo_booth_bookings" as never)
    .update(updatePatch as never)
    .eq("id", booking.id);
  if (updErr) {
    // Rollback cashflow tx kalau update booking gagal — jangan
    // tinggalkan tx yatim.
    await deletePaymentCashflowTx(cf.txId);
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/admin/yeobo-booth", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { txId: cf.txId } };
}

/**
 * Reverse pembayaran dari sisi Yeobo Booth. Hapus cashflow tx
 * terkait — trigger DB akan reset field DP/pelunasan di booking
 * row (lihat migration 063).
 */
export async function reversePayment(
  bookingId: string,
  kind: "dp" | "lunas"
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("yeobo_booth_bookings" as never)
    .select("dp_cashflow_transaction_id, pelunasan_cashflow_transaction_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Booking tidak ditemukan" };
  const r = row as unknown as {
    dp_cashflow_transaction_id: string | null;
    pelunasan_cashflow_transaction_id: string | null;
  };
  const txId =
    kind === "dp"
      ? r.dp_cashflow_transaction_id
      : r.pelunasan_cashflow_transaction_id;
  if (!txId) return { ok: false, error: "Pembayaran tidak ditemukan" };

  const res = await deletePaymentCashflowTx(txId);
  if (!res.ok) return { ok: false, error: res.error ?? "Gagal reverse" };
  revalidatePath("/admin/yeobo-booth", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Bank accounts dropdown (helper) — list rekening yang valid untuk
// menerima pendapatan Yeobo Booth. Untuk simplicity, semua rekening
// aktif boleh dipilih; admin tinggal pilih sesuai realita transfer.
// ─────────────────────────────────────────────────────────────────────

export interface BankAccountOption {
  id: string;
  business_unit: string;
  bank: string;
  account_name: string;
  account_number: string | null;
}

export async function listBankAccountOptions(): Promise<BankAccountOption[]> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("id, business_unit, bank, account_name, account_number")
    .eq("is_active", true)
    .order("business_unit")
    .order("account_name");
  return (data ?? []) as unknown as BankAccountOption[];
}
