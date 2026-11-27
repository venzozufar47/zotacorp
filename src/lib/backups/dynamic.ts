/**
 * Kategori backup dinamis: semua tabel yang tidak terdaftar di kategori tetap ikut otomatis, sehingga tabel dari
 * fitur baru tidak perlu didaftarkan. Yang dikecualikan hanya data sementara dan rahasia.
 */

export interface CatalogRow {
  schema_name: string;
  table_name: string;
  pk_columns: string[];
  generated_columns: string[];
  /** Induk foreign key, berbentuk "skema.tabel". */
  parents: string[];
}

/** Data sementara (log, antrean, cache, OTP) dan rahasia yang sengaja tidak masuk berkas unduhan. */
export const EXCLUDED_TABLES = new Set([
  "public.backup_runs",
  "public.push_send_logs",
  "public.push_subscriptions",
  "public.password_reset_requests",
  "public.attendance_checkout_push_checks",
  "public.storage_compress_skips",
  "yeobo.notifications_queue",
  "yeobo.rate_limits",
  "yeobo.otp_codes",
  "yeobo.location_pings",
  "yeobo.wa_send_slots",
  "yeobo.branch_secrets",
]);

/** Salinan darurat yang dibuat saat perbaikan data. */
const EXCLUDED_PREFIXES = ["public.zz_backup_", "public.backup_tiktok_viewers_"];

export function isExcluded(qualified: string): boolean {
  return EXCLUDED_TABLES.has(qualified) || EXCLUDED_PREFIXES.some((p) => qualified.startsWith(p));
}

/** Tabel satu skema yang belum tercakup, diurutkan induk dulu supaya restore tidak menabrak foreign key. */
export function planDynamicTables(catalog: CatalogRow[], schema: string, alreadyCovered: Set<string>): CatalogRow[] {
  const pending = new Map<string, CatalogRow>();
  for (const row of catalog) {
    if (row.schema_name !== schema) continue;
    if (alreadyCovered.has(row.table_name) || isExcluded(`${schema}.${row.table_name}`)) continue;
    pending.set(`${schema}.${row.table_name}`, row);
  }

  const ordered: CatalogRow[] = [];
  while (pending.size > 0) {
    const ready = [...pending].filter(([key, row]) => row.parents.every((p) => p === key || !pending.has(p)));
    // Relasi melingkar: tidak ada urutan yang benar, ambil sisanya apa adanya.
    for (const [key, row] of ready.length > 0 ? ready : [...pending]) {
      ordered.push(row);
      pending.delete(key);
    }
  }
  return ordered;
}
