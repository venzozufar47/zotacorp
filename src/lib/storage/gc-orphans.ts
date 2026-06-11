/**
 * GC harian file storage yatim (orphan) — dipanggil dari cron
 * `/api/cron/backup-database` (jadwal harian; batas Vercel Hobby).
 *
 * Sumber orphan yang berulang:
 *   - attendance-selfies : selfie ter-upload tapi check-in/break gagal
 *     validasi server (klien sudah best-effort menghapus, ini lapis kedua),
 *     atau log dihapus oleh versi lama yang tidak membersihkan storage.
 *   - late-proofs        : bukti telat yang log-nya hilang.
 *   - cleaning-photos    : foto checklist yang penyimpanannya gagal.
 *   - cake-order-attachments (pending/) : upload form pesanan yang ditinggal.
 *
 * Definisi orphan: object TIDAK direferensikan baris DB mana pun DAN lebih
 * tua dari guard umur (hindari menghapus upload in-flight). Penghapusan via
 * Storage API service-role (bukan SQL) supaya objek fisik ikut terhapus.
 */

import { createClient } from "@supabase/supabase-js";

interface GcResult {
  bucket: string;
  scanned: number;
  removed: number;
  bytes: number;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
type Admin = ReturnType<typeof admin>;

async function refSet(
  db: Admin,
  table: string,
  columns: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const col of columns) {
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from(table)
        .select(col)
        .not(col, "is", null)
        .range(from, from + 999);
      if (error) throw new Error(`${table}.${col}: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, string | null>[];
      for (const r of rows) {
        const v = r[col];
        if (v) out.add(v);
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  return out;
}

interface WalkEntry {
  name: string;
  created_at: string;
  size: number;
}

async function walkBucket(
  db: Admin,
  bucket: string,
  prefix = ""
): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const e of data ?? []) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) {
        out.push(...(await walkBucket(db, bucket, full)));
      } else {
        out.push({
          name: full,
          // created_at null (tak terduga) → perlakukan sebagai "baru"
          // supaya tidak pernah terhapus oleh guard umur.
          created_at: e.created_at ?? new Date().toISOString(),
          size: (e.metadata as { size?: number } | null)?.size ?? 0,
        });
      }
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const TARGETS: Array<{
  bucket: string;
  refs: Array<[table: string, columns: string[]]>;
  minAgeHours: number;
}> = [
  {
    bucket: "attendance-selfies",
    refs: [
      ["attendance_logs", ["selfie_path"]],
      ["attendance_break_logs", ["break_in_selfie_path", "break_out_selfie_path"]],
    ],
    minAgeHours: 48,
  },
  {
    bucket: "late-proofs",
    refs: [["attendance_logs", ["late_proof_url"]]],
    minAgeHours: 48,
  },
  {
    bucket: "cleaning-photos",
    refs: [["cleaning_task_completions", ["photo_path"]]],
    minAgeHours: 48,
  },
  {
    bucket: "cake-order-attachments",
    refs: [["cake_order_attachments", ["storage_path"]]],
    minAgeHours: 7 * 24,
  },
];

/** Jalankan GC semua target. Error per-bucket ditelan (fire-and-forget). */
export async function gcOrphanStorage(): Promise<GcResult[]> {
  const db = admin();
  const results: GcResult[] = [];
  for (const t of TARGETS) {
    try {
      const referenced = new Set<string>();
      for (const [table, cols] of t.refs) {
        for (const v of await refSet(db, table, cols)) referenced.add(v);
      }
      const objects = await walkBucket(db, t.bucket);
      const cutoff = Date.now() - t.minAgeHours * 3600 * 1000;
      const orphans = objects.filter(
        (o) =>
          !referenced.has(o.name) && new Date(o.created_at).getTime() < cutoff
      );
      let removed = 0;
      for (let i = 0; i < orphans.length; i += 100) {
        const batch = orphans.slice(i, i + 100).map((o) => o.name);
        const { error } = await db.storage.from(t.bucket).remove(batch);
        if (!error) removed += batch.length;
      }
      results.push({
        bucket: t.bucket,
        scanned: objects.length,
        removed,
        bytes: orphans.reduce((s, o) => s + o.size, 0),
      });
    } catch (err) {
      console.error(`[storage-gc] ${t.bucket} gagal`, err);
      results.push({ bucket: t.bucket, scanned: 0, removed: 0, bytes: 0 });
    }
  }
  return results;
}
