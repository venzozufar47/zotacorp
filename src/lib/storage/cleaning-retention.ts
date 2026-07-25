/**
 * Retensi foto bukti kebersihan — dipanggil dari cron harian
 * `/api/cron/backup-database`, berdampingan dengan gcOrphanStorage().
 *
 * Bedanya dengan GC yatim: GC membuang file yang TIDAK direferensikan siapa
 * pun (kecelakaan upload). Sweeper ini membuang file yang MASIH direferensikan
 * tapi sudah kedaluwarsa — bukti kebersihan berumur >90 hari praktis tidak
 * pernah dibuka lagi, sementara volumenya tumbuh ±3,4 GB/tahun.
 *
 * Yang dihapus hanya GAMBARNYA. Baris cleaning_task_completions tetap utuh —
 * catatan "siapa mengerjakan item apa, kapan" adalah jejak audit yang harus
 * awet — dan ditandai photo_purged_at supaya UI bisa membedakan "fotonya
 * kedaluwarsa" dari "memang tidak pernah ada foto".
 *
 * Urutan operasi sengaja: hapus file DULU, baru kosongkan photo_path. Kalau
 * proses mati di tengah, yang tersisa adalah baris DB menunjuk file yang sudah
 * hilang — kondisi yang sudah ditangani UI (foto gagal dimuat) dan akan
 * dirapikan sweep berikutnya. Urutan sebaliknya akan meninggalkan file yatim
 * permanen yang tak seorang pun tahu asalnya.
 */

import { createClient } from "@supabase/supabase-js";

/** Berapa lama bukti foto disimpan sebelum dihapus otomatis. */
export const CLEANING_PHOTO_RETENTION_DAYS = 90;

const BUCKET = "cleaning-photos";
/** Batas per eksekusi cron supaya tidak menabrak maxDuration 300 dtk. */
const MAX_PER_RUN = 5000;
const BATCH = 100;

export interface RetentionResult {
  /** Batas tanggal: completion lebih lama dari ini kehilangan fotonya. */
  cutoff: string;
  /** Baris kedaluwarsa yang masih memegang foto saat sweep mulai. */
  found: number;
  /** File yang berhasil dihapus dari storage. */
  removed: number;
  /** Baris yang photo_path-nya berhasil dikosongkan. */
  cleared: number;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** YYYY-MM-DD, `days` hari sebelum hari ini (UTC — presisi jam tidak relevan
 *  untuk ambang 90 hari, dan menghindari ketergantungan zona waktu server). */
function cutoffDate(days: number): string {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function sweepCleaningPhotoRetention(
  days: number = CLEANING_PHOTO_RETENTION_DAYS
): Promise<RetentionResult> {
  const db = admin();
  const cutoff = cutoffDate(days);
  const result: RetentionResult = { cutoff, found: 0, removed: 0, cleared: 0 };

  const { data: rows, error } = await db
    .from("cleaning_task_completions")
    .select("id, photo_path")
    .lt("date", cutoff)
    .not("photo_path", "is", null)
    .order("date", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw new Error(`retensi: ${error.message}`);

  const expired = (rows ?? []).filter(
    (r): r is { id: string; photo_path: string } => !!r.photo_path
  );
  result.found = expired.length;
  if (expired.length === 0) return result;

  for (let i = 0; i < expired.length; i += BATCH) {
    const chunk = expired.slice(i, i + BATCH);

    // 1. Buang gambarnya.
    const { error: rmErr } = await db.storage
      .from(BUCKET)
      .remove(chunk.map((r) => r.photo_path));
    // File yang sudah tidak ada bukan kegagalan — tetap lanjut mengosongkan
    // baris DB-nya supaya tidak diproses ulang tiap hari selamanya.
    if (!rmErr) result.removed += chunk.length;

    // 2. Lepas rujukannya, tandai sebagai kedaluwarsa (bukan "tidak difoto").
    const { error: updErr } = await db
      .from("cleaning_task_completions")
      .update({ photo_path: null, photo_purged_at: new Date().toISOString() })
      .in(
        "id",
        chunk.map((r) => r.id)
      );
    if (!updErr) result.cleared += chunk.length;
  }

  return result;
}
