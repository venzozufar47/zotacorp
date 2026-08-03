/**
 * Retensi media generik — dipanggil dari cron harian
 * `/api/cron/backup-database`, berdampingan dengan sweepCleaningPhotoRetention()
 * dan gcOrphanStorage().
 *
 * Generalisasi dari `cleaning-retention.ts`, yang sudah terbukti jalan untuk
 * foto kebersihan. Dua target baru:
 *   - `cashflow-receipts`  : 2,5 GB, 87% dari SELURUH storage org.
 *   - `attendance-selfies` : tumbuh ±50 MB/bulan tanpa batas.
 *
 * Bedanya dengan GC yatim: GC membuang file yang TIDAK direferensikan siapa pun
 * (kecelakaan upload). Sweeper ini membuang file yang MASIH direferensikan tapi
 * sudah kedaluwarsa.
 *
 * Yang dihapus HANYA gambarnya. Baris transaksi dan log absensi tetap utuh —
 * keduanya jejak audit permanen — dan ditandai `*_purged_at` supaya UI bisa
 * membedakan "fotonya kedaluwarsa" dari "memang tidak pernah ada foto".
 *
 * Urutan operasi sengaja sama dengan sweeper kebersihan: hapus file DULU, baru
 * kosongkan path. Kalau proses mati di tengah, yang tersisa adalah baris DB
 * menunjuk file yang sudah hilang — kondisi yang sudah ditangani UI (foto gagal
 * dimuat) dan dirapikan sweep berikutnya. Urutan sebaliknya meninggalkan file
 * yatim permanen yang tak seorang pun tahu asalnya.
 */

import { createClient } from "@supabase/supabase-js";

/** Ambang retensi, disamakan dengan CLEANING_PHOTO_RETENTION_DAYS. */
export const MEDIA_RETENTION_DAYS = 90;

/** Batas per eksekusi cron supaya tidak menabrak maxDuration 300 dtk. */
const MAX_PER_RUN = 5000;
const BATCH = 100;

interface MediaRetentionTarget {
  /** Label untuk log/ringkasan. */
  label: string;
  table: string;
  bucket: string;
  /** Kolom tanggal yang menentukan umur baris. */
  dateColumn: string;
  /** Kolom yang menyimpan path file di bucket. */
  pathColumn: string;
  /** Kolom penanda kapan file dibuang. */
  purgedColumn: string;
}

/**
 * `cake-order-attachments` sengaja TIDAK di sini: lampiran pesanan masih
 * dirujuk saat produksi/komplain, dan buckets-nya baru 67 MB. Ditinjau ulang
 * kalau sudah mendekati ratusan MB.
 */
export const MEDIA_RETENTION_TARGETS: MediaRetentionTarget[] = [
  {
    label: "cashflow-receipts",
    table: "cashflow_transactions",
    bucket: "cashflow-receipts",
    dateColumn: "transaction_date",
    pathColumn: "attachment_path",
    purgedColumn: "attachment_purged_at",
  },
  {
    label: "attendance-selfies",
    table: "attendance_logs",
    bucket: "attendance-selfies",
    dateColumn: "date",
    pathColumn: "selfie_path",
    purgedColumn: "selfie_purged_at",
  },
];

export interface MediaRetentionResult {
  label: string;
  cutoff: string;
  /** Baris kedaluwarsa yang masih memegang file saat sweep mulai. */
  found: number;
  /** File yang berhasil dihapus dari storage. */
  removed: number;
  /** Baris yang path-nya berhasil dikosongkan. */
  cleared: number;
  /** True kalau `found` menyentuh MAX_PER_RUN — masih ada sisa besok. */
  capped: boolean;
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

async function sweepTarget(
  t: MediaRetentionTarget,
  days: number,
  dryRun: boolean
): Promise<MediaRetentionResult> {
  const db = admin();
  const cutoff = cutoffDate(days);
  const result: MediaRetentionResult = {
    label: t.label,
    cutoff,
    found: 0,
    removed: 0,
    cleared: 0,
    capped: false,
  };

  const { data: rows, error } = await db
    .from(t.table)
    .select(`id, ${t.pathColumn}`)
    .lt(t.dateColumn, cutoff)
    .not(t.pathColumn, "is", null)
    .order(t.dateColumn, { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw new Error(`retensi ${t.label}: ${error.message}`);

  // Kolomnya dinamis per target, jadi supabase-js tidak bisa menurunkan tipe
  // baris dari string select-nya (parser-nya butuh literal). Dilebur ke bentuk
  // longgar di batas ini, lalu langsung dipersempit lagi di bawah.
  const raw = (rows ?? []) as unknown as Array<Record<string, unknown>>;
  const expired = raw
    .map((r) => ({
      id: r.id as string,
      path: (r[t.pathColumn] ?? null) as string | null,
    }))
    .filter((r): r is { id: string; path: string } => !!r.path);

  result.found = expired.length;
  result.capped = expired.length >= MAX_PER_RUN;
  if (expired.length === 0 || dryRun) return result;

  for (let i = 0; i < expired.length; i += BATCH) {
    const chunk = expired.slice(i, i + BATCH);

    // 1. Buang filenya.
    const { error: rmErr } = await db.storage
      .from(t.bucket)
      .remove(chunk.map((r) => r.path));
    // File yang sudah tidak ada bukan kegagalan — tetap lanjut mengosongkan
    // baris DB-nya supaya tidak diproses ulang tiap hari selamanya.
    if (!rmErr) result.removed += chunk.length;

    // 2. Lepas rujukannya, tandai kedaluwarsa (bukan "tidak pernah ada file").
    const { error: updErr } = await db
      .from(t.table)
      .update({
        [t.pathColumn]: null,
        [t.purgedColumn]: new Date().toISOString(),
      })
      .in(
        "id",
        chunk.map((r) => r.id)
      );
    if (!updErr) result.cleared += chunk.length;
  }

  return result;
}

/**
 * Sapu semua target. `dryRun` menghitung tanpa menghapus apa pun — dipakai
 * untuk mengecek dampak sebelum menyalakannya di cron.
 *
 * Satu target gagal tidak menggagalkan yang lain: errornya dicatat dan sweep
 * lanjut, supaya bucket kedua tetap tersapu kalau yang pertama bermasalah.
 */
export async function sweepMediaRetention(opts?: {
  days?: number;
  dryRun?: boolean;
}): Promise<MediaRetentionResult[]> {
  const days = opts?.days ?? MEDIA_RETENTION_DAYS;
  const dryRun = opts?.dryRun ?? false;
  const out: MediaRetentionResult[] = [];
  for (const t of MEDIA_RETENTION_TARGETS) {
    try {
      out.push(await sweepTarget(t, days, dryRun));
    } catch (e) {
      console.error("[sweepMediaRetention]", t.label, e);
    }
  }
  return out;
}
