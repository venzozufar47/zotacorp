import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_TABLES,
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
    const rows = bundle.tables[table] ?? [];
    if (rows.length === 0) {
      report.perTable.push({ table, inserted: 0, skipped: 0 });
      continue;
    }
    const effectiveMode: RestoreMode =
      mode === "replace" && SHARED_TABLES.has(table) ? "merge" : mode;

    if (effectiveMode === "merge") {
      const pk = TABLE_PRIMARY_KEYS[table] ?? "id";
      const onConflict = Array.isArray(pk) ? pk.join(",") : pk;
      const { error, count } = await admin
        .from(table as never)
        .upsert(rows as never, { onConflict, count: "exact" });
      if (error) {
        report.perTable.push({
          table,
          inserted: 0,
          skipped: rows.length,
          error: error.message,
        });
        continue;
      }
      report.perTable.push({
        table,
        inserted: count ?? rows.length,
        skipped: 0,
      });
    } else {
      const { error, count } = await admin
        .from(table as never)
        .insert(rows as never, { count: "exact" });
      if (error) {
        report.perTable.push({
          table,
          inserted: 0,
          skipped: rows.length,
          error: error.message,
        });
        continue;
      }
      report.perTable.push({
        table,
        inserted: count ?? rows.length,
        skipped: 0,
      });
    }
  }

  return report;
}
