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
 * Penarikan manual kasir memilih kue yang ditarik (`claimReadyCakesForWithdrawal`): kue itu langsung berstatus Buang di
 * kanban, apa pun alasan penarikannya.
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

type ExitKind = "handover" | "discard" | "cancel" | "free_claim";

const EXIT_META: Record<ExitKind, { reason: string | null; notes: string }> = {
  handover: { reason: null, notes: "Diserahkan ke pelanggan (kasir POS)" },
  discard: { reason: "rusak", notes: "Dibuang (admin cake)" },
  cancel: { reason: "koreksi_input", notes: "Pesanan ready dibatalkan" },
  // Klaim gratis karyawan (perk / giveaway): kue diserahkan ke karyawan tanpa lewat kasir, jadi stok harus keluar di sini.
  free_claim: { reason: "klaim_karyawan", notes: "Klaim gratis karyawan (dicatat admin cake)" },
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
  notes: string,
  createdBy: string | null = null
): Promise<void> {
  const now = new Date();
  await db.from("pos_stock_movements").insert({
    ...(createdBy ? { created_by: createdBy } : {}),
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
export async function recordReadyCakeExit(
  db: Db,
  orderId: string,
  kind: ExitKind,
  createdBy: string | null = null
): Promise<void> {
  try {
    const order = await loadOrder(db, orderId);
    if (!order?.is_ready_stock) return;
    if (!(await movementExists(db, orderId, "production"))) return;
    if (await movementExists(db, orderId, "withdrawal")) return;
    const sku = await resolveSku(db, order);
    if (!sku) return;
    const meta = EXIT_META[kind];
    await insertMovement(db, sku, orderId, "withdrawal", meta.reason, meta.notes, createdBy);
  } catch {
    /* best-effort */
  }
}

/** Klaim gratis dibatalkan: tarik HANYA baris keluar bertanda klaim karyawan (serah terima kasir tidak disentuh). */
export async function reverseReadyCakeFreeClaimExit(db: Db, orderId: string): Promise<void> {
  try {
    await db
      .from("pos_stock_movements")
      .delete()
      .eq("cake_order_id", orderId)
      .eq("type", "withdrawal")
      .eq("withdrawal_reason", "klaim_karyawan");
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
 * Penarikan Ready Cake oleh kasir: kasir memilih kue yang ditarik (bukan sekadar jumlah), apa pun alasannya. Kue-kue itu
 * langsung berstatus `discarded` ("Buang") di kanban, sehingga keluar dari omset dan bonus kue. Atomik: bila ada satu kue
 * yang sudah berubah (terjual, diserahkan, dibayar, dibuang) tak satu pun yang diubah. Baris stok keluar per kue
 * ditulis pemanggil (satu baris per kue, bertanda `cake_order_id`).
 */
export async function claimReadyCakesForWithdrawal(
  db: Db,
  args: { productId: string; orderIds: string[] }
): Promise<{ ok: true; cakes: { id: string; variantId: string | null }[] } | { ok: false; error: string }> {
  const ids = [...new Set(args.orderIds)];
  if (ids.length === 0 || ids.length !== args.orderIds.length)
    return { ok: false, error: "Pilih kue Ready Cake yang ditarik (tiap kue satu kali)" };
  try {
    const { data: produced } = await db
      .from("pos_stock_movements")
      .select("cake_order_id, variant_id")
      .eq("product_id", args.productId)
      .eq("type", "production")
      .in("cake_order_id", ids);
    const variantOf = new Map((produced ?? []).map((r) => [r.cake_order_id as string, r.variant_id as string | null]));
    if (ids.some((id) => !variantOf.has(id)))
      return { ok: false, error: "Ada kue yang tidak tercatat masuk stok Ready Cake ini. Muat ulang daftar." };

    const { data: exited } = await db
      .from("pos_stock_movements")
      .select("cake_order_id")
      .eq("type", "withdrawal")
      .in("cake_order_id", ids);
    if ((exited ?? []).length > 0) return { ok: false, error: "Ada kue yang sudah keluar dari stok. Muat ulang daftar." };

    const { data: claimed } = await db
      .from("cake_orders" as never)
      .update({ status: "discarded" } as never)
      .in("id", ids)
      .eq("is_ready_stock", true)
      .eq("status", "ready")
      .is("picked_up_at", null)
      .is("sold_pos_sale_id", null)
      .is("archived_at", null)
      // Yang sudah ada pembayarannya (lunas lewat admin) menunggu diserahkan ke pembeli, bukan dibuang.
      .lte("paid_idr", 0)
      .select("id");
    const claimedIds = ((claimed ?? []) as unknown as { id: string }[]).map((r) => r.id);
    if (claimedIds.length !== ids.length) {
      await unclaimReadyCakes(db, claimedIds);
      return { ok: false, error: "Ada kue yang sudah terjual, dibayar, atau berubah status. Muat ulang daftar." };
    }
    return { ok: true, cakes: ids.map((id) => ({ id, variantId: variantOf.get(id) ?? null })) };
  } catch {
    return { ok: false, error: "Gagal memproses penarikan Ready Cake" };
  }
}

/** Batalkan klaim `claimReadyCakesForWithdrawal` (penulisan stok gagal): kue kembali ke daftar siap. */
export async function unclaimReadyCakes(db: Db, orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    await db
      .from("cake_orders" as never)
      .update({ status: "ready" } as never)
      .in("id", orderIds)
      .eq("status", "discarded");
  } catch {
    /* best-effort */
  }
}

/**
 * Ready cake yang sudah tercatat masuk stok dan belum keluar. Kue seperti ini hanya boleh dikeluarkan lewat
 * penarikan di POS (kasir toko / koordinator toko, dengan PIN); admin cake tidak boleh membuang atau membatalkannya.
 */
export async function isReadyCakeSoldViaPos(db: Db, orderId: string): Promise<boolean> {
  try {
    const { data } = await db
      .from("cake_orders" as never)
      .select("sold_pos_sale_id")
      .eq("id", orderId)
      .maybeSingle();
    return !!(data as unknown as { sold_pos_sale_id: string | null } | null)?.sold_pos_sale_id;
  } catch {
    return false;
  }
}

export async function isReadyCakeInStock(db: Db, orderId: string): Promise<boolean> {
  try {
    const order = await loadOrder(db, orderId);
    if (!order?.is_ready_stock) return false;
    if (!(await movementExists(db, orderId, "production"))) return false;
    return !(await movementExists(db, orderId, "withdrawal"));
  } catch {
    return false;
  }
}

export interface ReadyCakeForSale {
  orderId: string;
  name: string;
  priceIdr: number;
  isDiy: boolean;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  /** Kue dibuat sebelum SKU stok ada (tanpa catatan masuk): masuk stok saat dijual, jadi stok tidak berubah. */
  legacy: boolean;
}

/**
 * Validasi satu ready cake untuk dijual lewat keranjang POS rekening `bankAccountId`: kue harus ready (produksi selesai,
 * tercatat masuk stok, belum keluar / terjual), milik cabang rekening itu, dan SKU stoknya ada. Harga SELALU dari
 * pesanan (ditetapkan Tasya), tidak pernah dari klien. Mengembalikan pesan galat siap tampil bila tidak bisa dijual.
 */
export async function resolveReadyCakeForSale(
  db: Db,
  orderId: string,
  bankAccountId: string
): Promise<{ ok: true; cake: ReadyCakeForSale } | { ok: false; error: string }> {
  const { data } = await db
    .from("cake_orders" as never)
    .select("id, customer_name, total_idr, paid_idr, is_diy, is_ready_stock, status, production_status, picked_up_at, sold_pos_sale_id, archived_at, branch")
    .eq("id", orderId)
    .maybeSingle();
  const o = data as unknown as {
    id: string;
    customer_name: string;
    total_idr: number;
    paid_idr: number;
    is_diy: boolean;
    is_ready_stock: boolean;
    status: string;
    production_status: string;
    picked_up_at: string | null;
    sold_pos_sale_id: string | null;
    archived_at: string | null;
    branch: "pare" | "semarang";
  } | null;
  if (!o || !o.is_ready_stock) return { ok: false, error: "Ready cake tidak ditemukan" };
  const label = o.customer_name;
  if (o.sold_pos_sale_id || o.picked_up_at || o.status === "done")
    return { ok: false, error: `"${label}" sudah terjual` };
  if (Number(o.paid_idr) > 0)
    return { ok: false, error: `"${label}" sudah dibayar. Serahkan lewat tab Pesanan, bukan dijual lagi di POS` };
  if (o.status !== "ready" || o.production_status !== "done" || o.archived_at)
    return { ok: false, error: `"${label}" belum siap dijual` };
  // Kue yang sudah keluar dari stok (diserahkan / dibuang) tidak boleh dijual lagi. Kue lama tanpa catatan masuk boleh.
  if (await movementExists(db, orderId, "withdrawal")) return { ok: false, error: `"${label}" sudah keluar dari stok` };
  const legacy = !(await movementExists(db, orderId, "production"));
  const sku = await resolveSku(db, o);
  if (!sku || sku.accountId !== bankAccountId) return { ok: false, error: `"${label}" bukan ready cake cabang ini` };
  if (!(o.total_idr >= 0)) return { ok: false, error: `Harga "${label}" belum ditetapkan` };
  const { data: prod } = await db.from("pos_products").select("name").eq("id", sku.productId).maybeSingle();
  let variantName: string | null = null;
  if (sku.variantId) {
    const { data: v } = await db.from("pos_product_variants").select("name").eq("id", sku.variantId).maybeSingle();
    variantName = v?.name ?? null;
  }
  return {
    ok: true,
    cake: {
      orderId,
      name: label,
      priceIdr: Number(o.total_idr),
      isDiy: o.is_diy,
      productId: sku.productId,
      variantId: sku.variantId,
      productName: prod?.name ?? READY_CAKE_PRODUCT_NAME,
      variantName,
      legacy,
    },
  };
}

/**
 * Tandai kue terjual lewat penjualan POS `saleId`. Atomik: hanya satu penjualan yang bisa memegang kue (kalau dua kasir
 * menjual kue yang sama, yang kedua gagal). TIDAK mencatat penarikan stok: stok turun lewat baris penjualan itu sendiri,
 * dan TIDAK mencatat pembayaran di pesanan kue: uangnya dibukukan sebagai penjualan POS.
 */
export async function claimReadyCakeForSale(db: Db, orderId: string, saleId: string): Promise<boolean> {
  try {
    const { data } = await db
      .from("cake_orders" as never)
      .update({ status: "done", sold_pos_sale_id: saleId } as never)
      .eq("id", orderId)
      .eq("is_ready_stock", true)
      .eq("status", "ready")
      .is("picked_up_at", null)
      .is("sold_pos_sale_id", null)
      .select("id");
    return ((data ?? []) as unknown[]).length === 1;
  } catch {
    return false;
  }
}

/**
 * Kue lama (dibuat sebelum SKU stok ada) yang dijual: catat masuk stok pada saat yang sama, supaya penjualannya
 * (yang mengurangi stok) tidak membuat stok minus untuk kue yang memang tidak pernah dihitung. Idempoten.
 */
export async function recordReadyCakeLegacyIntake(db: Db, orderId: string): Promise<void> {
  try {
    const order = await loadOrder(db, orderId);
    if (!order?.is_ready_stock) return;
    if (await movementExists(db, orderId, "production")) return;
    const sku = await resolveSku(db, order);
    if (!sku) return;
    await insertMovement(db, sku, orderId, "production", null, "Ready cake lama (sebelum pencatatan stok) dicatat masuk saat dijual");
  } catch {
    /* best-effort */
  }
}

/**
 * Penjualan dibatalkan / baris dihapus: kue kembali ke daftar ready. `onlyOrderIds` membatasi ke kue tertentu (edit
 * pesanan); tanpa itu semua kue milik penjualan itu dikembalikan. Best-effort dan idempoten.
 */
export async function releaseReadyCakesForSale(db: Db, saleId: string, onlyOrderIds?: string[]): Promise<void> {
  try {
    let q = db
      .from("cake_orders" as never)
      .update({ status: "ready", sold_pos_sale_id: null } as never)
      .eq("sold_pos_sale_id", saleId)
      .eq("is_ready_stock", true);
    if (onlyOrderIds) {
      if (onlyOrderIds.length === 0) return;
      q = q.in("id", onlyOrderIds);
    }
    await q;
  } catch {
    /* best-effort */
  }
}
