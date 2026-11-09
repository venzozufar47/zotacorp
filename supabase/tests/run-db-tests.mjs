// Jalankan tes guard migrasi 323/324 di Postgres LOKAL (PGlite: Postgres asli
// dikompilasi ke WASM, berjalan di proses Node — tanpa Docker, tanpa
// menyentuh produksi). Skema awal = snapshot produksi
// (env/baseline_prod_2026-11-09.sql).
//
// Pakai:
//   npm i --prefix <folder-sementara> @electric-sql/pglite@0.3.16
//   PGLITE_MODULE=<folder-sementara>/node_modules/@electric-sql/pglite/dist/index.js \
//     node supabase/tests/run-db-tests.mjs
//
// Tahap:
//   A  baseline + 323                  → state_machine_guards.test.sql
//   B  baseline + 323 + 324            → profile_attendance_guards.test.sql
//   C  B + rollback 324                → state_machine_guards.test.sql (323 utuh lagi)
//   D  C + rollback 323                → katalog identik dengan baseline
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const modPath = process.env.PGLITE_MODULE;
if (!modPath) {
  console.error("Set PGLITE_MODULE ke path dist/index.js @electric-sql/pglite (lihat komentar di atas).");
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(resolve(modPath)).href);

const BASE = "supabase/tests/env/baseline_prod_2026-11-09.sql";
const SEED = "supabase/tests/env/seed.sql";
const M323 = "supabase/migrations/323_state_machine_guards.sql";
const M324 = "supabase/migrations/324_profile_attendance_write_guards.sql";
const D324 = "supabase/rollback/324_profile_attendance_write_guards.down.sql";
const D323 = "supabase/rollback/323_state_machine_guards.down.sql";
const T323 = "supabase/tests/state_machine_guards.test.sql";
const TALL = "supabase/tests/profile_attendance_guards.test.sql";

const FINGERPRINT = `
select string_agg(x, ' | ' order by x) as fp from (
  select 'pol:' || tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') as x
    from pg_policies where schemaname = 'public'
  union all
  select 'trg:' || tgrelid::regclass || ':' || tgname from pg_trigger where not tgisinternal
  union all
  select 'fn:' || proname from pg_proc where pronamespace = 'public'::regnamespace
) s`;

async function fresh(files) {
  const db = new PGlite();
  for (const f of files) {
    try {
      await db.exec(read(f));
    } catch (e) {
      throw new Error(`gagal memuat ${f}: ${e.message}`);
    }
  }
  return db;
}

async function runTest(db, file) {
  const results = await db.exec(read(file));
  const ok = results.flatMap((r) => r.rows ?? []).find((row) => typeof row.result === "string");
  if (!ok) throw new Error(`${file}: tidak ada baris OK`);
  return ok.result;
}

const stages = [
  ["A  323 saja", [BASE, SEED, M323], T323],
  ["B  323 + 324", [BASE, SEED, M323, M324], TALL],
  ["C  rollback 324", [BASE, SEED, M323, M324, D324], T323],
];

let failed = 0;
for (const [name, files, test] of stages) {
  try {
    const db = await fresh(files);
    console.log(`✔ ${name}: ${await runTest(db, test)}`);
    await db.close();
  } catch (e) {
    failed++;
    console.error(`✖ ${name}: ${e.message}`);
  }
}

try {
  const base = await fresh([BASE, SEED]);
  const fpBase = (await base.query(FINGERPRINT)).rows[0].fp;
  await base.close();
  const rolled = await fresh([BASE, SEED, M323, M324, D324, D323]);
  const fpRolled = (await rolled.query(FINGERPRINT)).rows[0].fp;
  await rolled.close();
  if (fpBase !== fpRolled) throw new Error("katalog setelah rollback penuh BERBEDA dari baseline");
  console.log("✔ D  rollback 323+324: policy/trigger/fungsi identik dengan baseline produksi");
} catch (e) {
  failed++;
  console.error(`✖ D  rollback penuh: ${e.message}`);
}

try {
  // Migrasi aman dijalankan ulang (mis. deploy terputus lalu diulang).
  const db = await fresh([BASE, SEED, M323, M324, M324]);
  console.log(`✔ E  324 diterapkan dua kali: ${await runTest(db, TALL)}`);
  await db.close();
} catch (e) {
  failed++;
  console.error(`✖ E  idempoten: ${e.message}`);
}

process.exit(failed ? 1 : 0);
