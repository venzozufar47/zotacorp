/**
 * Capture snapshot HPP semua produk (per brand) untuk hari ini (WIB).
 *
 * Dipakai DUA jalur: server action `captureHppSnapshots` (di balik
 * requireAdmin, tombol manual) DAN cron (`checkCronAuth`). Karena cron
 * tak punya sesi user, logikanya di sini memakai service-role client
 * langsung TANPA gate — sama pola dgn lib cron lain (yeobo reminders).
 * BUKAN "use server".
 *
 * Perakitan data + perhitungan HPP dipinjam dari engine bersama
 * (`rows.ts`), jadi snapshot == daftar produk (satu sumber).
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { loadBrandCosting, computeAll, round2 } from "@/lib/costing/rows";

export async function runHppSnapshotCapture(opts?: {
  businessUnit?: string;
  createdBy?: string | null;
}): Promise<{ count: number }> {
  const supabase = createAdminClient();

  let brands: string[];
  if (opts?.businessUnit) {
    brands = [opts.businessUnit];
  } else {
    const { data } = await supabase
      .from("costing_products" as never)
      .select("business_unit")
      .eq("is_active", true);
    brands = Array.from(
      new Set(
        ((data ?? []) as Record<string, unknown>[]).map(
          (r) => r.business_unit as string
        )
      )
    );
  }

  const today = jakartaDateString(new Date());

  // Brand independen → proses paralel (dibatasi supaya tidak membanjiri
  // koneksi DB kalau brand banyak).
  const counts = await mapLimited(brands, 4, async (bu) => {
    const loaded = await loadBrandCosting(supabase, {
      businessUnit: bu,
      activeProductsOnly: true,
    });
    const snapshots = computeAll(loaded).map(({ product, breakdown: b }) => ({
      product_id: product.id,
      business_unit: bu,
      snapshot_date: today,
      hpp_unit: round2(b.hppUnit),
      final_price: b.finalPrice != null ? round2(b.finalPrice) : null,
      margin_percent: b.marginPercent,
      breakdown_json: b,
      created_by: opts?.createdBy ?? null,
    }));
    if (snapshots.length === 0) return 0;
    const { error } = await supabase
      .from("costing_hpp_snapshot" as never)
      .upsert(snapshots as never, { onConflict: "product_id,snapshot_date" });
    if (error) {
      console.error(`[costing-snapshot] upsert gagal brand "${bu}":`, error.message);
      return 0;
    }
    return snapshots.length;
  });

  return { count: counts.reduce((s, n) => s + n, 0) };
}

/** Jalankan `fn` atas `items` dengan konkurensi maksimal `limit`. */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
