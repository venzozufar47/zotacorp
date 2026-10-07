"use server";

/**
 * Tugas Karyawan — task/checklist sekali-jalan, wajib foto per item, wajib
 * diverifikasi admin. Skema & alur status: migrasi 173.
 *
 * SEMUA tulis lewat service-role SETELAH cek kepemilikan + transisi status
 * (karyawan hanya punya SELECT di RLS). Transisi dijaga dengan UPDATE
 * bersyarat `.eq("status", ...)` supaya dua klik/dua admin tidak bisa
 * memproses task yang sama dua kali.
 *
 * Tabel baru belum ada di `Database` (types hand-merged) → cast longgar.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { checkStartDate } from "@/lib/tasks/start-date";
import { diffTaskItems } from "@/lib/tasks/edit-diff";
import { sendPushToAdmins, sendPushToUser } from "@/lib/push/web-push";
import {
  TASK_DEFER_REASON_MAX,
  TASK_DEFER_REASON_MIN,
  TASK_ATTACHMENT_BUCKET,
  TASK_EVIDENCE_BUCKET,
  TASK_FEEDBACK_MAX,
  TASK_REFERENCE_MAX,
  TASK_REJECT_NOTE_MAX,
  taskPhotoPrefix,
  type AdminTaskDetail,
  type AdminTaskRow,
  type MyTask,
  type TaskStatus,
} from "@/lib/tasks/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ADMIN_PATH = "/admin/tasks";

// ── helpers ──────────────────────────────────────────────────────────────

/** Push best-effort: tidak pernah menggagalkan alur bisnis. */
async function pushUser(userId: string, title: string, body: string) {
  try {
    await sendPushToUser(userId, { title, body, url: "/dashboard" });
  } catch (err) {
    console.error("[tasks] push to user failed:", err);
  }
}

async function pushAdmins(title: string, body: string) {
  try {
    await sendPushToAdmins({ title, body, url: "/admin/tasks" });
  } catch (err) {
    console.error("[tasks] push to admins failed:", err);
  }
}

/** URL bertanda-tangan 30 menit untuk banyak path sekaligus (path → url). */
async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = createAdminClient();
  const { data } = await db.storage.from(TASK_EVIDENCE_BUCKET).createSignedUrls(unique, 1800);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

/** Seperti signPhotos tapi untuk bucket lampiran admin. */
async function signAttachments(paths: (string | null)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return out;
  const { data } = await createAdminClient()
    .storage.from(TASK_ATTACHMENT_BUCKET)
    .createSignedUrls(unique, 1800);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

async function removePhotos(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return;
  try {
    await createAdminClient().storage.from(TASK_EVIDENCE_BUCKET).remove(list);
  } catch (err) {
    console.error("[tasks] remove photo failed:", err);
  }
}

/**
 * Validasi path lampiran admin: harus di folder admin yang sedang login (klien
 * mengunggah langsung ke storage, jadi server tidak boleh percaya string path),
 * tanpa "..", dan filenya benar-benar ada.
 */
async function validateAttachmentPaths(
  adminId: string,
  paths: string[]
): Promise<string | null> {
  const db = createAdminClient();
  for (const path of paths) {
    if (
      !path.startsWith(`${adminId}/`) ||
      path.includes("..") ||
      path.slice(adminId.length + 1).includes("/")
    ) {
      return "Lampiran tidak valid. Unggah ulang fotonya.";
    }
    const file = path.slice(adminId.length + 1);
    const { data } = await db.storage
      .from(TASK_ATTACHMENT_BUCKET)
      .list(adminId, { search: file, limit: 1 });
    if (!data || !data.some((o) => o.name === file)) {
      return "Ada foto lampiran yang belum selesai diunggah. Coba lagi.";
    }
  }
  return null;
}

async function insertAttachments(
  db: any,
  taskIds: string[],
  paths: string[],
  kind: "reference" | "feedback",
  round: number,
  adminId: string
): Promise<string | null> {
  if (taskIds.length === 0 || paths.length === 0) return null;
  const rows = taskIds.flatMap((task_id) =>
    paths.map((photo_path) => ({ task_id, kind, round, photo_path, uploaded_by: adminId }))
  );
  const { error } = await db.from("assigned_task_attachments").insert(rows);
  return error ? error.message : null;
}

/**
 * Hapus file lampiran dari storage hanya bila TIDAK ada lagi baris yang
 * merujuknya — tugas yang di-assign ke banyak karyawan berbagi satu file.
 */
async function removeUnreferencedAttachmentFiles(db: any, paths: (string | null)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return;
  const { data: stillUsed } = await db
    .from("assigned_task_attachments")
    .select("photo_path")
    .in("photo_path", unique);
  const used = new Set<string>((stillUsed ?? []).map((r: any) => r.photo_path));
  const orphan = unique.filter((p) => !used.has(p));
  if (orphan.length === 0) return;
  try {
    await createAdminClient().storage.from(TASK_ATTACHMENT_BUCKET).remove(orphan);
  } catch (err) {
    console.error("[tasks] remove attachment failed:", err);
  }
}

function revalidateAll() {
  revalidatePath(ADMIN_PATH);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

// ── Admin: buat / daftar / detail / review / batalkan ────────────────────

const createSchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Judul item wajib diisi").max(200),
        note: z.string().trim().max(500).optional().nullable(),
      })
    )
    .min(1, "Minimal satu item checklist")
    .max(40, "Maksimal 40 item"),
  assigneeIds: z.array(z.string().uuid()).min(1, "Pilih minimal satu karyawan").max(50),
  /** Foto referensi dari admin (sudah diunggah ke bucket task-attachments). */
  attachmentPaths: z.array(z.string()).max(TASK_REFERENCE_MAX).optional(),
  /** Tanggal mulai (YYYY-MM-DD, Jakarta). Kosong = hari ini. */
  startDate: z.string().optional(),
});

export type CreateAssignedTaskInput = z.input<typeof createSchema>;

export async function createAssignedTask(
  input: CreateAssignedTaskInput
): Promise<ActionResult<{ created: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const { title, description, items } = parsed.data;
  const assigneeIds = [...new Set(parsed.data.assigneeIds)];

  const today = jakartaDateString(new Date());
  const startDate = parsed.data.startDate || today;
  const startErr = checkStartDate(startDate, today);
  if (startErr) return { ok: false, error: startErr };
  const startsNow = startDate <= today;

  const attachmentPaths = [...new Set(parsed.data.attachmentPaths ?? [])];
  const attErr = await validateAttachmentPaths(gate.userId, attachmentPaths);
  if (attErr) return { ok: false, error: attErr };

  const db = createAdminClient() as any;

  // Hanya karyawan aktif — tugas ke admin/investor/akun nonaktif tidak punya
  // beranda & sign out yang bisa menyelesaikannya.
  const { data: people } = await db
    .from("profiles")
    .select("id, role, is_active")
    .in("id", assigneeIds);
  const valid = new Set<string>(
    (people ?? []).filter((p: any) => p.role === "employee" && p.is_active).map((p: any) => p.id)
  );
  const invalid = assigneeIds.filter((id) => !valid.has(id));
  if (invalid.length > 0) {
    return { ok: false, error: "Ada penerima yang bukan karyawan aktif." };
  }

  const batchId = crypto.randomUUID();
  const { data: tasks, error: taskErr } = await db
    .from("assigned_tasks")
    .insert(
      assigneeIds.map((assignee_id) => ({
        title,
        description: description || null,
        assignee_id,
        created_by: gate.userId,
        batch_id: batchId,
        start_date: startDate,
        // Mulai hari ini: push penugasan di bawah = pemberitahuan sekaligus
        // "pengingat pertama" → pengingat berikutnya ~2 jam lagi. Terjadwal:
        // dipush oleh cron pada tanggal mulainya (notifyStartedTasks).
        start_notified_at: startsNow ? new Date().toISOString() : null,
        last_reminded_at: startsNow ? new Date().toISOString() : null,
      }))
    )
    .select("id, assignee_id");
  if (taskErr || !tasks) {
    return { ok: false, error: taskErr?.message ?? "Gagal membuat tugas" };
  }

  const itemRows = tasks.flatMap((t: any) =>
    items.map((it, idx) => ({
      task_id: t.id,
      title: it.title,
      note: it.note || null,
      sort_order: idx,
    }))
  );
  const { error: itemErr } = await db.from("assigned_task_items").insert(itemRows);
  if (itemErr) {
    // Tanpa item, task tidak bisa dikerjakan — batalkan seluruh batch (cascade).
    await db.from("assigned_tasks").delete().eq("batch_id", batchId);
    return { ok: false, error: itemErr.message };
  }

  const insAttErr = await insertAttachments(
    db,
    tasks.map((t: any) => t.id),
    attachmentPaths,
    "reference",
    1,
    gate.userId
  );
  if (insAttErr) {
    await db.from("assigned_tasks").delete().eq("batch_id", batchId);
    await removeUnreferencedAttachmentFiles(db, attachmentPaths);
    return { ok: false, error: insAttErr };
  }

  if (startsNow) {
    await Promise.all(
      assigneeIds.map((uid) =>
        pushUser(uid, "Tugas baru untukmu 📋", `${title} — buka beranda untuk mengerjakan.`)
      )
    );
  }
  revalidateAll();
  return { ok: true, data: { created: tasks.length } };
}

async function buildAdminRows(tasks: any[]): Promise<AdminTaskRow[]> {
  if (tasks.length === 0) return [];
  const db = createAdminClient() as any;
  const ids = tasks.map((t) => t.id as string);
  const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id as string))];
  const [{ data: people }, { data: items }, { data: completions }, { data: deferrals }] =
    await Promise.all([
      db.from("profiles").select("id, full_name").in("id", assigneeIds),
      db.from("assigned_task_items").select("id, task_id").in("task_id", ids),
      db
        .from("assigned_task_completions")
        .select("task_id, round, photo_path")
        .in("task_id", ids),
      db
        .from("assigned_task_deferrals")
        .select("task_id, for_date, reason")
        .in("task_id", ids)
        .order("for_date", { ascending: false }),
    ]);
  const nameById = new Map<string, string>(
    (people ?? []).map((p: any) => [p.id, String(p.full_name ?? "").trim() || "—"])
  );
  return tasks.map((t) => {
    const mine = (items ?? []).filter((i: any) => i.task_id === t.id);
    const done = (completions ?? []).filter(
      (c: any) => c.task_id === t.id && c.round === t.current_round
    );
    const defs = (deferrals ?? []).filter((d: any) => d.task_id === t.id);
    return {
      id: t.id,
      startDate: t.start_date,
      title: t.title,
      description: t.description,
      assigneeId: t.assignee_id,
      assigneeName: nameById.get(t.assignee_id) ?? "—",
      status: t.status as TaskStatus,
      round: t.current_round,
      itemCount: mine.length,
      doneCount: done.length,
      submittedAt: t.submitted_at,
      createdAt: t.created_at,
      lastDeferral: defs[0] ? { forDate: defs[0].for_date, reason: defs[0].reason } : null,
      deferralCount: defs.length,
    };
  });
}

export async function listAssignedTasks(): Promise<ActionResult<AdminTaskRow[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("assigned_tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: await buildAdminRows(data ?? []) };
}

export async function getAssignedTaskDetail(
  taskId: string
): Promise<ActionResult<AdminTaskDetail>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = createAdminClient() as any;
  const { data: task } = await db
    .from("assigned_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Tugas tidak ditemukan" };

  const [
    rows,
    { data: items },
    { data: completions },
    { data: reviews },
    { data: deferrals },
    { data: attachmentRows },
  ] = await Promise.all([
      buildAdminRows([task]),
      db
        .from("assigned_task_items")
        .select("id, title, note, sort_order")
        .eq("task_id", taskId)
        .order("sort_order", { ascending: true }),
      db
        .from("assigned_task_completions")
        .select("item_id, photo_path, photo_purged_at")
        .eq("task_id", taskId)
        .eq("round", task.current_round),
      db
        .from("assigned_task_reviews")
        .select("round, decision, note, reviewed_at")
        .eq("task_id", taskId)
        .order("reviewed_at", { ascending: false }),
      db
        .from("assigned_task_deferrals")
        .select("for_date, reason")
        .eq("task_id", taskId)
        .order("for_date", { ascending: false }),
      db
        .from("assigned_task_attachments")
        .select("id, kind, round, photo_path")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
    ]);

  const urls = await signPhotos((completions ?? []).map((c: any) => c.photo_path).filter(Boolean));
  const attUrls = await signAttachments((attachmentRows ?? []).map((a: any) => a.photo_path));
  const byItem = new Map<string, any>((completions ?? []).map((c: any) => [c.item_id, c]));

  let batchOthers = 0;
  if (task.batch_id) {
    const { count } = await db
      .from("assigned_tasks")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", task.batch_id)
      .neq("id", taskId)
      .in("status", ["open", "submitted"]);
    batchOthers = count ?? 0;
  }

  return {
    ok: true,
    data: {
      ...rows[0],
      batchOthers,
      attachments: (attachmentRows ?? []).map((a: any) => ({
        id: a.id,
        kind: a.kind,
        round: a.round,
        url: a.photo_path ? attUrls.get(a.photo_path) ?? null : null,
      })),
      reviewNote: task.review_note,
      items: (items ?? []).map((i: any) => {
        const c = byItem.get(i.id);
        return {
          id: i.id,
          title: i.title,
          note: i.note,
          done: !!c,
          photoUrl: c?.photo_path ? urls.get(c.photo_path) ?? null : null,
          photoPurged: !!c && !c.photo_path && !!c.photo_purged_at,
        };
      }),
      reviews: (reviews ?? []).map((r: any) => ({
        round: r.round,
        decision: r.decision,
        note: r.note,
        reviewedAt: r.reviewed_at,
      })),
      deferrals: (deferrals ?? []).map((d: any) => ({ forDate: d.for_date, reason: d.reason })),
    },
  };
}

const updateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1, "Judul wajib diisi").max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(1, "Judul item wajib diisi").max(200),
        note: z.string().trim().max(500).optional().nullable(),
      })
    )
    .min(1, "Minimal satu item checklist")
    .max(40, "Maksimal 40 item"),
  /** Judul, keterangan + foto referensi BARU juga diterapkan ke salinan lain (satu batch) yang belum selesai. */
  applyToBatch: z.boolean().optional(),
  /** Ubah tanggal mulai — hanya selama tugas BELUM mulai. */
  startDate: z.string().optional(),
  /** Foto referensi baru (sudah diunggah) dan id lampiran referensi yang dibuang dari tugas ini. */
  addAttachmentPaths: z.array(z.string()).max(TASK_REFERENCE_MAX).optional(),
  removeAttachmentIds: z.array(z.string().uuid()).max(TASK_REFERENCE_MAX * 2).optional(),
});

export type UpdateAssignedTaskInput = z.input<typeof updateSchema>;

/**
 * Edit tugas.
 *  - Judul/keterangan: boleh selama tugas belum selesai/dibatalkan (open atau
 *    submitted), opsional ke seluruh salinan satu batch.
 *  - Item (tambah/hapus/ubah/urut): HANYA saat `open`. Saat `submitted`, admin
 *    sedang memeriksa foto per item — mengubah daftar item di tengah
 *    pemeriksaan membingungkan; setujui/tolak dulu.
 * Item dipertahankan lewat `id` (foto & status selesai ikut); item tanpa id =
 * baru; item yang tidak dikirim = dihapus beserta foto buktinya.
 * Urutan operasi: sisipkan → ubah → hapus, supaya tugas tidak pernah tanpa item.
 */
export async function updateAssignedTask(
  input: UpdateAssignedTaskInput
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const { taskId, title, description, items, applyToBatch } = parsed.data;
  const addPaths = [...new Set(parsed.data.addAttachmentPaths ?? [])];
  const removeIds = [...new Set(parsed.data.removeAttachmentIds ?? [])];

  const db = createAdminClient() as any;
  const { data: task } = await db
    .from("assigned_tasks")
    .select("id, title, assignee_id, status, batch_id, start_date, start_notified_at")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Tugas tidak ditemukan" };
  if (task.status !== "open" && task.status !== "submitted") {
    return { ok: false, error: "Tugas yang sudah selesai atau dibatalkan tidak bisa diedit." };
  }

  const { data: existing } = await db
    .from("assigned_task_items")
    .select("id, title, note, sort_order")
    .eq("task_id", taskId)
    .order("sort_order", { ascending: true });
  const existingRows: any[] = existing ?? [];
  const diff = diffTaskItems(existingRows, items);
  if (!diff.ok) return { ok: false, error: diff.error };
  const { added, removed, changed: itemsChanged } = diff;

  if (itemsChanged && task.status !== "open") {
    return {
      ok: false,
      error: "Item tidak bisa diubah saat tugas menunggu verifikasi. Setujui atau tolak dulu.",
    };
  }

  if (itemsChanged) {
    // 1. Sisipkan item baru.
    if (added.length > 0) {
      const { error: insErr } = await db.from("assigned_task_items").insert(
        items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) => !it.id)
          .map(({ it, idx }) => ({
            task_id: taskId,
            title: it.title,
            note: it.note || null,
            sort_order: idx,
          }))
      );
      if (insErr) return { ok: false, error: insErr.message };
    }
    // 2. Ubah judul/catatan/urutan item yang dipertahankan.
    const updates = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.id)
      .map(({ it, idx }) =>
        db
          .from("assigned_task_items")
          .update({ title: it.title, note: it.note || null, sort_order: idx })
          .eq("id", it.id)
          .eq("task_id", taskId)
      );
    const results = await Promise.all(updates);
    const failed = results.find((r: any) => r.error);
    if (failed) return { ok: false, error: failed.error.message };
    // 3. Hapus item yang dibuang + foto buktinya (semua ronde).
    if (removed.length > 0) {
      const removedIds = removed.map((r) => r.id);
      const { data: comps } = await db
        .from("assigned_task_completions")
        .select("photo_path")
        .in("item_id", removedIds);
      const { error: delErr } = await db
        .from("assigned_task_items")
        .delete()
        .in("id", removedIds)
        .eq("task_id", taskId);
      if (delErr) return { ok: false, error: delErr.message };
      await removePhotos((comps ?? []).map((c: any) => c.photo_path));
    }
  }

  // Lampiran contoh: batas jumlah dihitung dari yang ada - dibuang + baru.
  if (addPaths.length > 0 || removeIds.length > 0) {
    const { data: refRows } = await db
      .from("assigned_task_attachments")
      .select("id, photo_path")
      .eq("task_id", taskId)
      .eq("kind", "reference");
    const current: any[] = refRows ?? [];
    const removable = current.filter((r) => removeIds.includes(r.id));
    if (current.length - removable.length + addPaths.length > TASK_REFERENCE_MAX) {
      return { ok: false, error: `Maksimal ${TASK_REFERENCE_MAX} foto referensi.` };
    }
    const attErr = await validateAttachmentPaths(gate.userId, addPaths);
    if (attErr) return { ok: false, error: attErr };

    if (removable.length > 0) {
      await db
        .from("assigned_task_attachments")
        .delete()
        .in("id", removable.map((r) => r.id))
        .eq("task_id", taskId);
      await removeUnreferencedAttachmentFiles(db, removable.map((r) => r.photo_path));
    }
    if (addPaths.length > 0) {
      let targets = [taskId];
      if (applyToBatch && task.batch_id) {
        const { data: sibs } = await db
          .from("assigned_tasks")
          .select("id")
          .eq("batch_id", task.batch_id)
          .neq("id", taskId)
          .in("status", ["open", "submitted"]);
        targets = [taskId, ...(sibs ?? []).map((x: any) => x.id as string)];
      }
      const insErr = await insertAttachments(db, targets, addPaths, "reference", 1, gate.userId);
      if (insErr) return { ok: false, error: insErr };
    }
  }

  const header: Record<string, unknown> = { title, description: description || null };

  // Tanggal mulai: hanya boleh diubah selama tugas belum mulai. Pindah ke
  // hari ini/lebih awal = mulai sekarang (karyawan diberi tahu); tetap di
  // masa depan = tetap terjadwal.
  const today = jakartaDateString(new Date());
  let startsNowByEdit = false;
  const newStart = parsed.data.startDate;
  if (newStart && newStart !== task.start_date) {
    if (task.start_date <= today) {
      return { ok: false, error: "Tugas sudah dimulai — tanggal mulainya tidak bisa diubah." };
    }
    const startErr = checkStartDate(newStart, today);
    if (startErr) return { ok: false, error: startErr };
    header.start_date = newStart;
    if (newStart <= today && !task.start_notified_at) {
      startsNowByEdit = true;
      header.start_notified_at = new Date().toISOString();
      header.last_reminded_at = new Date().toISOString();
    }
  }

  const { error: headErr } = await db.from("assigned_tasks").update(header).eq("id", taskId);
  if (headErr) return { ok: false, error: headErr.message };
  if (startsNowByEdit) {
    await pushUser(task.assignee_id, "Tugas baru untukmu 📋", `${title} — buka beranda untuk mengerjakan.`);
  }
  if (applyToBatch && task.batch_id) {
    // Salinan lain: judul/keterangan selalu; tanggal mulai hanya untuk yang juga belum mulai.
    const { start_date, start_notified_at, last_reminded_at, ...textOnly } = header as any;
    void start_notified_at;
    void last_reminded_at;
    await db
      .from("assigned_tasks")
      .update(textOnly)
      .eq("batch_id", task.batch_id)
      .neq("id", taskId)
      .in("status", ["open", "submitted"]);
    if (start_date) {
      await db
        .from("assigned_tasks")
        .update({ start_date })
        .eq("batch_id", task.batch_id)
        .neq("id", taskId)
        .eq("status", "open")
        .gt("start_date", today)
        .is("start_notified_at", null);
    }
  }

  // Karyawan perlu tahu kalau daftar yang harus dikerjakan berubah.
  if (added.length > 0 || removed.length > 0) {
    await pushUser(
      task.assignee_id,
      "Tugas diperbarui 📋",
      `Checklist "${title}" diubah admin. Buka beranda untuk melihat item terbaru.`
    );
  }
  revalidateAll();
  return { ok: true };
}

export async function reviewAssignedTask(
  taskId: string,
  decision: "approve" | "reject",
  note?: string,
  /** Foto yang menyertai penolakan (sudah diunggah ke bucket task-attachments). */
  attachmentPaths?: string[]
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const feedback = (note ?? "").trim();
  if (decision === "reject") {
    if (!feedback) return { ok: false, error: "Feedback wajib diisi saat menolak." };
    if (feedback.length > TASK_REJECT_NOTE_MAX) {
      return { ok: false, error: `Feedback maksimal ${TASK_REJECT_NOTE_MAX} karakter.` };
    }
  }

  const feedbackPaths = decision === "reject" ? [...new Set(attachmentPaths ?? [])] : [];
  if (feedbackPaths.length > TASK_FEEDBACK_MAX) {
    return { ok: false, error: `Maksimal ${TASK_FEEDBACK_MAX} foto feedback.` };
  }
  const attErr = await validateAttachmentPaths(gate.userId, feedbackPaths);
  if (attErr) return { ok: false, error: attErr };

  const db = createAdminClient() as any;
  const { data: task } = await db
    .from("assigned_tasks")
    .select("id, title, assignee_id, status, current_round")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Tugas tidak ditemukan" };
  if (task.status !== "submitted") {
    return { ok: false, error: "Tugas ini tidak sedang menunggu verifikasi." };
  }

  const now = new Date().toISOString();
  const patch =
    decision === "approve"
      ? { status: "approved", reviewed_by: gate.userId, reviewed_at: now, review_note: null }
      : {
          status: "open",
          current_round: task.current_round + 1,
          reviewed_by: gate.userId,
          reviewed_at: now,
          review_note: feedback,
          submitted_at: null,
          // Push penolakan di bawah = pengingat pertama ronde ini.
          last_reminded_at: now,
        };

  // Guard status: kalau admin lain sudah memproses, 0 baris terupdate.
  const { data: updated } = await db
    .from("assigned_tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("status", "submitted")
    .select("id");
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Tugas ini sudah diproses." };
  }

  if (feedbackPaths.length > 0) {
    await insertAttachments(db, [taskId], feedbackPaths, "feedback", task.current_round, gate.userId);
  }

  await db.from("assigned_task_reviews").insert({
    task_id: taskId,
    round: task.current_round,
    decision: decision === "approve" ? "approved" : "rejected",
    note: feedback || null,
    reviewed_by: gate.userId,
  });

  if (decision === "approve") {
    await pushUser(task.assignee_id, "Tugas disetujui ✅", `${task.title} sudah diverifikasi. Terima kasih!`);
  } else {
    await pushUser(
      task.assignee_id,
      "Tugas perlu diulang 🔁",
      `${task.title} belum disetujui. Buka beranda untuk melihat feedback dan mengulang dari awal.`
    );
  }
  revalidateAll();
  return { ok: true };
}

export async function cancelAssignedTask(taskId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = createAdminClient() as any;
  const { data: updated } = await db
    .from("assigned_tasks")
    .update({ status: "cancelled" })
    .eq("id", taskId)
    .in("status", ["open", "submitted"])
    .select("id");
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Tugas tidak bisa dibatalkan (sudah selesai atau dibatalkan)." };
  }
  revalidateAll();
  return { ok: true };
}

// ── Karyawan ─────────────────────────────────────────────────────────────

export async function getMyOpenTasks(): Promise<MyTask[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = (await createClient()) as any; // RLS: hanya milik sendiri
  const today = jakartaDateString(new Date());

  const { data: tasks } = await supabase
    .from("assigned_tasks")
    .select("id, title, description, status, current_round, review_note")
    .eq("assignee_id", user.id)
    .in("status", ["open", "submitted"])
    // Tugas terjadwal (belum mulai) belum tampil di karyawan.
    .lte("start_date", today)
    .order("created_at", { ascending: true });
  if (!tasks || tasks.length === 0) return [];

  const ids = tasks.map((t: any) => t.id as string);
  const [{ data: items }, { data: completions }, { data: deferrals }, { data: attachments }] =
    await Promise.all([
    supabase
      .from("assigned_task_items")
      .select("id, task_id, title, note, sort_order")
      .in("task_id", ids)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assigned_task_completions")
      .select("item_id, task_id, round, photo_path")
      .in("task_id", ids),
    supabase
      .from("assigned_task_deferrals")
      .select("task_id, reason")
      .in("task_id", ids)
      .eq("for_date", today),
    supabase
      .from("assigned_task_attachments")
      .select("id, task_id, kind, round, photo_path")
      .in("task_id", ids)
      .not("photo_path", "is", null)
      .order("created_at", { ascending: true }),
  ]);
  const attUrls = await signAttachments((attachments ?? []).map((a: any) => a.photo_path));

  // Hanya completion yang MASIH punya foto yang dianggap selesai — selaras
  // dengan submitTask & gate (retensi 90 hari bisa mengosongkan photo_path).
  const current = (completions ?? []).filter((c: any) => {
    const t = tasks.find((x: any) => x.id === c.task_id);
    return t && c.round === t.current_round && c.photo_path;
  });
  const urls = await signPhotos(current.map((c: any) => c.photo_path).filter(Boolean));
  const doneByItem = new Map<string, any>(current.map((c: any) => [c.item_id, c]));
  const deferralByTask = new Map<string, string>(
    (deferrals ?? []).map((d: any) => [d.task_id, d.reason])
  );

  return tasks.map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    round: t.current_round,
    reviewNote: t.current_round > 1 ? t.review_note : null,
    items: (items ?? [])
      .filter((i: any) => i.task_id === t.id)
      .map((i: any) => {
        const c = doneByItem.get(i.id);
        return {
          id: i.id,
          title: i.title,
          note: i.note,
          done: !!c,
          photoUrl: c?.photo_path ? urls.get(c.photo_path) ?? null : null,
        };
      }),
    deferredToday: deferralByTask.has(t.id),
    deferralReason: deferralByTask.get(t.id) ?? null,
    referencePhotos: (attachments ?? [])
      .filter((a: any) => a.task_id === t.id && a.kind === "reference" && attUrls.has(a.photo_path))
      .map((a: any) => ({ id: a.id, url: attUrls.get(a.photo_path) as string })),
    // Feedback ronde yang baru ditolak = ronde sekarang - 1.
    feedbackPhotos:
      t.current_round > 1
        ? (attachments ?? [])
            .filter(
              (a: any) =>
                a.task_id === t.id &&
                a.kind === "feedback" &&
                a.round === t.current_round - 1 &&
                attUrls.has(a.photo_path)
            )
            .map((a: any) => ({ id: a.id, url: attUrls.get(a.photo_path) as string }))
        : [],
  }));
}

/** Memuat task milik user yang sedang login & masih `open` (bukan milik orang lain). */
type OwnTask =
  | { error: string }
  | { error?: undefined; user: { id: string }; task: any; db: any };

async function loadOwnOpenTask(taskId: string): Promise<OwnTask> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  const db = createAdminClient() as any;
  const { data: task } = await db
    .from("assigned_tasks")
    .select("id, title, assignee_id, status, current_round, start_date")
    .eq("id", taskId)
    .maybeSingle();
  if (!task || task.assignee_id !== user.id) return { error: "Tugas tidak ditemukan" };
  if (task.start_date > jakartaDateString(new Date())) {
    return { error: "Tugas ini belum dimulai." };
  }
  if (task.status !== "open") {
    return { error: "Tugas ini tidak sedang dikerjakan (sudah dikirim atau selesai)." };
  }
  return { user, task, db };
}

export async function completeTaskItem(input: {
  taskId: string;
  itemId: string;
  photoPath: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<ActionResult> {
  const own = await loadOwnOpenTask(input.taskId);
  if (own.error !== undefined) return { ok: false, error: own.error };
  const { user, task, db } = own;

  // Foto wajib & harus milik user + task + ronde INI (mencegah path orang lain
  // atau foto ronde lama dipakai ulang).
  const prefix = taskPhotoPrefix(user.id, task.id, task.current_round);
  if (!input.photoPath || !input.photoPath.startsWith(prefix) || input.photoPath.includes("..")) {
    return { ok: false, error: "Foto wajib dilampirkan (atau tugas sudah diperbarui — muat ulang beranda)." };
  }
  const slash = input.photoPath.lastIndexOf("/");
  const folder = input.photoPath.slice(0, slash);
  const file = input.photoPath.slice(slash + 1);
  const { data: listed } = await db.storage
    .from(TASK_EVIDENCE_BUCKET)
    .list(folder, { search: file, limit: 1 });
  if (!listed || !listed.some((o: any) => o.name === file)) {
    return { ok: false, error: "Foto tidak ditemukan di penyimpanan. Coba ambil ulang." };
  }

  const { data: item } = await db
    .from("assigned_task_items")
    .select("id")
    .eq("id", input.itemId)
    .eq("task_id", task.id)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item tidak ditemukan" };

  const { data: existing } = await db
    .from("assigned_task_completions")
    .select("id, photo_path")
    .eq("item_id", input.itemId)
    .eq("round", task.current_round)
    .maybeSingle();

  const row = {
    task_id: task.id,
    item_id: input.itemId,
    round: task.current_round,
    photo_path: input.photoPath,
    photo_purged_at: null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    completed_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db.from("assigned_task_completions").update(row).eq("id", existing.id)
    : await db.from("assigned_task_completions").insert(row);
  if (error) return { ok: false, error: error.message };

  if (existing?.photo_path && existing.photo_path !== input.photoPath) {
    await removePhotos([existing.photo_path]);
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function submitTask(taskId: string): Promise<ActionResult> {
  const own = await loadOwnOpenTask(taskId);
  if (own.error !== undefined) return { ok: false, error: own.error };
  const { user, task, db } = own;

  const [{ data: items }, { data: completions }] = await Promise.all([
    db.from("assigned_task_items").select("id").eq("task_id", task.id),
    db
      .from("assigned_task_completions")
      .select("item_id, photo_path")
      .eq("task_id", task.id)
      .eq("round", task.current_round),
  ]);
  const done = new Set<string>(
    (completions ?? []).filter((c: any) => c.photo_path).map((c: any) => c.item_id)
  );
  const missing = (items ?? []).filter((i: any) => !done.has(i.id)).length;
  if ((items ?? []).length === 0) return { ok: false, error: "Tugas tidak punya item." };
  if (missing > 0) {
    return { ok: false, error: `Masih ada ${missing} item tanpa foto.` };
  }

  const { data: updated } = await db
    .from("assigned_tasks")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("status", "open")
    .select("id");
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Tugas sudah dikirim." };
  }

  const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  await pushAdmins(
    "Tugas menunggu verifikasi 📋",
    `${String(me?.full_name ?? "Karyawan").trim()} mengirim "${task.title}".`
  );
  revalidateAll();
  return { ok: true };
}

export async function deferTaskToTomorrow(input: {
  taskId: string;
  reason: string;
}): Promise<ActionResult> {
  const reason = (input.reason ?? "").trim();
  if (reason.length < TASK_DEFER_REASON_MIN) {
    return { ok: false, error: `Alasan minimal ${TASK_DEFER_REASON_MIN} karakter.` };
  }
  if (reason.length > TASK_DEFER_REASON_MAX) {
    return { ok: false, error: `Alasan maksimal ${TASK_DEFER_REASON_MAX} karakter.` };
  }
  const own = await loadOwnOpenTask(input.taskId);
  if (own.error !== undefined) return { ok: false, error: own.error };
  const { user, task, db } = own;

  const { error } = await db.from("assigned_task_deferrals").insert({
    task_id: task.id,
    user_id: user.id,
    for_date: jakartaDateString(new Date()),
    reason,
  });
  // 23505 = sudah ditunda hari ini → idempoten, alasan pertama dipertahankan.
  if (error && (error as any).code !== "23505") return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

/** Daftar karyawan aktif untuk pemilih penerima di form admin. */
export async function listAssignableEmployees(): Promise<
  ActionResult<{ id: string; name: string; businessUnit: string | null }[]>
> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, nickname, business_unit")
    .eq("role", "employee")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((p: any) => ({
      id: p.id,
      name: String(p.full_name ?? "").trim() || String(p.nickname ?? "—"),
      businessUnit: p.business_unit ?? null,
    })),
  };
}
