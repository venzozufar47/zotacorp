import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_TABLES,
  GENERATED_COLUMNS,
  SHARED_TABLES,
  TABLE_PRIMARY_KEYS,
  type BackupCategory,
  type CategoryBundle,
} from "./categories";

export type RestoreMode = "merge" | "replace";

export interface RestoreReport {
  category: BackupCategory;
  perTable: Array<{
    table: string;
    inserted: number;
    skipped: number;
    error?: string;
  }>;
}

/** Baris per permintaan tulis, supaya tabel besar tidak menabrak batas ukuran/waktu. */
const WRITE_CHUNK = 1000;

/**
 * Restore satu kategori dari bundle JSON. Mode 'merge' upsert by PK,
 * 'replace' truncate kategori dulu (delete reverse FK order) lalu
 * insert ulang (forward FK order).
 *
 * Untuk tabel di `SHARED_TABLES` (mis. `profiles`), mode replace
 * di-downgrade jadi merge supaya referensi domain lain tidak hilang.
 */
export async function restoreCategory(
  admin: SupabaseClient,
  bundle: CategoryBundle,
  mode: RestoreMode
): Promise<RestoreReport> {
  const tables = CATEGORY_TABLES[bundle.category];
  const report: RestoreReport = { category: bundle.category, perTable: [] };

  if (mode === "replace") {
    for (const table of [...tables].reverse()) {
      if (SHARED_TABLES.has(table)) continue;
      const pk = TABLE_PRIMARY_KEYS[table] ?? "id";
      const filterCol = Array.isArray(pk) ? pk[0] : pk;
      const { error } = await admin
        .from(table as never)
        .delete()
        .not(filterCol as never, "is", null as never);
      if (error) {
        report.perTable.push({
          table,
          inserted: 0,
          skipped: 0,
          error: error.message,
        });
      }
    }
  }

  for (const table of tables) {
    const generated = GENERATED_COLUMNS[table] ?? [];
    const rows = (bundle.tables[table] ?? []).map((row) =>
      generated.length === 0
        ? row
        : Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([k]) => !generated.includes(k)))
    );
    if (rows.length === 0) {
      report.perTable.push({ table, inserted: 0, skipped: 0 });
      continue;
    }
    const effectiveMode: RestoreMode =
      mode === "replace" && SHARED_TABLES.has(table) ? "merge" : mode;

    const pk = TABLE_PRIMARY_KEYS[table] ?? "id";
    const onConflict = Array.isArray(pk) ? pk.join(",") : pk;
    let inserted = 0;
    let failure: string | undefined;
    let done = 0;
    for (; done < rows.length; done += WRITE_CHUNK) {
      const chunk = rows.slice(done, done + WRITE_CHUNK);
      const query = admin.from(table as never);
      const { error, count } =
        effectiveMode === "merge"
          ? await query.upsert(chunk as never, { onConflict, count: "exact" })
          : await query.insert(chunk as never, { count: "exact" });
      if (error) {
        failure = error.message;
        break;
      }
      inserted += count ?? chunk.length;
    }
    report.perTable.push({
      table,
      inserted,
      skipped: failure ? rows.length - done : 0,
      ...(failure ? { error: failure } : {}),
    });
  }

  return report;
}
