import "server-only";

import { createAdminClient } from "@/lib/actions/_supabase-admin";

/**
 * Sambungkan PLACEHOLDER investor ke akun yang baru saja mendaftar.
 *
 * Dipanggil server-side dari /api/profile/create-investor SETELAH profil
 * dibuat, dengan `userId` hasil pembuatan akun (tidak dari input klien) dan
 * `token` dari claim link `/register-investor?claim=<token>`. Karena token
 * itu rahasia yang dibagikan admin, ia menjadi bukti otorisasi — jadi
 * fungsi ini memakai service-role langsung (tanpa gerbang admin) dan HANYA
 * menyentuh slot yang memegang token tsb.
 *
 * Bukan server action (tidak "use server") supaya tidak jadi endpoint yang
 * bisa dipanggil klien dengan userId sembarang.
 *
 * Best-effort: kegagalan mana pun tidak boleh menggagalkan registrasi.
 * Return jumlah slot (cabang) yang berhasil tersambung.
 */
const YEOBO = "Yeobo Space";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function claimPlaceholderInvestor(
  userId: string,
  token: string | null | undefined
): Promise<number> {
  const t = (token ?? "").trim();
  if (!t || !userId) return 0;
  const db = createAdminClient() as any;

  const { data: slots } = await db
    .from("yeobo_dividend_recipients")
    .select("id, branch, invest_idr")
    .eq("claim_token", t)
    .is("user_id", null)
    .eq("kind", "investor");
  const rows = (slots ?? []) as Array<{
    id: string;
    branch: string;
    invest_idr: number | string | null;
  }>;
  if (rows.length === 0) return 0;

  // Tanggal mulai kontrak = hari ini WIB (YYYY-MM-DD).
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });

  let linked = 0;
  for (const slot of rows) {
    const invest = Number(slot.invest_idr ?? 0);
    if (invest <= 0) continue; // kontrak butuh investasi > 0

    // 1. Kontrak default (balik modal): BEP target = modal, permanen, 0% (Yeobo
    //    dividen berbasis pool, bukan bagi_hasil_pct per kontrak).
    const { data: contract, error: cErr } = await db
      .from("investor_contracts")
      .insert({
        user_id: userId,
        business_unit: YEOBO,
        branch: slot.branch,
        total_invest_idr: invest,
        bagi_hasil_pct: 0,
        durasi_bulan: null,
        start_date: today,
        bep_target_idr: invest,
        contract_ref: "auto-placeholder",
        created_by: userId,
      })
      .select("id")
      .single();
    if (cErr || !contract) {
      console.error("[claim-placeholder] contract insert failed", cErr);
      continue;
    }
    const contractId = contract.id as string;

    // 2. Tautkan slot + konsumsi token.
    await db
      .from("yeobo_dividend_recipients")
      .update({
        user_id: userId,
        contract_id: contractId,
        claim_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot.id);

    // 3. Backfill riwayat alokasi → investor_payouts (sama seperti
    //    linkDividendRecipient) supaya investor lihat histori penuh.
    const { data: allocs } = await db
      .from("yeobo_dividend_allocations")
      .select("period_year, period_month, amount_idr")
      .eq("recipient_id", slot.id);
    for (const a of (allocs ?? []) as any[]) {
      await db.from("investor_payouts").upsert(
        {
          contract_id: contractId,
          period_year: a.period_year,
          period_month: a.period_month,
          amount_idr: a.amount_idr,
          ref: "yeobo-dividend",
          notes: `Bagi hasil dividen ${slot.branch}`,
          created_by: userId,
        },
        { onConflict: "contract_id,period_year,period_month" }
      );
    }

    // 4. Assignment BU (idempotent) supaya investor bisa buka dashboard Yeobo.
    const { error: aErr } = await db
      .from("investor_business_unit_assignments")
      .insert({ user_id: userId, business_unit: YEOBO, assigned_by: userId });
    if (aErr && !String(aErr.message).includes("duplicate")) {
      console.warn("[claim-placeholder] assignment insert", aErr);
    }

    linked++;
  }
  return linked;
}
