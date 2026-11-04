/**
 * Cermin tunai pembayaran kue yang diterima di kasir POS cabang ke rekening kas cabang.
 *
 * ==> MODUL INI SENGAJA BUKAN "use server" (menerima klien dari pemanggil yang sudah lolos gerbangnya). <==
 *
 * Dipakai dua jalur: pelunasan saat serah terima pesanan kue (`markCakePickedUpAtPos`) dan penjualan ready cake lewat
 * keranjang POS (`recordReadyCakeSalePayments`). Aturannya sama: tunai masuk laci fisik, jadi WAJIB tercatat di kas
 * cabang (kalau tidak, tutup shift selalu selisih lebih); QRIS tidak pernah menyentuh laci, jadi tidak menulis baris kas.
 *
 * Kategorinya non-operasional supaya TIDAK dobel di PnL: pendapatannya sudah diakui lewat akrual cake dari
 * scheduled_at. Bonus admin cake tidak membaca baris kas ini; ia dihitung dari `cake_order_payments`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { CAKE_SETTLEMENT_CASH_CATEGORY } from "@/lib/cashflow/categories";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

type Db = SupabaseClient<Database>;

/** Penanda yang ditulis ke `notes` baris kas; dipakai juga untuk menemukannya lagi saat pembayaran dibatalkan. */
export function cakeCashNote(orderId: string, paymentId: string): string {
  return `cake:${orderId}:${paymentId}`;
}

/**
 * Statement bulanan find-or-create: bulan yang ada pelunasan tapi belum ada transaksi kas lain belum tentu punya
 * statement.
 */
export async function recordCakeCashSettlement(
  supabase: Db,
  args: {
    bankAccountId: string;
    branchLabel: string;
    amountIdr: number;
    customerName: string;
    orderId: string;
    paymentId: string;
    userId: string;
    /** Authorizer yang PIN-nya lolos; null kalau cabang tanpa authorizer atau tanpa PIN (keranjang POS). */
    authorizerName: string | null;
    /** Keterangan sumber di `notes`; default pelunasan serah terima. */
    source?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date();
  const date = jakartaDateString(now);
  const [yStr, mStr] = date.split("-");
  const periodYear = Number(yStr);
  const periodMonth = Number(mStr);

  const { data: existing } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", args.bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existing) {
    statementId = existing.id;
  } else {
    const { data: created, error: stmtErr } = await supabase
      .from("cashflow_statements")
      .insert({
        bank_account_id: args.bankAccountId,
        period_month: periodMonth,
        period_year: periodYear,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: args.userId,
      })
      .select("id")
      .single();
    if (stmtErr || !created)
      return { ok: false, error: stmtErr?.message ?? "gagal membuat statement" };
    statementId = created.id;
  }

  const { data: maxRow } = await supabase
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: txErr } = await supabase.from("cashflow_transactions").insert({
    statement_id: statementId,
    transaction_date: date,
    transaction_time: jakartaHHMM(now),
    description: `Pelunasan cake — ${args.customerName}`,
    debit: 0,
    credit: args.amountIdr,
    running_balance: null,
    category: CAKE_SETTLEMENT_CASH_CATEGORY,
    branch: args.branchLabel,
    // Penanda telusur kalau nanti perlu rekonsiliasi manual. Nama
    // authorizer ikut di sini, bukan di `description`: deskripsi dibaca
    // aturan kategorisasi kas, dan menyisipkan nama orang ke dalamnya
    // bisa mengubah kategori baris secara tak sengaja.
    notes: `${args.source ?? "Pelunasan custom cake diterima kasir"}${
      args.authorizerName ? ` · otorisasi ${args.authorizerName}` : ""
    } · ${cakeCashNote(args.orderId, args.paymentId)}`,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  });
  if (txErr) return { ok: false, error: txErr.message };

  return { ok: true };
}

/** Hapus baris kas tunai untuk satu pembayaran kue (void penjualan / rollback). Mengembalikan galat bila gagal. */
export async function deleteCakeCashSettlement(
  db: Db,
  orderId: string,
  paymentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db
    .from("cashflow_transactions")
    .delete()
    .like("notes", `%${cakeCashNote(orderId, paymentId)}`);
  return error ? { ok: false, error: error.message } : { ok: true };
}
