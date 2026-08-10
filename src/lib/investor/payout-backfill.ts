import "server-only";

/**
 * Tanggal transfer batch dividen per periode, untuk satu cabang Yeobo.
 *
 * LATAR: dividen Yeobo ditransfer per cabang per periode dalam SATU batch —
 * semua penerima cabang itu dibayar bersamaan. Faktanya ("periode Mei 2026
 * ditransfer 13 Jun") cuma hidup di `investor_payouts.paid_at`, yang per
 * KONTRAK. `yeobo_dividend_allocations` tidak punya kolom tanggal transfer
 * sama sekali.
 *
 * Akibatnya investor yang kontraknya baru dibuat SETELAH transfer berjalan
 * (klaim placeholder / admin menyambungkan slot) mendapat baris riwayat hasil
 * backfill tanpa `paid_at` — tampil "Dijadwalkan" padahal uangnya sudah
 * ditransfer berbulan-bulan lalu. Itu persis yang terjadi pada kontrak
 * Tlogosari Adji & Inggrita (dibuat 8 Agu 2026, transfer 13 Jun & 15 Jul).
 *
 * Helper ini memulihkan tanggal itu dari baris saudara: payout kontrak lain
 * di cabang & periode yang sama yang `paid_at`-nya sudah terisi.
 *
 * Dipakai backfill saja. Pembuatan payout normal (konsol dividen) tetap
 * menulis `paid_at` sendiri saat admin menandai transfer.
 */

/** Kunci periode untuk peta hasil `loadBranchPaidDates`. */
export function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Peta `periodKey` → `paid_at` (ISO) untuk sebuah cabang.
 *
 * Diambil yang PALING AWAL per periode: itu tanggal batch aslinya. Koreksi
 * atau pembayaran susulan yang ditandai belakangan tidak boleh menggeser
 * tanggal historis yang dilihat investor lain.
 *
 * Periode tanpa satu pun baris terbayar tidak masuk peta — pemanggil
 * membiarkan `paid_at` kosong, dan barisnya memang benar "Dijadwalkan".
 */
export async function loadBranchPaidDates(
  db: any,
  branch: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!branch) return out;

  const { data: contracts } = await db
    .from("investor_contracts")
    .select("id")
    .eq("branch", branch);
  const contractIds = ((contracts ?? []) as any[]).map((c) => c.id as string);
  if (contractIds.length === 0) return out;

  const { data: paid } = await db
    .from("investor_payouts")
    .select("period_year, period_month, paid_at")
    .in("contract_id", contractIds)
    .not("paid_at", "is", null);

  for (const p of (paid ?? []) as any[]) {
    if (!p.paid_at) continue;
    const key = periodKey(p.period_year, p.period_month);
    const cur = out.get(key);
    if (!cur || p.paid_at < cur) out.set(key, p.paid_at as string);
  }
  return out;
}
