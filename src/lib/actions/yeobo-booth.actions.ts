"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireYeoboBoothAccess, type ActionResult } from "./_gates";
import {
  type CreateBookingInput,
  type RecordPaymentInput,
  type UpdateBookingInput,
  type YeoboBoothBooking,
  type YeoboBoothBookingWithFreelance,
  type YeoboBoothFreelance,
} from "@/lib/yeobo-booth/types";

const timeRegex = /^[0-2][0-9]:[0-5][0-9]$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Field bersama dua tipe booking. Field harga/space-rent opsional di skema;
// kewajibannya divalidasi per-tipe lewat `refineBooking`.
const baseBookingShape = {
  booking_type: z.enum(["event_hire", "space_rent"]),
  nama_klien: z.string().trim().min(1, "Nama klien wajib"),
  no_hp_klien: z.string().trim().optional().nullable(),
  tanggal: z.string().regex(dateRegex, "Tanggal harus YYYY-MM-DD"),
  jam_mulai: z.string().regex(timeRegex, "Jam mulai harus HH:mm"),
  jam_selesai: z.string().regex(timeRegex, "Jam selesai harus HH:mm"),
  lokasi_event: z.string().trim().optional().nullable(),
  harga_total: z.number().nonnegative("Harga tidak boleh negatif").optional(),
  biaya_sewa_space: z.number().nonnegative().optional().nullable(),
  harga_per_sesi: z.number().nonnegative().optional().nullable(),
  bagi_hasil_per_sesi: z.number().nonnegative().optional().nullable(),
  jumlah_sesi: z.number().int().positive().optional().nullable(),
  catatan: z.string().trim().optional().nullable(),
  freelance_ids: z.array(z.string().uuid()),
};

function refineBooking(
  v: {
    booking_type: "event_hire" | "space_rent";
    jam_mulai: string;
    jam_selesai: string;
    harga_total?: number;
    harga_per_sesi?: number | null;
    jumlah_sesi?: number | null;
  },
  ctx: z.RefinementCtx
) {
  if (v.jam_selesai <= v.jam_mulai) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Jam selesai harus lebih besar dari jam mulai",
      path: ["jam_selesai"],
    });
  }
  if (v.booking_type === "event_hire") {
    if (v.harga_total == null || v.harga_total <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Harga total wajib diisi",
        path: ["harga_total"],
      });
    }
  } else {
    if (v.harga_per_sesi == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Harga per sesi wajib diisi",
        path: ["harga_per_sesi"],
      });
    }
    if (v.jumlah_sesi == null || v.jumlah_sesi < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Jumlah sesi minimal 1",
        path: ["jumlah_sesi"],
      });
    }
  }
}

const createBookingSchema = z.object(baseBookingShape).superRefine(refineBooking);

const updateBookingSchema = z
  .object({
    ...baseBookingShape,
    id: z.string().uuid(),
    status: z.enum(["scheduled", "ongoing", "completed", "cancelled"]),
  })
  .superRefine(refineBooking);

const recordPaymentSchema = z.object({
  booking_id: z.string().uuid(),
  kind: z.enum(["dp", "lunas"]),
  nominal: z.number().positive("Nominal harus > 0"),
  tanggal: z.string().regex(dateRegex),
});

// ─────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────

export interface ListBookingsFilters {
  fromDate?: string;
  toDate?: string;
  status?: YeoboBoothBooking["status"];
  paymentStatus?: YeoboBoothBooking["payment_status"];
  bookingType?: YeoboBoothBooking["booking_type"];
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
  if (filters.bookingType) q = q.eq("booking_type", filters.bookingType);
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
  const d = parsed.data;
  const isSpace = d.booking_type === "space_rent";
  // space_rent: harga_total = revenue (harga_per_sesi × jumlah_sesi).
  const hargaTotal = isSpace
    ? (d.harga_per_sesi ?? 0) * (d.jumlah_sesi ?? 0)
    : d.harga_total ?? 0;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yeobo_booth_bookings" as never)
    .insert({
      booking_type: d.booking_type,
      nama_klien: d.nama_klien,
      no_hp_klien: d.no_hp_klien ?? null,
      tanggal: d.tanggal,
      jam_mulai: d.jam_mulai,
      jam_selesai: d.jam_selesai,
      lokasi_event: d.lokasi_event ?? null,
      harga_total: hargaTotal,
      biaya_sewa_space: isSpace ? d.biaya_sewa_space ?? null : null,
      harga_per_sesi: isSpace ? d.harga_per_sesi ?? null : null,
      bagi_hasil_per_sesi: isSpace ? d.bagi_hasil_per_sesi ?? null : null,
      jumlah_sesi: isSpace ? d.jumlah_sesi ?? null : null,
      catatan: d.catatan ?? null,
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
  const d = parsed.data;
  const isSpace = d.booking_type === "space_rent";
  const supabase = await createClient();

  // Guard: jangan ubah event_hire → space_rent kalau sudah ada pembayaran.
  const { data: existRow } = await supabase
    .from("yeobo_booth_bookings" as never)
    .select("booking_type, dp_tanggal, pelunasan_tanggal")
    .eq("id", d.id)
    .maybeSingle();
  const exist = existRow as unknown as {
    booking_type: string;
    dp_tanggal: string | null;
    pelunasan_tanggal: string | null;
  } | null;
  if (
    exist &&
    exist.booking_type === "event_hire" &&
    isSpace &&
    (exist.dp_tanggal || exist.pelunasan_tanggal)
  ) {
    return {
      ok: false,
      error:
        "Tidak bisa ubah ke Sewa Space: booking sudah ada pembayaran. Hapus pembayaran dulu.",
    };
  }

  const hargaTotal = isSpace
    ? (d.harga_per_sesi ?? 0) * (d.jumlah_sesi ?? 0)
    : d.harga_total ?? 0;
  const patch: Record<string, unknown> = {
    booking_type: d.booking_type,
    nama_klien: d.nama_klien,
    no_hp_klien: d.no_hp_klien ?? null,
    tanggal: d.tanggal,
    jam_mulai: d.jam_mulai,
    jam_selesai: d.jam_selesai,
    lokasi_event: d.lokasi_event ?? null,
    harga_total: hargaTotal,
    biaya_sewa_space: isSpace ? d.biaya_sewa_space ?? null : null,
    harga_per_sesi: isSpace ? d.harga_per_sesi ?? null : null,
    bagi_hasil_per_sesi: isSpace ? d.bagi_hasil_per_sesi ?? null : null,
    jumlah_sesi: isSpace ? d.jumlah_sesi ?? null : null,
    catatan: d.catatan ?? null,
    status: d.status,
  };
  if (isSpace) {
    // Sewa Space tak punya pembayaran — pastikan field DP/pelunasan bersih.
    patch.dp_nominal = null;
    patch.dp_tanggal = null;
    patch.pelunasan_nominal = null;
    patch.pelunasan_tanggal = null;
    patch.payment_status = "belum_bayar";
  }
  const { error } = await supabase
    .from("yeobo_booth_bookings" as never)
    .update(patch as never)
    .eq("id", d.id);
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

/**
 * Pilihan saat membatalkan booking yang sudah ada pembayaran:
 *
 *   - "forfeit": uang hangus / ditahan. Tidak ada reversal cashflow —
 *     pendapatan tetap diakui Yeobo Booth. Booking ditandai cancelled
 *     sebagai info bahwa sesi tidak jadi dilaksanakan.
 *   - "refund": uang dikembalikan ke klien. Insert baris debit baru di
 *     cashflow_transactions (kategori 'Yeobo Booth - Refund'),
 *     audit trail booking + payment tetap utuh, ledger seimbang.
 */
export type CancelChoice = "forfeit" | "refund";

const cancelSchema = z.object({
  booking_id: z.string().uuid(),
  choice: z.enum(["forfeit", "refund"]),
});

export interface CancelBookingInput {
  booking_id: string;
  choice: CancelChoice;
}

export async function cancelBooking(
  input: CancelBookingInput
): Promise<ActionResult> {
  const gate = await requireYeoboBoothAccess();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input invalid",
    };
  }

  const supabase = await createClient();
  const { data: row, error: bErr } = await supabase
    .from("yeobo_booth_bookings" as never)
    .select("*")
    .eq("id", parsed.data.booking_id)
    .maybeSingle();
  if (bErr) return { ok: false, error: bErr.message };
  if (!row) return { ok: false, error: "Booking tidak ditemukan" };
  const b = row as unknown as YeoboBoothBooking;
  if (b.status === "cancelled") {
    return { ok: false, error: "Booking sudah dibatalkan" };
  }

  // `cancellation_kind` (forfeit/refund) hanya disimpan sebagai info
  // pada booking — TIDAK menulis cashflow apa pun. Refund yang benar-
  // benar terjadi akan muncul sendiri di rekening koran saat di-upload
  // (sumber tunggal ledger Yeobo Booth).
  const { error } = await supabase
    .from("yeobo_booth_bookings" as never)
    .update({
      status: "cancelled",
      cancellation_kind: parsed.data.choice,
    } as never)
    .eq("id", parsed.data.booking_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Write — pembayaran (auto cashflow integration)
// ─────────────────────────────────────────────────────────────────────

export async function recordPayment(
  input: RecordPaymentInput
): Promise<ActionResult> {
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
  if (booking.booking_type === "space_rent") {
    return {
      ok: false,
      error: "Booking tipe Sewa Space tidak mencatat pembayaran DP/pelunasan.",
    };
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
  // "Sudah tercatat" ditandai oleh tanggal pembayaran (bukan lagi FK
  // cashflow — pembayaran booth TIDAK lagi menulis ke ledger).
  if (parsed.data.kind === "dp" && booking.dp_tanggal) {
    return {
      ok: false,
      error: "DP sudah tercatat. Hapus dulu DP lama untuk input ulang.",
    };
  }
  if (parsed.data.kind === "lunas" && booking.pelunasan_tanggal) {
    return {
      ok: false,
      error: "Pelunasan sudah tercatat.",
    };
  }

  // 3. Catat pembayaran di booking SAJA (status bayar) — tidak membuat
  //    transaksi cashflow. Sumber tunggal ledger Yeobo Booth = upload
  //    rekening koran. Kolom *_bank_account_id / *_cashflow_transaction_id
  //    sengaja dibiarkan null.
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
  } else {
    updatePatch.pelunasan_nominal = parsed.data.nominal;
    updatePatch.pelunasan_tanggal = parsed.data.tanggal;
  }

  const { error: updErr } = await supabase
    .from("yeobo_booth_bookings" as never)
    .update(updatePatch as never)
    .eq("id", booking.id);
  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true };
}

/**
 * Reverse pembayaran (DP / pelunasan) dari sisi booking. Karena
 * pembayaran booth tidak lagi menulis ke ledger, ini hanya mengosongkan
 * field pembayaran pada booking + menyesuaikan ulang `payment_status`.
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
    .select("booking_type, dp_tanggal, pelunasan_tanggal")
    .eq("id", bookingId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Booking tidak ditemukan" };
  const r = row as unknown as {
    booking_type: string;
    dp_tanggal: string | null;
    pelunasan_tanggal: string | null;
  };
  if (r.booking_type === "space_rent") {
    return { ok: false, error: "Booking tipe Sewa Space tidak punya pembayaran." };
  }

  const target = kind === "dp" ? r.dp_tanggal : r.pelunasan_tanggal;
  if (!target) return { ok: false, error: "Pembayaran tidak ditemukan" };

  // Status setelah leg ini dihapus: kalau leg lain masih ada,
  // turun ke 'dp'/'lunas' yang sesuai; kalau tidak, 'belum_bayar'.
  const otherLeg = kind === "dp" ? r.pelunasan_tanggal : r.dp_tanggal;
  const patch: Record<string, unknown> =
    kind === "dp"
      ? {
          dp_nominal: null,
          dp_tanggal: null,
          payment_status: otherLeg ? "lunas" : "belum_bayar",
        }
      : {
          pelunasan_nominal: null,
          pelunasan_tanggal: null,
          payment_status: otherLeg ? "dp" : "belum_bayar",
        };

  const { error } = await supabase
    .from("yeobo_booth_bookings" as never)
    .update(patch as never)
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/yeobo-booth", "layout");
  return { ok: true };
}

