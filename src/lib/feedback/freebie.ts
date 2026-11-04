import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";
import type { FeedbackBranch } from "./constants";

/**
 * Freebies untuk pengisi feedback pelanggan: tiap feedback yang tersimpan mengurangi 1 stok produk "Freebies Tiramisu"
 * di POS cabangnya. Produk itu tetap ikut produksi dan opname seperti SKU biasa (stok awal = produksi, koreksi = opname).
 *
 * Modul biasa (bukan "use server"): dipanggil server action feedback dengan klien service-role. Best-effort dan tidak
 * melempar: feedback pelanggan tidak boleh gagal terkirim hanya karena stok. Satu feedback paling banyak satu kali
 * mengurangi stok (indeks unik `feedback_id`), jadi aman dipanggil ulang. Cabang tanpa produk freebies: tidak melakukan apa-apa.
 */

export const FEEDBACK_FREEBIE_PRODUCT_NAME = "Freebies Tiramisu";

type Db = SupabaseClient<Database>;

export async function recordFeedbackFreebie(db: Db, feedbackId: string, branch: FeedbackBranch): Promise<void> {
  try {
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
    if (!acc) return;
    const { data: product } = await db
      .from("pos_products")
      .select("id")
      .eq("bank_account_id", acc.id)
      .eq("name", FEEDBACK_FREEBIE_PRODUCT_NAME)
      .eq("active", true)
      .eq("track_stock", true)
      .maybeSingle();
    if (!product) return;
    const now = new Date();
    await db.from("pos_stock_movements").insert({
      bank_account_id: acc.id,
      product_id: product.id,
      variant_id: null,
      type: "withdrawal",
      qty: 1,
      withdrawal_reason: "hadiah_kompensasi",
      notes: "Freebies pengisi feedback pelanggan",
      feedback_id: feedbackId,
      movement_date: jakartaDateString(now),
      movement_time: jakartaHHMM(now),
    } as never);
    // Pelanggaran indeks unik (feedback ini sudah tercatat) sengaja diabaikan: itulah yang membuat fungsi ini idempoten.
  } catch {
    /* best-effort */
  }
}
