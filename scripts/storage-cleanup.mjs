/**
 * Orphan-file cleanup untuk Supabase Storage.
 *
 * Menghitung file yang TIDAK direferensikan baris DB mana pun per bucket
 * (selfie absensi yang check-in-nya gagal/terhapus, upload form cake yang
 * ditinggal, dst) lalu menghapusnya lewat Storage API (bukan SQL langsung —
 * supaya objek S3 ikut terhapus).
 *
 * Pakai:
 *   node scripts/storage-cleanup.mjs            # dry-run (default, aman)
 *   node scripts/storage-cleanup.mjs --apply    # benar-benar hapus
 *
 * Env dibaca dari .env.local (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). Guard umur (minAgeHours) mencegah menghapus
 * file upload yang sedang in-flight.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const get = (k) => {
    const m = txt.match(new RegExp(`^${k}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
    return m?.[1]?.trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Env Supabase tidak ditemukan di .env.local");
  return { url, key };
}

const { url, key } = loadEnv();
const supabase = createClient(url, key);

/** Select satu kolom dari tabel dengan pagination 1000-an → Set nilai. */
async function refSet(table, columns) {
  const out = new Set();
  for (const col of columns) {
    let fromIdx = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select(col)
        .not(col, "is", null)
        .range(fromIdx, fromIdx + 999);
      if (error) throw new Error(`${table}.${col}: ${error.message}`);
      for (const r of data ?? []) {
        const v = r[col];
        if (v) out.add(v);
      }
      if (!data || data.length < 1000) break;
      fromIdx += 1000;
    }
  }
  return out;
}

/** Walk rekursif isi bucket (list() per-folder) → [{name, created_at, size}]. */
async function walkBucket(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const e of data ?? []) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) {
        // folder → recurse
        out.push(...(await walkBucket(bucket, full)));
      } else {
        out.push({
          name: full,
          created_at: e.created_at,
          size: e.metadata?.size ?? 0,
        });
      }
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const MB = (n) => (n / 1024 / 1024).toFixed(1) + " MB";

/** Konfigurasi per bucket: dari mana referensi path dibaca + guard umur. */
const BUCKETS = [
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
    bucket: "cashflow-receipts",
    refs: [["cashflow_transactions", ["attachment_path"]]],
    minAgeHours: 48,
  },
  {
    bucket: "cake-order-attachments",
    refs: [["cake_order_attachments", ["storage_path"]]],
    // Form cake bisa diisi berhari-hari? Tidak — tapi kasih 7 hari aman.
    minAgeHours: 7 * 24,
  },
  {
    bucket: "cleaning-photos",
    refs: [["cleaning_task_completions", ["photo_path"]]],
    minAgeHours: 48,
  },
  {
    bucket: "cleaning-refs",
    refs: [
      ["cleaning_checklist_items", ["reference_photo_path"]],
      ["cleaning_item_photos", ["reference_photo_path"]],
    ],
    minAgeHours: 48,
  },
  {
    bucket: "rekening-koran",
    refs: [["cashflow_statements", ["pdf_path"]]],
    minAgeHours: 48,
  },
];

let grandFiles = 0;
let grandBytes = 0;

for (const cfg of BUCKETS) {
  const referenced = new Set();
  for (const [table, cols] of cfg.refs) {
    for (const v of await refSet(table, cols)) referenced.add(v);
  }
  const objects = await walkBucket(cfg.bucket);
  const cutoff = Date.now() - cfg.minAgeHours * 3600 * 1000;
  const orphans = objects.filter(
    (o) => !referenced.has(o.name) && new Date(o.created_at).getTime() < cutoff
  );
  const bytes = orphans.reduce((s, o) => s + o.size, 0);
  grandFiles += orphans.length;
  grandBytes += bytes;
  console.log(
    `${cfg.bucket}: ${objects.length} files, ${orphans.length} orphan (${MB(bytes)})` +
      (orphans.length ? ` — contoh: ${orphans[0].name}` : "")
  );

  if (APPLY && orphans.length > 0) {
    let removed = 0;
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100).map((o) => o.name);
      const { error } = await supabase.storage.from(cfg.bucket).remove(batch);
      if (error) {
        console.error(`  REMOVE GAGAL (${cfg.bucket} batch ${i}): ${error.message}`);
      } else {
        removed += batch.length;
      }
    }
    console.log(`  → dihapus ${removed}/${orphans.length}`);
  }
}

console.log(
  `\nTOTAL orphan: ${grandFiles} files = ${MB(grandBytes)} ${APPLY ? "(DIHAPUS)" : "(dry-run — jalankan dengan --apply untuk menghapus)"}`
);
