import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

/**
 * Pemulihan stok untuk penjualan POS yang dibatalkan.
 *
 * Diekstrak dari `pos-pesanan.actions.ts` supaya `cancelPesanan` (pesanan
 * pending) dan `voidPosSale` (transaksi lunas di Riwayat) memakai logika
 * yang sama — dua salinan pasti berbeda perilaku begitu salah satu diubah.
 *
 * KENAPA TIDAK SELALU PERLU: `computeExpectedCounts` menghitung stok sebagai
 * `physical_count opname terakhir + produksi − penarikan − penjualan
 * non-void`. Jadi begitu `voided_at` di-set, penjualan itu berhenti memotong
 * stok DENGAN SENDIRINYA — tapi hanya kalau penjualannya dibuat SETELAH
 * opname terakhir. Kalau opname terjadi setelahnya, potongan itu sudah
 * terserap ke angka fisik yang dihitung manual, sehingga void tidak
 * mengembalikan apa pun dan kita perlu gerakan `production` kompensasi.
 * Memasukkan kompensasi di kedua kondisi akan membuat stok dobel.
 */

export type VoidedSaleForStock = {
  id: string;
  bank_account_id: string;
  created_at: string;
};

/** Satu baris item mentah (product_id/variant_id/qty) — bentuk yang sama
 *  dipakai baik untuk baris `pos_sale_items` sungguhan maupun delta hasil
 *  edit pesanan. */
export interface StockQtyLine {
  product_id: string | null;
  variant_id: string | null;
  qty: number;
}

/**
 * Insert gerakan kompensasi bila `sale` sudah terserap opname — inti
 * logika yang dulu di `restoreStockIfAbsorbedByOpname`, sekarang digeneralisasi
 * supaya bisa dipakai untuk EDIT pesanan (delta bisa naik ATAU turun per
 * SKU), bukan cuma pembatalan penuh (selalu turun/restore).
 *
 * `lines` dengan `qty` POSITIF = stok harus BERKURANG lagi (net tambahan
 * ke pesanan) → gerakan `withdrawal`. `qty` NEGATIF = stok harus
 * BERTAMBAH (net pengurangan/pembatalan) → gerakan `production`. Baris
 * `qty === 0` diabaikan.
 *
 * Best-effort: kegagalan di sini tidak boleh membatalkan tulisan yang
 * sudah sukses, jadi semua error ditelan. Selisih stok masih bisa
 * dikoreksi lewat opname berikutnya.
 *
 * @param note Catatan yang ditulis di gerakan stok, mis.
 *             `"Auto: stok kembali — void transaksi Budi"`.
 */
export async function applyStockDeltaIfAbsorbed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: any,
  sale: VoidedSaleForStock,
  lines: StockQtyLine[],
  userId: string,
  note: string
): Promise<void> {
  try {
    const { data: lastOpname } = await adminDb
      .from("pos_stock_opnames")
      .select("created_at")
      .eq("bank_account_id", sale.bank_account_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Tidak ada opname, atau opname terakhir <= waktu penjualan dibuat →
    // perhitungan stok live sudah otomatis benar. Jangan kompensasi
    // (cegah dobel).
    if (!lastOpname || (lastOpname.created_at as string) <= sale.created_at) {
      return;
    }

    const productIds = Array.from(
      new Set(lines.map((i) => i.product_id).filter((v): v is string => !!v))
    );
    if (productIds.length === 0) return;

    const { data: productsRaw } = await adminDb
      .from("pos_products")
      .select("id, track_stock, stock_aggregate_variants")
      .in("id", productIds);
    const products = new Map(
      (
        (productsRaw ?? []) as Array<{
          id: string;
          track_stock: boolean;
          stock_aggregate_variants: boolean;
        }>
      ).map((p) => [p.id, p])
    );

    // Jumlahkan qty (bisa + atau −) per SKU (collapse aggregate-variant
    // ke null).
    const bySku = new Map<
      string,
      { productId: string; variantId: string | null; qty: number }
    >();
    for (const it of lines) {
      if (!it.product_id || it.qty === 0) continue; // item custom / tanpa perubahan
      const p = products.get(it.product_id);
      if (!p || !p.track_stock) continue; // produk tidak dihitung di stok
      const variantId = p.stock_aggregate_variants ? null : it.variant_id;
      const key = `${it.product_id}|${variantId ?? "-"}`;
      const prev = bySku.get(key);
      if (prev) prev.qty += it.qty;
      else bySku.set(key, { productId: it.product_id, variantId, qty: it.qty });
    }

    const now = new Date();
    const rows = Array.from(bySku.values())
      .filter((s) => s.qty !== 0)
      .map((s) => ({
        bank_account_id: sale.bank_account_id,
        product_id: s.productId,
        variant_id: s.variantId,
        type: s.qty > 0 ? ("withdrawal" as const) : ("production" as const),
        qty: Math.abs(s.qty),
        notes: note,
        movement_date: jakartaDateString(now),
        movement_time: jakartaHHMM(now),
        created_by: userId,
      }));
    if (rows.length === 0) return;
    await adminDb.from("pos_stock_movements").insert(rows);
  } catch {
    // Best-effort — tulisan utama sudah sukses. Gap stok bisa dikoreksi
    // manual lewat opname berikutnya.
  }
}

/**
 * Pemulihan stok untuk penjualan POS yang dibatalkan SELURUHNYA — dipakai
 * `cancelPesanan` (pesanan pending) dan `voidPosSale` (transaksi lunas di
 * Riwayat). Tipis di atas `applyStockDeltaIfAbsorbed`: baca item sale-nya
 * sendiri dan kirim sebagai delta NEGATIF (seluruh qty dikembalikan).
 */
export async function restoreStockIfAbsorbedByOpname(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: any,
  sale: VoidedSaleForStock,
  userId: string,
  note: string
): Promise<void> {
  const { data: itemsRaw } = await adminDb
    .from("pos_sale_items")
    .select("product_id, variant_id, qty")
    .eq("sale_id", sale.id);
  const items = (itemsRaw ?? []) as StockQtyLine[];
  const lines = items.map((it) => ({ ...it, qty: -it.qty }));
  await applyStockDeltaIfAbsorbed(adminDb, sale, lines, userId, note);
}
