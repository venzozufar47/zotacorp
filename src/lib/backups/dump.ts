import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_TABLES,
  DUMP_ROW_CAP,
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
  let truncated = false;

  for (const table of tables) {
    const { data, error } = await admin
      .from(table as never)
      .select("*")
      .limit(DUMP_ROW_CAP);
    if (error) {
      bundle.tables[table] = [];
      counts[table] = 0;
      continue;
    }
    const rows = data ?? [];
    bundle.tables[table] = rows as unknown[];
    counts[table] = rows.length;
    if (rows.length >= DUMP_ROW_CAP) truncated = true;
  }
  return { bundle, counts, truncated };
}
