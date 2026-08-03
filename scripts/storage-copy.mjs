/**
 * Salin seluruh isi Supabase Storage dari satu project ke project lain.
 * Dipakai untuk migrasi region Seoul -> Singapore, karena TIDAK ADA fitur
 * bawaan Supabase yang memindahkan storage: `pg_dump` cuma membawa metadata
 * di tabel storage.objects, filenya sendiri ada di S3 dan harus diunduh
 * lalu diunggah ulang satu per satu.
 *
 * Sifatnya IDEMPOTEN dan RESUMABLE — ini syarat mutlak, bukan kemewahan:
 *   - Daftar isi bucket tujuan dibaca sekali di awal, lalu file yang sudah
 *     ada dengan UKURAN SAMA dilewati. Jadi menjalankan ulang setelah
 *     koneksi putus akan melanjutkan, bukan mengulang dari nol.
 *   - Karena itu pula script ini dipakai dua kali: sekali untuk menyalin
 *     borongan sebelum cutover, sekali lagi saat cutover untuk menyapu
 *     file yang masuk di sela-selanya (delta sync).
 *
 * Path file TIDAK diubah, sehingga semua referensi di DB (attachment_path,
 * selfie_path, photo_path, dst) tetap valid tanpa migrasi data apa pun.
 *
 * Pakai:
 *   node scripts/storage-copy.mjs            # dry-run: hitung yang perlu disalin
 *   node scripts/storage-copy.mjs --apply    # salin sungguhan
 *   node scripts/storage-copy.mjs --apply --bucket=cashflow-receipts
 *
 * Env (lihat .env.local dan .env.migration):
 *   sumber : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   tujuan : NEW_SUPABASE_URL         + NEW_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const bucketArg = process.argv.find((a) => a.startsWith("--bucket="));
const ONLY_BUCKET = bucketArg ? bucketArg.split("=")[1] : null;
/** Berapa file diproses berbarengan. Jangan besar-besar: tiap file =
 *  1 unduh + 1 unggah lintas region, dan Storage gampang balas 5xx. */
const CONCURRENCY = 6;

function readEnvFile(path) {
  let txt;
  try {
    txt = readFileSync(new URL(path, import.meta.url), "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const local = readEnvFile("../.env.local");
const mig = readEnvFile("../.env.migration");

const SRC_URL = local.NEXT_PUBLIC_SUPABASE_URL;
const SRC_KEY = local.SUPABASE_SERVICE_ROLE_KEY;
const DST_URL = mig.NEW_SUPABASE_URL;
const DST_KEY = mig.NEW_SERVICE_ROLE_KEY;

const missing = [
  !SRC_URL && "NEXT_PUBLIC_SUPABASE_URL (.env.local)",
  !SRC_KEY && "SUPABASE_SERVICE_ROLE_KEY (.env.local)",
  !DST_URL && "NEW_SUPABASE_URL (.env.migration)",
  !DST_KEY && "NEW_SERVICE_ROLE_KEY (.env.migration)",
].filter(Boolean);
if (missing.length) {
  console.error("Env belum lengkap:\n  - " + missing.join("\n  - "));
  process.exit(1);
}

const src = createClient(SRC_URL, SRC_KEY);
const dst = createClient(DST_URL, DST_KEY);

const MB = (n) => (n / 1024 / 1024).toFixed(1) + " MB";

/** Telusuri bucket secara rekursif — Storage list() hanya satu level. */
async function walk(client, bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const e of data ?? []) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      // id === null menandakan "folder", bukan objek.
      if (e.id === null) out.push(...(await walk(client, bucket, full)));
      else out.push({ name: full, size: e.metadata?.size ?? 0 });
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function copyOne(bucket, obj) {
  const { data: blob, error: dlErr } = await src.storage
    .from(bucket)
    .download(obj.name);
  if (dlErr || !blob) throw new Error(`unduh: ${dlErr?.message ?? "kosong"}`);
  const buf = Buffer.from(await blob.arrayBuffer());
  const { error: upErr } = await dst.storage
    .from(bucket)
    .upload(obj.name, buf, {
      contentType: blob.type || "application/octet-stream",
      upsert: true,
    });
  if (upErr) throw new Error(`unggah: ${upErr.message}`);
  return buf.length;
}

const { data: buckets, error: bErr } = await src.storage.listBuckets();
if (bErr) {
  console.error("Gagal membaca daftar bucket sumber:", bErr.message);
  process.exit(1);
}

let grandCopied = 0;
let grandSkipped = 0;
let grandBytes = 0;
const failures = [];

for (const b of buckets) {
  if (ONLY_BUCKET && b.id !== ONLY_BUCKET) continue;

  const srcObjs = await walk(src, b.id);
  // Daftar tujuan dibaca SEKALI lalu dijadikan peta — jauh lebih murah
  // daripada mengecek keberadaan file satu per satu lewat jaringan.
  let dstMap = new Map();
  try {
    for (const o of await walk(dst, b.id)) dstMap.set(o.name, o.size);
  } catch (e) {
    console.error(`  ! bucket ${b.id} belum ada di tujuan: ${e.message}`);
  }

  const todo = srcObjs.filter((o) => dstMap.get(o.name) !== o.size);
  const bytes = todo.reduce((s, o) => s + o.size, 0);
  const skipped = srcObjs.length - todo.length;
  grandSkipped += skipped;

  console.log(
    `${b.id}: ${srcObjs.length} file di sumber · ${skipped} sudah sama · ${todo.length} perlu disalin (${MB(bytes)})`
  );
  if (!APPLY || todo.length === 0) {
    grandBytes += bytes;
    continue;
  }

  let done = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const chunk = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((o) => copyOne(b.id, o))
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        done += 1;
        grandCopied += 1;
        grandBytes += r.value;
      } else {
        failures.push(`${b.id}/${chunk[idx].name}: ${r.reason.message}`);
      }
    });
    if (done % 200 < CONCURRENCY && done > 0) {
      console.log(`  …${done}/${todo.length} (${MB(grandBytes)})`);
    }
  }
  console.log(`  selesai ${b.id}: ${done}/${todo.length}`);
}

if (APPLY) {
  console.log(
    `\nSELESAI: ${grandCopied} disalin (${MB(grandBytes)}), ${grandSkipped} dilewati (sudah sama), ${failures.length} gagal`
  );
  if (failures.length) {
    // Kegagalan tidak fatal — 5xx dari Storage itu lumrah. Yang penting
    // ketahuan, dan jalankan ulang script ini untuk menyapu sisanya.
    console.log("\nGagal (jalankan ulang script untuk mencoba lagi):");
    for (const f of failures.slice(0, 20)) console.log("  - " + f);
    if (failures.length > 20) console.log(`  … dan ${failures.length - 20} lainnya`);
    process.exitCode = 1;
  }
} else {
  console.log(
    `\nDRY-RUN: ${grandSkipped} file sudah sama, total ${MB(grandBytes)} perlu disalin. Jalankan dengan --apply.`
  );
}
