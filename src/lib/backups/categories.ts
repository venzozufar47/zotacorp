/**
 * Single source of truth untuk peta backup: kategori → tabel-tabel
 * yang masuk ke dalamnya, ditambah `restoreOrder` (FK-aware: parent
 * dulu, child belakangan; delete reverse).
 *
 * Action `setCakeBasePricesBulk`-style dump & restore membaca dari
 * sini saja — semua perubahan tabel cukup di-update di satu tempat.
 */

export type BackupCategory =
  | "cake"
  | "attendance"
  | "extra_work"
  | "payroll"
  | "cashflow"
  | "pos"
  | "whatsapp"
  | "celebration"
  | "business"
  | "voice";

export const BACKUP_CATEGORIES: BackupCategory[] = [
  "cake",
  "attendance",
  "extra_work",
  "payroll",
  "cashflow",
  "pos",
  "whatsapp",
  "celebration",
  "business",
  "voice",
];

export const BACKUP_CATEGORY_LABELS: Record<BackupCategory, string> = {
  cake: "Cake orders",
  attendance: "Absensi",
  extra_work: "Pekerjaan tambahan",
  payroll: "Payroll",
  cashflow: "Kasflow",
  pos: "POS",
  whatsapp: "WhatsApp",
  celebration: "Celebration feed",
  business: "Business units",
  voice: "Voice rooms",
};

/**
 * Urutan insert tabel untuk restore — parent FK dulu. Delete urutan
 * reverse-nya. Pastikan kalau ada tabel baru di domain ini, tambahkan
 * di posisi yang menghormati FK.
 *
 * `profiles` di-share antara semua kategori; di-list di "attendance"
 * tapi restore mode 'replace' di-downgrade jadi 'merge' (lihat
 * `restore.ts`) supaya tidak menghancurkan referensi dari domain lain.
 */
export const CATEGORY_TABLES: Record<BackupCategory, readonly string[]> = {
  cake: [
    "cake_options",
    "cake_diameter_options",
    "cake_base_diameter_prices",
    "cake_access_assignments",
    "cake_orders",
    "cake_order_attachments",
    "cake_order_payments",
    "cake_production_slips",
    "cake_production_slip_items",
  ],
  attendance: [
    "profiles",
    "attendance_settings",
    "attendance_locations",
    "attendance_logs",
    "employee_locations",
    "overtime_requests",
  ],
  extra_work: [
    "extra_work_kinds",
    "extra_work_kind_assignments",
    "extra_work_logs",
  ],
  payroll: [
    "payslip_settings",
    "payslips",
    "payslip_settings_disputes",
    "payslip_deliverables",
  ],
  cashflow: [
    "bank_accounts",
    "bank_account_assignees",
    "cashflow_statements",
    "cashflow_transactions",
    "cashflow_rules",
    "cashflow_pusat_allocations",
  ],
  pos: [
    "pos_products",
    "pos_product_variants",
    "pos_sales",
    "pos_sale_items",
    "pos_stock_movements",
    "pos_stock_opnames",
    "pos_stock_opname_items",
  ],
  whatsapp: [
    "whatsapp_notification_recipients",
    "whatsapp_templates",
    "whatsapp_send_logs",
  ],
  celebration: ["celebration_messages"],
  business: ["business_units", "business_unit_roles"],
  voice: ["voice_rooms", "voice_room_presence"],
};

/**
 * Primary-key kolom per tabel — dipakai mode 'merge' (upsert) saat
 * restore. Default: 'id'. Tabel composite-PK ditulis sebagai array.
 */
export const TABLE_PRIMARY_KEYS: Record<string, string | string[]> = {
  cake_production_slip_items: ["slip_id", "cake_order_id"],
  cake_base_diameter_prices: ["base_option_id", "diameter_id"],
  bank_account_assignees: ["user_id", "bank_account_id", "scope"],
  pos_stock_opname_items: ["opname_id", "product_id", "variant_id"],
  business_unit_roles: ["user_id", "business_unit_id"],
  extra_work_kind_assignments: ["user_id", "kind_id"],
  voice_room_presence: ["room_id", "user_id"],
};

/** Tabel yang di-share lintas kategori — restore mode 'replace'
 *  otomatis di-downgrade jadi 'merge' untuk tabel ini supaya
 *  referensi domain lain tidak ikut hilang. */
export const SHARED_TABLES = new Set<string>(["profiles"]);

/** Max rows per tabel saat dump. Manifest mencatat
 *  `truncated: true` jika tabel mencapai cap. */
export const DUMP_ROW_CAP = 50000;

export type BackupRunStatus = "running" | "success" | "failed";
export type BackupTrigger = "cron" | "manual";
export type BackupCadence = "daily" | "every_2_days" | "weekly";

export interface BackupRunRow {
  id: string;
  created_at: string;
  trigger: BackupTrigger;
  status: BackupRunStatus;
  storage_prefix: string;
  manifest: BackupManifest | null;
  error: string | null;
  duration_ms: number | null;
}

export interface BackupSettings {
  id: 1;
  enabled: boolean;
  cadence: BackupCadence;
  retention_days: number;
  updated_at: string;
}

export interface BackupManifest {
  version: 1;
  createdAt: string;
  trigger: BackupTrigger;
  categories: Partial<
    Record<
      BackupCategory,
      {
        tables: Record<string, number>;
        truncated: boolean;
      }
    >
  >;
}

/** Per-kategori bagian dalam `FullBackupBundle`. */
export interface CategoryBundle {
  category: BackupCategory;
  tables: Record<string, unknown[]>;
}

/**
 * Bentuk file backup tunggal (.json) — semua kategori dalam satu
 * file supaya admin tinggal download / upload satu kali.
 */
export interface FullBackupBundle {
  version: 1;
  createdAt: string;
  trigger: BackupTrigger;
  categories: Partial<Record<BackupCategory, CategoryBundle>>;
  manifest: BackupManifest;
}
