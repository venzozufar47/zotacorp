"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./_supabase-admin";
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
export type CleaningRedoReason = "angle" | "not_clean";

const MAX_NOTE = 500;
const REDO_REASON_LABEL: Record<CleaningRedoReason, string> = {
  angle: "Angle kurang tepat",
  not_clean: "Tempat tidak bersih",
};

/**
 * Tandai satu foto bukti: diterima, perlu diulang, atau kembalikan ke belum
 * ditinjau.
 *
 * `redo` WAJIB beralasan (kategori `redoReason` DAN catatan bebas). Meminta
 * orang mengulang pekerjaan tanpa memberi tahu apa yang kurang bukan
 * instruksi, hanya penolakan — dan karyawan memang bisa membaca catatan ini
 * (policy select-own), jadi isinya harus cukup untuk ditindak tanpa bertanya
 * balik. Kategori (angle vs belum bersih) dipisah dari catatan bebas supaya
 * dashboard karyawan bisa menampilkan badge ringkas sebelum membaca detail.
 */
export async function setCleaningPhotoVerdict(input: {
  completionId: string;
  verdict: CleaningVerdict;
  redoReason?: CleaningRedoReason | null;
  note?: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.completionId) return { ok: false, error: "Foto tidak dikenal" };
  if (!["unreviewed", "ok", "redo"].includes(input.verdict))
    return { ok: false, error: "Verdict tidak valid" };

  const note = input.note?.trim() || null;
  if (input.verdict === "redo" && !input.redoReason)
    return { ok: false, error: "Pilih alasannya dulu" };
  if (
    input.redoReason &&
    !["angle", "not_clean"].includes(input.redoReason)
  )
    return { ok: false, error: "Kategori alasan tidak dikenal" };
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
      redo_reason: input.verdict === "redo" ? input.redoReason : null,
    })
    .eq("id", input.completionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/cleaning");
  revalidatePath("/dashboard");
  return { ok: true };
}

const REF_BUCKET = "cleaning-refs";
const PHOTO_BUCKET = "cleaning-photos";

/**
 * Jadikan satu foto hasil review sebagai foto referensi baru untuk titik itu.
 *
 * Foto bukti karyawan hidup di bucket PRIVAT (cleaning-photos); referensi
 * hidup di bucket PUBLIK (cleaning-refs) supaya bisa ditampilkan tanpa signed
 * URL di layar checklist karyawan. Jadi ini bukan sekadar tukar path — file-
 * nya sendiri diunduh lalu diunggah ulang ke bucket publik lewat service
 * role (satu-satunya klien yang boleh membaca bucket privat orang lain).
 *
 * Nilai lama disimpan ke kolom `previous_*` SEBELUM ditimpa — itulah yang
 * dipakai `undoReferencePhoto` untuk kembali satu langkah kalau kepencet.
 */
export async function setPhotoAsReference(input: {
  completionId: string;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.completionId) return { ok: false, error: "Foto tidak dikenal" };

  const admin = createAdminClient();
  const { data: completion } = await admin
    .from("cleaning_task_completions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("photo_path, item_id, photo_req_id" as any)
    .eq("id", input.completionId)
    .maybeSingle();
  const row = completion as unknown as {
    photo_path: string | null;
    item_id: string;
    photo_req_id: string | null;
  } | null;
  if (!row) return { ok: false, error: "Foto tidak ditemukan" };
  if (!row.photo_req_id)
    return {
      ok: false,
      error: "Foto ini tidak terikat ke slot referensi manapun.",
    };
  if (!row.photo_path) return { ok: false, error: "Berkas fotonya sudah hilang." };

  const { data: file, error: downloadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .download(row.photo_path);
  if (downloadError || !file)
    return { ok: false, error: "Gagal membaca foto asli." };

  const ext = row.photo_path.split(".").pop()?.toLowerCase() || "jpg";
  const newPath = `${row.item_id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(REF_BUCKET)
    .upload(newPath, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
  if (uploadError) return { ok: false, error: "Gagal mengunggah foto referensi." };

  const { data: slot } = await admin
    .from("cleaning_item_photos")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("reference_photo_path, source_completion_id" as any)
    .eq("id", row.photo_req_id)
    .maybeSingle();
  const prev = slot as unknown as {
    reference_photo_path: string | null;
    source_completion_id: string | null;
  } | null;

  const { error: updateError } = await admin
    .from("cleaning_item_photos")
    .update({
      reference_photo_path: newPath,
      source_completion_id: input.completionId,
      previous_reference_photo_path: prev?.reference_photo_path ?? null,
      previous_source_completion_id: prev?.source_completion_id ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("id", row.photo_req_id);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/admin/cleaning");
  return { ok: true };
}

/**
 * Kembalikan foto referensi ke nilai sebelum `setPhotoAsReference` — SATU
 * langkah saja (dari kolom `previous_*`), bukan riwayat penuh. Cukup untuk
 * kasus "kepencet"; kalau sudah diganti dua kali, langkah pertama tidak bisa
 * diambil lagi.
 */
export async function undoReferencePhoto(input: {
  photoReqId: string;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.photoReqId) return { ok: false, error: "Titik tidak dikenal" };

  const admin = createAdminClient();
  const { data: slot } = await admin
    .from("cleaning_item_photos")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("previous_reference_photo_path, previous_source_completion_id" as any)
    .eq("id", input.photoReqId)
    .maybeSingle();
  const prev = slot as unknown as {
    previous_reference_photo_path: string | null;
    previous_source_completion_id: string | null;
  } | null;
  if (!prev?.previous_reference_photo_path)
    return { ok: false, error: "Tidak ada yang bisa dibatalkan." };

  const { error } = await admin
    .from("cleaning_item_photos")
    .update({
      reference_photo_path: prev.previous_reference_photo_path,
      source_completion_id: prev.previous_source_completion_id,
      previous_reference_photo_path: null,
      previous_source_completion_id: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("id", input.photoReqId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export interface PendingRedoPhoto {
  completionId: string;
  itemTitle: string;
  checklistName: string;
  redoReason: CleaningRedoReason | null;
  redoReasonLabel: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  /** Signed URL foto yang ditolak, atau null kalau sudah kedaluwarsa/hilang. */
  photoUrl: string | null;
  /** URL publik contoh foto yang benar, kalau titik ini punya referensi. */
  referenceUrl: string | null;
  assignmentId: string;
  itemId: string;
  photoReqId: string | null;
}

/**
 * Foto milik pemanggil yang masih berstatus redo DAN belum diperbaiki
 * (`fixed_by_completion_id` masih null) — inilah yang tampil di dashboard
 * sebagai "perlu diperbaiki" dan yang sama dicek gate blokir sign-in/checkout.
 */
export async function getMyPendingRedoPhotos(): Promise<PendingRedoPhoto[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data } = await supabase
    .from("cleaning_task_completions")
    .select(
      "id, assignment_id, item_id, photo_req_id, photo_path, redo_reason, review_note, reviewed_at, item:cleaning_checklist_items(title, checklist:cleaning_checklists(name))"
    )
    .eq("user_id", user.id)
    .eq("review_status", "redo")
    .is("fixed_by_completion_id", null)
    .order("reviewed_at", { ascending: false });

  type Row = {
    id: string;
    assignment_id: string;
    item_id: string;
    photo_req_id: string | null;
    photo_path: string | null;
    redo_reason: CleaningRedoReason | null;
    review_note: string | null;
    reviewed_at: string | null;
    item: { title?: string; checklist?: { name?: string } | null } | null;
  };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, 1800);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
    }
  }

  const reqIds = [
    ...new Set(rows.map((r) => r.photo_req_id).filter((v): v is string => !!v)),
  ];
  const refByReqId = new Map<string, string | null>();
  if (reqIds.length) {
    const { data: slots } = await supabase
      .from("cleaning_item_photos")
      .select("id, reference_photo_path")
      .in("id", reqIds);
    for (const s of slots ?? []) refByReqId.set(s.id, s.reference_photo_path);
  }
  const refUrl = (path: string | null | undefined) =>
    path
      ? supabase.storage.from(REF_BUCKET).getPublicUrl(path).data.publicUrl
      : null;

  return rows.map((r) => ({
    completionId: r.id,
    itemTitle: r.item?.title ?? "—",
    checklistName: r.item?.checklist?.name ?? "—",
    redoReason: r.redo_reason,
    redoReasonLabel: r.redo_reason ? REDO_REASON_LABEL[r.redo_reason] : null,
    reviewNote: r.review_note,
    reviewedAt: r.reviewed_at,
    photoUrl: r.photo_path ? urlByPath.get(r.photo_path) ?? null : null,
    referenceUrl: r.photo_req_id
      ? refUrl(refByReqId.get(r.photo_req_id))
      : null,
    assignmentId: r.assignment_id,
    itemId: r.item_id,
    photoReqId: r.photo_req_id,
  }));
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

/**
 * Angka untuk kartu quick-access "Review foto kebersihan" di Beranda admin.
 *
 * SENGAJA dibatasi ke foto 48 jam terakhir — bukan seluruh backlog
 * `unreviewed`. Migrasi 130 sudah memutuskan 'unreviewed' BUKAN antrean
 * (ada 2.000+ completion lama yang defaultnya begitu); menghitung semuanya di
 * sini akan membuat owner disambut angka ribuan yang menakutkan tiap buka
 * beranda, padahal tidak pernah ada janji untuk menuntaskan yang lama.
 * "Foto baru dalam 2 hari terakhir" tetap berguna (dorongan review rutin)
 * tanpa mengulang kesalahan yang sama.
 */
export async function getCleaningReviewQuickAccess(): Promise<{
  freshUnreviewedCount: number;
}> {
  const gate = await requireAdmin();
  if (!gate.ok) return { freshUnreviewedCount: 0 };
  const supabase = await createClient();
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from("cleaning_task_completions")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "unreviewed")
    .not("photo_path", "is", null)
    .gte("completed_at", since);
  return { freshUnreviewedCount: count ?? 0 };
}
