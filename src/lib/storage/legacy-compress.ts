/**
 * Kompresi bertahap foto LAMA yang belum terkompres (dipanggil dari cron harian `/api/cron/backup-database`).
 *
 * Foto baru sudah dikompres di browser (`compressImageFile`); sisa berkas lama dari sebelum itu masih besar
 * (mis. lampiran tiket rata-rata 1,7 MB, nota lama ±390 KB). Sweeper ini mengunduh, mengecilkan (JPEG, sisi terpanjang
 * 1280 px, kualitas 70 — parameter yang sama dengan unggahan baru, sudah diuji terbaca untuk nota), lalu menimpa
 * berkas di PATH YANG SAMA, jadi rujukan di database tidak berubah.
 *
 * Egress dijaga ketat: tiap eksekusi dibatasi MAX_DOWNLOAD_BYTES dan MAX_MS. Berkas yang tidak mengecil cukup
 * dicatat di `storage_compress_skips` supaya tidak diunduh lagi. Berkas yang berhasil mengecil keluar sendiri dari
 * daftar kandidat (ukurannya di bawah ambang). Daftar kandidat dibaca dari metadata, tanpa mengunduh.
 *
 * Tidak menyentuh PDF, WebP (sudah terkompres), cadangan database, maupun bucket yang disapu retensi.
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { recompressJpeg, type CompressOutcome } from "./recompress-jpeg";

/** Bucket yang diproses, berurutan; ukuran terbesar lebih dulu di dalam bucket. */
export const LEGACY_COMPRESS_BUCKETS = [
  "ticket-attachments",
  "cashflow-receipts",
  "cash-receipts",
  "late-proofs",
  "cleaning-refs",
  "booth-photos",
  "cash-closing-photos",
  "sim-topup-proofs",
] as const;

/** Hanya berkas lebih besar dari ini yang diproses. */
export const MIN_SIZE_BYTES = 200_000;
/** Batas unduhan per eksekusi cron (egress). */
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
/** Batas waktu per eksekusi cron, supaya tidak mengambil jatah cadangan database. */
export const MAX_MS = 60_000;
export interface LegacyCompressResult {
  bucket: string;
  /** Berkas yang diperkecil. */
  compressed: number;
  /** Berkas yang dicoba tapi tidak mengecil / tidak bisa diproses (dicatat, tidak diulang). */
  skipped: number;
  bytesBefore: number;
  bytesAfter: number;
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function sweepLegacyCompress(opts?: {
  maxDownloadBytes?: number;
  maxMs?: number;
  dryRun?: boolean;
}): Promise<{ results: LegacyCompressResult[]; downloaded: number; stoppedBy: "done" | "bytes" | "time" }> {
  const db = admin();
  const maxBytes = opts?.maxDownloadBytes ?? MAX_DOWNLOAD_BYTES;
  const maxMs = opts?.maxMs ?? MAX_MS;
  const started = Date.now();
  let downloaded = 0;
  let stoppedBy: "done" | "bytes" | "time" = "done";
  const results: LegacyCompressResult[] = [];

  outer: for (const bucket of LEGACY_COMPRESS_BUCKETS) {
    const res: LegacyCompressResult = { bucket, compressed: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0 };
    const { data, error } = await db.rpc("legacy_big_images" as never, { p_bucket: bucket, p_min_size: MIN_SIZE_BYTES, p_limit: 200 } as never);
    if (error) throw new Error(`kompres lama ${bucket}: ${error.message}`);
    const candidates = (data ?? []) as unknown as { name: string; size: number | string }[];

    for (const c of candidates) {
      const size = Number(c.size);
      if (downloaded + size > maxBytes) {
        stoppedBy = "bytes";
        results.push(res);
        break outer;
      }
      if (Date.now() - started > maxMs) {
        stoppedBy = "time";
        results.push(res);
        break outer;
      }
      if (opts?.dryRun) {
        res.bytesBefore += size;
        res.compressed += 1;
        continue;
      }

      const dl = await db.storage.from(bucket).download(c.name);
      // Gagal unduh = sementara: jangan dicatat, coba lagi malam berikutnya.
      if (dl.error || !dl.data) continue;
      const original = Buffer.from(await dl.data.arrayBuffer());
      downloaded += original.length;

      let out: CompressOutcome | null = null;
      try {
        out = await recompressJpeg(original);
      } catch (e) {
        await db.from("storage_compress_skips" as never).upsert({ bucket, path: c.name, reason: `decode: ${e instanceof Error ? e.message : "gagal"}`.slice(0, 200) } as never);
        res.skipped += 1;
        continue;
      }
      if (!out.worthIt) {
        await db.from("storage_compress_skips" as never).upsert({ bucket, path: c.name, reason: `tidak mengecil (${original.length}→${out.buffer.length})` } as never);
        res.skipped += 1;
        continue;
      }
      const up = await db.storage.from(bucket).upload(c.name, out.buffer, { contentType: "image/jpeg", upsert: true });
      if (up.error) continue; // sementara; asli tetap utuh
      res.compressed += 1;
      res.bytesBefore += original.length;
      res.bytesAfter += out.buffer.length;
    }
    results.push(res);
  }
  return { results, downloaded, stoppedBy };
}
