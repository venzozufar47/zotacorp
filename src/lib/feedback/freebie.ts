import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";
import { computeExpectedCounts, listActiveSkus, loadBaselineAt, skuKey } from "@/lib/pos/stock-engine";
import { wibDayStart } from "./store";
import type { FeedbackBranch } from "./constants";

/**
 * Freebies untuk pengisi feedback pelanggan, DIKLAIM DI KASIR. Mengisi formulir tidak mengurangi stok: feedback hanya
 * menawarkan freebies (freebie_claim = 'pending') bila stok masih tersisa setelah dikurangi tawaran yang belum diklaim
 * hari ini. Stok "Freebies Tiramisu" berkurang 1 ketika kasir mengetuk "Diberikan". Dengan begitu stok tidak pernah minus
 * dan feedback iseng tidak menghabiskan stok yang tidak pernah diambil.
 *
 * Modul biasa (bukan "use server"): dipanggil server action feedback dengan klien service-role. Penarikan stok
 * ditautkan ke feedback lewat `feedback_id` (indeks unik) jadi satu feedback paling banyak satu kali mengurangi stok.
 */

export const FEEDBACK_FREEBIE_PRODUCT_NAME = "Freebies Tiramisu";

type Db = SupabaseClient<Database>;
const FB = "customer_feedback" as never;

export interface FreebieProduct {
  accountId: string;
  productId: string;
}

/** Kode pendek untuk dicocokkan kasir dengan layar pelanggan (4 karakter pertama id feedback). */
export const claimCode = (feedbackId: string) => feedbackId.replace(/-/g, "").slice(0, 4).toUpperCase();

/** Produk freebies aktif di outlet POS cabang ini; null bila cabang tidak memakainya. */
export async function loadFreebieProduct(db: Db, branch: FeedbackBranch): Promise<FreebieProduct | null> {
  const { data: acc } = await db
    .from("bank_accounts")
    .select("id")
    .eq("business_unit", "Haengbocake")
    .eq("default_branch", branch)
    .eq("pos_enabled", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!acc) return null;
  const { data: product } = await db
    .from("pos_products")
    .select("id")
    .eq("bank_account_id", acc.id)
    .eq("name", FEEDBACK_FREEBIE_PRODUCT_NAME)
    .eq("active", true)
    .eq("track_stock", true)
    .maybeSingle();
  return product ? { accountId: acc.id, productId: product.id } : null;
}

/** Stok freebies saat ini (mesin stok POS yang sama dengan layar kasir). */
export async function freebieOnHand(db: Db, p: FreebieProduct): Promise<number> {
  const { skus, aggregateProductIds } = await listActiveSkus(db, p.accountId);
  const baseline = await loadBaselineAt(db, p.accountId, new Date().toISOString(), aggregateProductIds);
  const expected = await computeExpectedCounts(
    db,
    p.accountId,
    baseline.cutoffIso,
    new Date().toISOString(),
    skus,
    baseline.baseline,
    aggregateProductIds
  );
  return expected.get(skuKey(p.productId, null)) ?? 0;
}

/** Tawaran freebies yang belum diklaim hari ini (WIB) untuk cabang ini. */
export async function pendingClaimCount(db: Db, branch: FeedbackBranch): Promise<number> {
  const { count } = await db
    .from(FB)
    .select("id", { count: "exact", head: true })
    .eq("branch", branch)
    .eq("hidden", false)
    .eq("freebie_claim", "pending")
    .gte("created_at", wibDayStart(jakartaDateString(new Date())));
  return count ?? 0;
}

/**
 * Dipanggil setelah feedback tersimpan. Mengembalikan kode klaim bila freebies ditawarkan (stok cukup setelah
 * dikurangi tawaran yang menunggu), selain itu null: pelanggan tidak dijanjikan apa pun. Tidak melempar.
 */
export async function offerFeedbackFreebie(db: Db, feedbackId: string, branch: FeedbackBranch): Promise<string | null> {
  try {
    const product = await loadFreebieProduct(db, branch);
    if (!product) return null;
    const [onHand, pending] = await Promise.all([freebieOnHand(db, product), pendingClaimCount(db, branch)]);
    if (onHand - pending <= 0) return null;
    const { error } = await db.from(FB).update({ freebie_claim: "pending" } as never).eq("id", feedbackId);
    return error ? null : claimCode(feedbackId);
  } catch {
    return null;
  }
}

/**
 * Kasir memberikan freebies: memenangkan klaim (pending → given) lalu menarik 1 stok. Gagal menarik stok = klaim
 * dikembalikan ke pending. Aman dipanggil ulang/bersamaan (hanya satu pemenang).
 */
export async function giveFreebie(
  db: Db,
  p: { feedbackId: string; branch: FeedbackBranch; userId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const product = await loadFreebieProduct(db, p.branch);
  if (!product) return { ok: false, error: "Produk freebies tidak aktif di cabang ini." };
  if ((await freebieOnHand(db, product)) <= 0) return { ok: false, error: "Stok freebies habis." };
  const nowIso = new Date().toISOString();
  const { data: won, error } = await db
    .from(FB)
    .update({ freebie_claim: "given", freebie_claimed_at: nowIso, freebie_claimed_by: p.userId } as never)
    .eq("id", p.feedbackId)
    .eq("freebie_claim", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!won || (won as unknown[]).length === 0) return { ok: false, error: "Tawaran ini sudah diproses." };
  const now = new Date();
  const { error: mvErr } = await db.from("pos_stock_movements").insert({
    bank_account_id: product.accountId,
    product_id: product.productId,
    variant_id: null,
    type: "withdrawal",
    qty: 1,
    withdrawal_reason: "hadiah_kompensasi",
    notes: "Freebies pengisi feedback pelanggan",
    feedback_id: p.feedbackId,
    movement_date: jakartaDateString(now),
    movement_time: jakartaHHMM(now),
  } as never);
  if (mvErr) {
    await db.from(FB).update({ freebie_claim: "pending", freebie_claimed_at: null, freebie_claimed_by: null } as never).eq("id", p.feedbackId);
    return { ok: false, error: "Gagal mencatat pengurangan stok. Coba lagi." };
  }
  return { ok: true };
}

/** Batalkan tawaran/pemberian (feedback disembunyikan admin): pending jadi skipped; given dikembalikan ke stok. */
export async function voidFreebie(db: Db, feedbackId: string): Promise<void> {
  try {
    await db.from("pos_stock_movements").delete().eq("feedback_id", feedbackId);
    await db
      .from(FB)
      .update({ freebie_claim: "skipped" } as never)
      .eq("id", feedbackId)
      .in("freebie_claim", ["pending", "given"]);
  } catch {
    /* best-effort */
  }
}
