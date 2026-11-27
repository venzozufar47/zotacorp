import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_TABLES,
  DUMP_ROW_CAP,
  TABLE_PRIMARY_KEYS,
  type BackupCategory,
  type CategoryBundle,
} from "./categories";

/**
 * Dump satu kategori jadi `CategoryBundle`. Service-role client wajib
 * (bypass RLS supaya semua row terbaca tanpa peduli policy).
 */
export async function dumpCategory(
  admin: SupabaseClient,
  category: BackupCategory
): Promise<{
  bundle: CategoryBundle;
  counts: Record<string, number>;
  truncated: boolean;
}> {
  const tables = CATEGORY_TABLES[category];
  const bundle: CategoryBundle = {
    category,
    tables: {},
  };
  const counts: Record<string, number> = {};

  // Gagal keras: backup yang kurang baris lebih berbahaya daripada backup yang tercatat gagal.
  for (const table of tables) {
    let query = admin.from(table as never).select("*", { count: "exact" });
    for (const col of [TABLE_PRIMARY_KEYS[table] ?? "id"].flat()) query = query.order(col);
    const { data, count, error } = await query.limit(DUMP_ROW_CAP);
    if (error) throw new Error(`Backup tabel ${table}: ${error.message}`);
    const rows = data ?? [];
    if (count === null || rows.length < count) {
      throw new Error(`Backup tabel ${table} tidak lengkap: ${rows.length} dari ${count ?? "?"} baris`);
    }
    bundle.tables[table] = rows as unknown[];
    counts[table] = rows.length;
  }
  return { bundle, counts, truncated: false };
}
