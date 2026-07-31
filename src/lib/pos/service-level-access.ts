import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";

/**
 * Akses metrik Service Level dari sisi karyawan.
 *
 * Konvensi `src/lib/<domain>/access.ts`: dibungkus React `cache()` supaya
 * layout + page + sidebar berbagi satu round-trip per request. Mengikuti
 * pola `src/lib/yeobo-booth/access.ts`.
 *
 * CATATAN KEAMANAN: ini untuk memutuskan apa yang DITAMPILKAN, bukan
 * untuk menjaga data. Gate di `_gates.ts` query ulang secara independen
 * supaya pemeriksaan keamanan tidak bergantung pada lapisan cache ini.
 */

export interface ServiceLevelOutlet {
  bankAccountId: string;
  accountName: string;
  branch: string | null;
}

/**
 * Outlet yang metriknya jadi tanggung jawab user ini.
 *
 * Hanya outlet yang metriknya AKTIF — kartu untuk metrik yang dimatikan
 * admin cuma akan membingungkan. Nama outlet bisa terbaca berkat
 * pelebaran policy `bank_accounts` di migrasi 120; tanpa itu penanggung
 * jawab yang bukan orang POS akan mendapat kartu tanpa nama.
 */
export const listMyServiceLevelOutlets = cache(
  async (): Promise<ServiceLevelOutlet[]> => {
    const user = await getCurrentUser();
    if (!user) return [];
    const supabase = await createClient();
    const { data } = await supabase
      .from("pos_service_level_owners")
      .select(
        "bank_account_id, bank_accounts!inner(account_name, default_branch, service_level_enabled, is_active)"
      )
      .eq("user_id", user.id);

    const rows = (data ?? []) as unknown as Array<{
      bank_account_id: string;
      bank_accounts: {
        account_name: string;
        default_branch: string | null;
        service_level_enabled: boolean;
        is_active: boolean;
      };
    }>;

    return rows
      .filter((r) => r.bank_accounts.service_level_enabled && r.bank_accounts.is_active)
      .map((r) => ({
        bankAccountId: r.bank_account_id,
        accountName: r.bank_accounts.account_name,
        branch: r.bank_accounts.default_branch,
      }));
  }
);
