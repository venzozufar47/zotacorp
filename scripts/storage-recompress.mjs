/**
 * One-time recompress file storage yang kegedean (Supabase 1GB Free plan).
 *
 * Target:
 *   - cashflow-receipts : foto bukti yang di-upload SEBELUM kompresi client
 *     diberlakukan (banyak file 0.5–2 MB) → resize longest-edge 1600px, JPEG q70.
 *   - attendance-selfies: selfie lama 800px q0.8 → re-encode q68 (resolusi tetap).
 *
 * Aturan aman:
 *   - Hanya file ber-ekstensi gambar (jpg/jpeg/png/webp) — PDF dilewati.
 *   - Hanya overwrite bila hasil ≤ 80% ukuran asli (kalau tidak, biarkan).
 *   - upsert dengan contentType image/jpeg; path TIDAK berubah sehingga semua
 *     referensi DB tetap valid.
 *
 * Pakai:
 *   node scripts/storage-recompress.mjs                      # dry-run
 *   node scripts/storage-recompress.mjs --apply              # recompress semua
 *   node scripts/storage-recompress.mjs --apply --max-mb=800 # jatah per run
 *
 * Catatan egress: dry-run TIDAK mendownload (estimasi dari ukuran); apply
 * mendownload tiap file target sekali. Backlog awal ±2,5 GB — pakai
 * `--max-mb` untuk memecahnya jadi beberapa hari supaya egress harian tetap
 * kecil. Budget dihitung dari ukuran ASAL file yang diproses, dan berlaku
 * lintas bucket (bukan per bucket).
 *
 * Bisa dijalankan berulang dengan aman. File hasil kompresi mendarat jauh di
 * bawah `minBytes` (±250 KB pada kasus terburuk untuk ambang 300 KB), jadi
 * run berikutnya tidak melihatnya lagi sebagai kandidat — sisa pekerjaanlah
 * yang otomatis dikerjakan. Karena itu `minBytes` JANGAN diturunkan mendekati
 * ukuran hasil: pita 150–300 KB cuma 9,7 MB di seluruh bucket, tapi
 * menurunkan ambang ke sana membuat tiap run mengunduh ulang file yang sudah
 * dikompres.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const maxMbArg = process.argv.find((a) => a.startsWith("--max-mb="));
const BUDGET_BYTES = maxMbArg
  ? Number(maxMbArg.split("=")[1]) * 1024 * 1024
  : Infinity;
if (Number.isNaN(BUDGET_BYTES)) {
  console.error("--max-mb harus angka, mis. --max-mb=800");
  process.exit(1);
}

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

const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const MB = (n) => (n / 1024 / 1024).toFixed(1) + " MB";

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
      if (e.id === null) out.push(...(await walkBucket(bucket, full)));
      else out.push({ name: full, size: e.metadata?.size ?? 0 });
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

/** Konfigurasi target per bucket. */
const TARGETS = [
  { bucket: "cashflow-receipts", minBytes: 300_000, maxDim: 1600, quality: 70 },
  { bucket: "attendance-selfies", minBytes: 120_000, maxDim: 800, quality: 68 },
];

let totalBefore = 0;
let totalAfter = 0;
let totalDone = 0;
let totalSkipped = 0;
let totalFailed = 0;
/** Byte ASAL yang sudah diproses run ini — dibandingkan ke BUDGET_BYTES. */
let budgetUsed = 0;
let budgetHit = false;

for (const t of TARGETS) {
  if (budgetHit) break;
  const objects = (await walkBucket(t.bucket))
    .filter((o) => o.size >= t.minBytes && IMG_EXT.test(o.name))
    // Terbesar dulu: kalau budget habis di tengah jalan, yang sudah
    // terkerjakan adalah yang paling banyak membebaskan ruang.
    .sort((a, b) => b.size - a.size);
  const bytes = objects.reduce((s, o) => s + o.size, 0);
  console.log(
    `${t.bucket}: ${objects.length} kandidat ≥${Math.round(t.minBytes / 1000)}KB = ${MB(bytes)}`
  );
  if (!APPLY) {
    totalBefore += bytes;
    continue;
  }

  for (const o of objects) {
    if (budgetUsed + o.size > BUDGET_BYTES) {
      budgetHit = true;
      break;
    }
    budgetUsed += o.size;
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(t.bucket)
        .download(o.name);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "download kosong");
      const input = Buffer.from(await blob.arrayBuffer());
      const out = await sharp(input)
        .rotate() // hormati EXIF orientation sebelum strip metadata
        .resize({
          width: t.maxDim,
          height: t.maxDim,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: t.quality, mozjpeg: true })
        .toBuffer();

      if (out.length > o.size * 0.8) {
        totalSkipped += 1; // tidak cukup hemat — biarkan asli
        continue;
      }
      const { error: upErr } = await supabase.storage
        .from(t.bucket)
        .upload(o.name, out, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(upErr.message);
      totalBefore += o.size;
      totalAfter += out.length;
      totalDone += 1;
      if (totalDone % 100 === 0) {
        console.log(
          `  …${totalDone} files: ${MB(totalBefore)} → ${MB(totalAfter)}`
        );
      }
    } catch (e) {
      totalFailed += 1;
      console.error(`  GAGAL ${t.bucket}/${o.name}: ${e.message}`);
    }
  }
}

if (APPLY) {
  console.log(
    `\nSELESAI: ${totalDone} dikompres ${MB(totalBefore)} → ${MB(totalAfter)} (hemat ${MB(totalBefore - totalAfter)}), ${totalSkipped} dilewati (hemat <20%), ${totalFailed} gagal`
  );
  // Jangan pernah diam-diam berhenti di tengah: kalau budget yang memotong,
  // katakan — supaya "selesai" tidak salah dibaca sebagai "semua beres".
  if (budgetHit) {
    console.log(
      `Budget ${MB(BUDGET_BYTES)} habis — MASIH ADA SISA. Jalankan lagi besok dengan perintah yang sama untuk melanjutkan.`
    );
  }
} else {
  console.log(
    `\nDRY-RUN: total kandidat ${MB(totalBefore)} — estimasi hasil ±30–40% dari itu. Jalankan dengan --apply.`
  );
  if (BUDGET_BYTES !== Infinity) {
    console.log(
      `Dengan --max-mb, tiap run memproses ±${MB(BUDGET_BYTES)} → perlu ±${Math.ceil(totalBefore / BUDGET_BYTES)} run.`
    );
  }
}
