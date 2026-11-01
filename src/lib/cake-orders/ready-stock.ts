import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

/**
 * Jembatan antara pesanan ready cake (`cake_orders.is_ready_stock`) dan sistem stok POS.
 *
 * Ready cake adalah SKU stok biasa ("Ready Cake", varian Reguler / DIY, produk `stock_only` supaya tidak tampil di
 * grid kasir) yang ikut opname, penarikan, dan service level. Pergerakannya otomatis:
 *   - MASUK  : produksi selesai (baker + cake artist) -> baris `production` bertanda `cake_order_id`.
 *   - KELUAR : serah terima di kasir / dibuang admin / dibatalkan -> baris `withdrawal` bertanda `cake_order_id`.
 * Setiap pesanan paling banyak satu kali masuk dan satu kali keluar (indeks unik di DB), jadi semua fungsi di sini
 * idempoten. Pesanan lama tanpa baris masuk TIDAK pernah mengurangi stok.
 *
 * Penarikan manual (kasir memilih jumlah, tanpa memilih kue) ditangani `discardOldestReadyCakes`: kue tertua yang
 * masih ada dikeluarkan dari daftar serah terima supaya stok dan daftar pesanan tidak berselisih.
 *
 * Modul biasa (bukan "use server") karena menerima klien dari pemanggil: server action (service-role).
 * Semua fungsi best-effort dan tidak melempar; pemanggil tidak boleh gagal hanya karena stok.
 */

type Db = SupabaseClient<Database>;

export const READY_CAKE_PRODUCT_NAME = "Ready Cake";
const BRANCH_LABEL = { pare: "Pare", semarang: "Semarang" } as const;

interface OrderRow {
  id: string;
  branch: "pare" | "semarang";
  is_diy: boolean;
  is_ready_stock: boolean;
  status: string;
  production_status: string;
}

interface ReadySku {
  accountId: string;
  productId: string;
  variantId: string | null;
}

async function loadOrder(db: Db, orderId: string): Promise<OrderRow | null> {
  const { data } = await db
    .from("cake_orders" as never)
    .select("id, branch, is_diy, is_ready_stock, status, production_status")
    .eq("id", orderId)
    .maybeSingle();
  return (data as unknown as OrderRow | null) ?? null;
}

/** SKU "Ready Cake" untuk cabang + jenis kue. Null bila produk belum disiapkan (fitur tidur, bukan error). */
async function resolveSku(db: Db, order: Pick<OrderRow, "branch" | "is_diy">): Promise<ReadySku | null> {
  const { data: acc } = await db
    .from("bank_accounts")
    .select("id")
    .eq("business_unit", "Haengbocake")
    .eq("default_branch", BRANCH_LABEL[order.branch])
    .eq("pos_enabled", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!acc) return null;
  const { data: product } = await db
    .from("pos_products")
    .select("id, stock_aggregate_variants")
    .eq("bank_account_id", acc.id)
    .eq("stock_only", true)
    .eq("name", READY_CAKE_PRODUCT_NAME)
    .eq("active", true)
    .maybeSingle();
  if (!product) return null;
  if (product.stock_aggregate_variants) return { accountId: acc.id, productId: product.id, variantId: null };
  const { data: variants } = await db
    .from("pos_product_variants")
    .select("id, name")
    .eq("product_id", product.id)
    .eq("active", true);
  const wanted = order.is_diy ? "diy" : "reguler";
  const variant = (variants ?? []).find((v) => v.name.trim().toLowerCase() === wanted);
  // Produk punya varian tetapi tidak ada yang cocok: lebih baik tidak mencatat daripada menebak varian.
  if (!variant && (variants ?? []).length > 0) return null;
  return { accountId: acc.id, productId: product.id, variantId: variant?.id ?? null };
}

type ExitKind = "handover" | "discard" | "cancel";

const EXIT_META: Record<ExitKind, { reason: string | null; notes: string }> = {
  handover: { reason: null, notes: "Diserahkan ke pelanggan (kasir POS)" },
  discard: { reason: "rusak", notes: "Dibuang (admin cake)" },
  cancel: { reason: "koreksi_input", notes: "Pesanan ready dibatalkan" },
};

async function movementExists(db: Db, orderId: string, type: "production" | "withdrawal"): Promise<boolean> {
  const { data } = await db
    .from("pos_stock_movements")
    .select("id")
    .eq("cake_order_id", orderId)
    .eq("type", type)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function insertMovement(
  db: Db,
  sku: ReadySku,
  orderId: string,
  type: "production" | "withdrawal",
  reason: string | null,
  notes: string
): Promise<void> {
  const now = new Date();
  await db.from("pos_stock_movements").insert({
    bank_account_id: sku.accountId,
    product_id: sku.productId,
    variant_id: sku.variantId,
    type,
    qty: 1,
    notes,
    withdrawal_reason: reason,
    cake_order_id: orderId,
    movement_date: jakartaDateString(now),
    movement_time: jakartaHHMM(now),
  });
  // Pelanggaran indeks unik (pesanan sudah tercatat) sengaja diabaikan: itulah yang membuat fungsi ini idempoten.
}

/** Produksi selesai: tambahkan 1 ke stok Ready Cake bila pesanan ini ready cake. */
export async function recordReadyCakeProduced(db: Db, orderId: string): Promise<void> {
  try {
    const order = await loadOrder(db, orderId);
    if (!order?.is_ready_stock || order.production_status !== "done") return;
    if (order.status === "cancelled" || order.status === "discarded") return;
    const sku = await resolveSku(db, order);
    if (!sku) return;
    await insertMovement(db, sku, orderId, "production", null, "Produksi selesai (baker + cake artist)");
  } catch {
    /* best-effort */
  }
}

/** Produksi dibuka kembali: tarik baris masuk, kecuali kue itu sudah keluar. */
export async function retractReadyCakeProduced(db: Db, orderId: string): Promise<void> {
  try {
    if (await movementExists(db, orderId, "withdrawal")) return;
    await db.from("pos_stock_movements").delete().eq("cake_order_id", orderId).eq("type", "production");
  } catch {
    /* best-effort */
  }
}

/** Kue keluar dari stok (diserahkan / dibuang / dibatalkan). Hanya bila pernah tercatat masuk dan belum keluar. */
export async function recordReadyCakeExit(db: Db, orderId: string, kind: ExitKind): Promise<void> {
  try {
    const order = await loadOrder(db, orderId);
    if (!order?.is_ready_stock) return;
    if (!(await movementExists(db, orderId, "production"))) return;
    if (await movementExists(db, orderId, "withdrawal")) return;
    const sku = await resolveSku(db, order);
    if (!sku) return;
    const meta = EXIT_META[kind];
    await insertMovement(db, sku, orderId, "withdrawal", meta.reason, meta.notes);
  } catch {
    /* best-effort */
  }
}

/** Serah terima dibatalkan (koreksi staf): kue kembali ada di stok. */
export async function reverseReadyCakeExit(db: Db, orderId: string): Promise<void> {
  try {
    await db.from("pos_stock_movements").delete().eq("cake_order_id", orderId).eq("type", "withdrawal");
  } catch {
    /* best-effort */
  }
}

/**
 * Penarikan manual Ready Cake sejumlah `qty` pada satu SKU: keluarkan kue tertua yang masih berstatus siap dari daftar
 * serah terima (status `discarded`), supaya stok tidak turun sementara kuenya masih tampil di tab Pesanan.
 * Hanya kue yang tercatat masuk (punya baris produksi) dan belum keluar. Mengembalikan jumlah yang dikeluarkan.
 */
export async function discardOldestReadyCakes(
  db: Db,
  args: { productId: string; variantId: string | null; qty: number }
): Promise<number> {
  try {
    let q = db
      .from("pos_stock_movements")
      .select("cake_order_id, created_at")
      .eq("product_id", args.productId)
      .eq("type", "production")
      .not("cake_order_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1000);
    q = args.variantId ? q.eq("variant_id", args.variantId) : q.is("variant_id", null);
    const { data: produced } = await q;
    const ids = (produced ?? []).map((r) => r.cake_order_id).filter((v): v is string => !!v);
    if (ids.length === 0) return 0;

    const { data: exits } = await db
      .from("pos_stock_movements")
      .select("cake_order_id")
      .eq("type", "withdrawal")
      .in("cake_order_id", ids);
    const exited = new Set((exits ?? []).map((r) => r.cake_order_id));
    const candidates = ids.filter((id) => !exited.has(id));
    if (candidates.length === 0) return 0;

    const { data: ready } = await db
      .from("cake_orders" as never)
      .select("id")
      .in("id", candidates)
      .eq("status", "ready")
      .is("picked_up_at", null);
    const readyIds = new Set(((ready ?? []) as unknown as { id: string }[]).map((r) => r.id));
    const chosen = candidates.filter((id) => readyIds.has(id)).slice(0, Math.max(0, args.qty));
    if (chosen.length === 0) return 0;

    const { data: done } = await db
      .from("cake_orders" as never)
      .update({ status: "discarded" } as never)
      .in("id", chosen)
      .eq("status", "ready")
      .select("id");
    return ((done ?? []) as unknown[]).length;
  } catch {
    return 0;
  }
}
