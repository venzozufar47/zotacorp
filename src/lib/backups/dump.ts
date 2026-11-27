import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_TABLES,
  DUMP_ROW_CAP,
  DYNAMIC_CATEGORIES,
  TABLE_PRIMARY_KEYS,
  type BackupCategory,
  type CategoryBundle,
} from "./categories";
import { planDynamicTables, type CatalogRow } from "./dynamic";

/**
 * Dump satu kategori jadi `CategoryBundle`. Service-role client wajib
 * (bypass RLS supaya semua row terbaca tanpa peduli policy).
 */
export async function dumpCategory(
  admin: SupabaseClient,
  category: BackupCategory,
  catalog: CatalogRow[]
): Promise<{
  bundle: CategoryBundle;
  counts: Record<string, number>;
  truncated: boolean;
}> {
  const schema = DYNAMIC_CATEGORIES[category];
  const covered = new Set(schema === "public" ? Object.values(CATEGORY_TABLES).flat() : []);
  const planned = schema ? planDynamicTables(catalog, schema, covered) : [];
  const tables = schema ? planned.map((t) => t.table_name) : CATEGORY_TABLES[category];
  const keys = new Map(planned.map((t) => [t.table_name, t.pk_columns]));
  const db = schema === "yeobo" ? (admin.schema("yeobo") as unknown as SupabaseClient) : admin;
  const bundle: CategoryBundle = {
    category,
    tables: {},
    ...(schema
      ? {
          primaryKeys: Object.fromEntries(keys),
          generatedColumns: Object.fromEntries(planned.map((t) => [t.table_name, t.generated_columns])),
        }
      : {}),
  };
  const counts: Record<string, number> = {};

  // Gagal keras: backup yang kurang baris lebih berbahaya daripada backup yang tercatat gagal.
  for (const table of tables) {
    const pk = schema ? keys.get(table)! : [TABLE_PRIMARY_KEYS[table] ?? "id"].flat();
    let query = db.from(table as never).select("*", { count: "exact" });
    for (const col of pk) query = query.order(col);
    const { data, count, error } = await query.limit(DUMP_ROW_CAP);
    if (error) throw new Error(`Backup tabel ${table}: ${error.message}`);
    const rows = data ?? [];
    // Tanpa primary key, halaman bisa tumpang tindih walau jumlahnya cocok.
    if (pk.length === 0 && rows.length > 1000) {
      throw new Error(`Backup tabel ${table}: butuh primary key untuk lebih dari 1.000 baris`);
    }
    if (count === null || rows.length < count) {
      throw new Error(`Backup tabel ${table} tidak lengkap: ${rows.length} dari ${count ?? "?"} baris`);
    }
    bundle.tables[table] = rows as unknown[];
    counts[table] = rows.length;
  }
  return { bundle, counts, truncated: false };
}
