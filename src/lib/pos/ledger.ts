import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Rekening POS "wadah" (mis. POS Mamaya House) tidak punya buku kas atau shift sendiri: uang, shift, dan laci
 * kasnya dibukukan ke rekening induk lewat `bank_accounts.ledger_account_id` (Mamaya → Cash Haengbocake Semarang).
 * Katalog, stok, diskon, struk, dan insight tetap di rekening POS-nya sendiri.
 *
 * Rekening biasa (Pare, Semarang) mengembalikan dirinya sendiri.
 */
type Db = SupabaseClient<Database>;

export async function resolveLedgerAccountId(db: Db, bankAccountId: string): Promise<string> {
  const { data } = await db
    .from("bank_accounts")
    .select("ledger_account_id")
    .eq("id", bankAccountId)
    .maybeSingle();
  return data?.ledger_account_id ?? bankAccountId;
}

/** Rekening induk + semua rekening POS yang menumpang di bukunya (untuk laporan laci/shift gabungan). */
export async function accountIdsSharingLedger(db: Db, ledgerAccountId: string): Promise<string[]> {
  const { data } = await db.from("bank_accounts").select("id").eq("ledger_account_id", ledgerAccountId);
  return [ledgerAccountId, ...(data ?? []).map((r) => r.id)];
}
