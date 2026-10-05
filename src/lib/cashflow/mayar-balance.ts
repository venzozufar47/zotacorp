import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Saldo rekening Mayar yang SEBENARNYA.
 *
 * Ledger Mayar di `cashflow_transactions` hanya bertambah (pendapatan net)
 * dan tidak pernah berkurang saat dana dicairkan ke rekening bank — jadi
 * jumlah barisnya = total pendapatan sejak awal, bukan saldo. Dana yang
 * sudah dicairkan terlihat di rekening bank tujuan sebagai baris masuk dari
 * "SINAR DIGITAL TERDEP". Helper ini menghitung berapa yang sudah keluar
 * itu supaya "Saldo terakhir" = pendapatan − pencairan − biaya pencairan.
 */

/** Biaya penarikan Mayar, flat: Rp2.500 + PPN 11% = Rp2.775 per penarikan. */
export const MAYAR_WITHDRAWAL_FEE = 2775;

/**
 * Penanda counterparty penarikan di rekening koran bank tujuan. Mayar
 * mencairkan lewat entitas ini — kata "Mayar" tidak muncul sama sekali.
 */
export const MAYAR_WITHDRAWAL_MARKER = "SINAR DIGITAL TERDEP";

/** Prefix penanda di notes baris biaya: `ref:<id baris penarikan>`. */
export const MAYAR_FEE_REF = "ref:";

export interface MayarWithdrawalAdjustment {
  /** Jumlah pokok yang sudah dicairkan ke rekening bank. */
  principal: number;
  /** Banyaknya penarikan terdeteksi. */
  count: number;
  /** Biaya penarikan yang BELUM punya baris biaya di ledger Mayar
   *  (rekening koran baru diunggah, cron belum membuat barisnya). Baris
   *  biaya yang sudah ada sudah ikut terhitung di ledger — jangan dikurangi dua kali. */
  uncoveredFees: number;
}

async function pageAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await fetchPage(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * @param admin client service-role — penarikan ada di rekening BANK lain
 *   milik BU yang sama, yang mungkin di luar RLS pemanggil. Hanya angka
 *   agregat yang dikembalikan, dan pemanggil sudah memastikan ia boleh
 *   melihat rekening Mayar itu.
 */
export async function getMayarWithdrawalAdjustment(
  admin: SupabaseClient<Database>,
  mayarAccountId: string
): Promise<MayarWithdrawalAdjustment> {
  const none = { principal: 0, count: 0, uncoveredFees: 0 };

  const { data: account } = await admin
    .from("bank_accounts")
    .select("business_unit")
    .eq("id", mayarAccountId)
    .maybeSingle();
  if (!account) return none;

  type W = { id: string; credit: number | string };
  const withdrawals = await pageAll<W>((from, to) =>
    admin
      .from("cashflow_transactions")
      .select("id, credit, cashflow_statements!inner(bank_accounts!inner(bank, business_unit))")
      .eq("cashflow_statements.bank_accounts.business_unit", account.business_unit)
      .neq("cashflow_statements.bank_accounts.bank", "mayar")
      .gt("credit", 0)
      .ilike("description", `%${MAYAR_WITHDRAWAL_MARKER}%`)
      .order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: W[] | null; error: unknown }>
  );
  if (withdrawals.length === 0) return none;

  const feeRows = await pageAll<{ notes: string | null }>((from, to) =>
    admin
      .from("cashflow_transactions")
      .select("notes, cashflow_statements!inner(bank_account_id)")
      .eq("cashflow_statements.bank_account_id", mayarAccountId)
      .gt("debit", 0)
      .order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: { notes: string | null }[] | null;
      error: unknown;
    }>
  );
  const covered = new Set<string>();
  for (const r of feeRows) {
    const idx = r.notes?.indexOf(MAYAR_FEE_REF) ?? -1;
    if (idx >= 0 && r.notes) covered.add(r.notes.slice(idx + MAYAR_FEE_REF.length).trim());
  }

  const principal = withdrawals.reduce((s, w) => s + Number(w.credit), 0);
  const uncovered = withdrawals.filter((w) => !covered.has(w.id)).length;
  return {
    principal,
    count: withdrawals.length,
    uncoveredFees: uncovered * MAYAR_WITHDRAWAL_FEE,
  };
}
