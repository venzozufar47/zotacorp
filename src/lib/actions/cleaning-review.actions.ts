"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import { requireAdmin, type ActionResult } from "./_gates";

/**
 * Verdict admin atas foto bukti + catatan pembinaan karyawan (stage 2).
 *
 * Keduanya menulis lewat client BER-SESI (`createClient`), BUKAN service role.
 * Itu disengaja: trigger `cleaning_guard_review` dan `coaching_note_guard`
 * memutuskan berdasarkan `auth.uid()`, jadi menulis sebagai service role akan
 * melewati penjaganya. Lebih baik jalur tulis kita sendiri ikut diperiksa
 * penjaga yang sama dengan jalur lain — kalau gate di sini keliru suatu hari,
 * database masih menolak.
 */

export type CleaningVerdict = "unreviewed" | "ok" | "redo";

const MAX_NOTE = 500;

/**
 * Tandai satu foto bukti: diterima, perlu diulang, atau kembalikan ke belum
 * ditinjau.
 *
 * `redo` WAJIB beralasan. Meminta orang mengulang pekerjaan tanpa memberi tahu
 * apa yang kurang bukan instruksi, hanya penolakan — dan karyawan memang bisa
 * membaca catatan ini (policy select-own), jadi isinya harus cukup untuk
 * ditindak tanpa bertanya balik.
 */
export async function setCleaningPhotoVerdict(input: {
  completionId: string;
  verdict: CleaningVerdict;
  note?: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.completionId) return { ok: false, error: "Foto tidak dikenal" };
  if (!["unreviewed", "ok", "redo"].includes(input.verdict))
    return { ok: false, error: "Verdict tidak valid" };

  const note = input.note?.trim() || null;
  if (input.verdict === "redo" && !note)
    return {
      ok: false,
      error: "Tulis alasannya — karyawan perlu tahu apa yang harus diulang",
    };
  if (note && note.length > MAX_NOTE)
    return { ok: false, error: `Catatan maksimal ${MAX_NOTE} karakter` };

  const user = await getCurrentUser();
  // `as any`: kolom review & tabel catatan baru ada di migrasi 130/131, belum
  // di types.ts hasil generate. Pola yang sama dipakai di cleaning.actions.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const reviewed = input.verdict === "unreviewed";
  const { error } = await supabase
    .from("cleaning_task_completions")
    .update({
      review_status: input.verdict,
      // Kembali ke "belum ditinjau" berarti jejak reviewnya ikut dibersihkan;
      // menyisakan nama & waktu peninjau pada baris yang statusnya bukan hasil
      // tinjauan hanya akan membingungkan pembaca berikutnya.
      reviewed_by: reviewed ? null : user?.id ?? null,
      reviewed_at: reviewed ? null : new Date().toISOString(),
      review_note: reviewed ? null : note,
    })
    .eq("id", input.completionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/cleaning");
  revalidatePath("/dashboard");
  return { ok: true };
}

export interface CoachingNoteRow {
  id: string;
  body: string;
  context: string;
  createdAt: string;
  acknowledgedAt: string | null;
  authorName: string | null;
  periodFrom: string | null;
  periodTo: string | null;
}

/** Kirim catatan pembinaan ke seorang karyawan. Tampil di dashboard-nya. */
export async function createCoachingNote(input: {
  userId: string;
  body: string;
  context?: string;
  periodFrom?: string | null;
  periodTo?: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const body = input.body?.trim();
  if (!body) return { ok: false, error: "Catatan tidak boleh kosong" };
  if (body.length > 2000)
    return { ok: false, error: "Catatan maksimal 2000 karakter" };
  if (!input.userId) return { ok: false, error: "Karyawan tidak dikenal" };

  const user = await getCurrentUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("employee_coaching_notes").insert({
    user_id: input.userId,
    author_id: user?.id ?? null,
    context: input.context ?? "cleaning",
    body,
    period_from: input.periodFrom ?? null,
    period_to: input.periodTo ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/cleaning");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Catatan pembinaan milik penelepon sendiri, terbaru dulu. */
export async function listMyCoachingNotes(): Promise<CoachingNoteRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  // RLS `employee_coaching_notes_select_own` yang membatasi barisnya; filter
  // eksplisit di sini supaya admin (yang boleh membaca semua) tetap hanya
  // melihat miliknya sendiri di dashboard pribadinya.
  const { data } = await supabase
    .from("employee_coaching_notes")
    .select(
      "id, body, context, created_at, acknowledged_at, period_from, period_to, author:profiles!employee_coaching_notes_author_id_fkey(full_name)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  type Row = {
    id: string;
    body: string;
    context: string;
    created_at: string;
    acknowledged_at: string | null;
    period_from: string | null;
    period_to: string | null;
    author: { full_name?: string } | null;
  };
  return ((data ?? []) as Row[]).map((n) => ({
    id: n.id,
    body: n.body,
    context: n.context,
    createdAt: n.created_at,
    acknowledgedAt: n.acknowledged_at,
    periodFrom: n.period_from,
    periodTo: n.period_to,
    authorName:
      (n.author as { full_name?: string } | null)?.full_name ?? null,
  }));
}

/** Tandai sudah dibaca. Hanya menggerakkan `acknowledged_at` — isi catatannya
 *  dikunci trigger di database, bukan cuma oleh sopan santun pemanggil. */
export async function acknowledgeCoachingNote(
  id: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum masuk" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("employee_coaching_notes")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("acknowledged_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
