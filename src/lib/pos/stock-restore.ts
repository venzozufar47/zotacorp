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

/**
 * Masukkan gerakan `production` kompensasi bila penjualan sudah terserap
 * opname. Aman dipanggil kapan pun — keluar lebih awal kalau kompensasi
 * tidak diperlukan.
 *
 * Best-effort: kegagalan di sini tidak boleh membatalkan void yang sudah
 * sukses, jadi semua error ditelan. Selisih stok masih bisa dikoreksi lewat
 * opname berikutnya.
 *
 * @param note Catatan yang ditulis di gerakan stok, mis.
 *             `"Auto: stok kembali — void transaksi Budi"`.
 */
export async function restoreStockIfAbsorbedByOpname(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: any,
  sale: VoidedSaleForStock,
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
    // void sudah cukup memulihkan stok. Jangan kompensasi (cegah dobel).
    if (!lastOpname || (lastOpname.created_at as string) <= sale.created_at) {
      return;
    }

    const { data: itemsRaw } = await adminDb
      .from("pos_sale_items")
      .select("product_id, variant_id, qty")
      .eq("sale_id", sale.id);
    const items = (itemsRaw ?? []) as Array<{
      product_id: string | null;
      variant_id: string | null;
      qty: number;
    }>;
    const productIds = Array.from(
      new Set(items.map((i) => i.product_id).filter((v): v is string => !!v))
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

    // Group qty per SKU (collapse aggregate-variant ke null).
    const bySku = new Map<
      string,
      { productId: string; variantId: string | null; qty: number }
    >();
    for (const it of items) {
      if (!it.product_id) continue; // item custom — tidak ada stok
      const p = products.get(it.product_id);
      if (!p || !p.track_stock) continue; // produk tidak dihitung di stok
      const variantId = p.stock_aggregate_variants ? null : it.variant_id;
      const key = `${it.product_id}|${variantId ?? "-"}`;
      const prev = bySku.get(key);
      if (prev) prev.qty += it.qty;
      else bySku.set(key, { productId: it.product_id, variantId, qty: it.qty });
    }
    if (bySku.size === 0) return;

    const now = new Date();
    const rows = Array.from(bySku.values()).map((s) => ({
      bank_account_id: sale.bank_account_id,
      product_id: s.productId,
      variant_id: s.variantId,
      type: "production" as const,
      qty: s.qty,
      notes: note,
      movement_date: jakartaDateString(now),
      movement_time: jakartaHHMM(now),
      created_by: userId,
    }));
    await adminDb.from("pos_stock_movements").insert(rows);
  } catch {
    // Best-effort — void sudah sukses. Gap stok bisa dikoreksi manual.
  }
}
