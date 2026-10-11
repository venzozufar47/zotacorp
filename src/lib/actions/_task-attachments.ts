/**
 * Bantuan lampiran foto admin pada Tugas (bucket task-attachments), dipakai
 * bersama oleh assigned-tasks.actions dan task-matrix.actions. Sengaja BUKAN
 * file "use server": fungsi di sini helper internal, bukan endpoint yang boleh
 * dipanggil dari klien.
 */

import { createAdminClient } from "./_supabase-admin";
import { TASK_ATTACHMENT_BUCKET } from "@/lib/tasks/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Seperti signPhotos tapi untuk bucket lampiran admin. */
export async function signAttachments(paths: (string | null)[]): Promise<Map<string, string>> {
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

/**
 * Validasi path lampiran admin: harus di folder admin yang sedang login (klien
 * mengunggah langsung ke storage, jadi server tidak boleh percaya string path),
 * tanpa "..", dan filenya benar-benar ada.
 */
export async function validateAttachmentPaths(
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

export async function insertAttachments(
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
export async function removeUnreferencedAttachmentFiles(db: any, paths: (string | null)[]) {
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
