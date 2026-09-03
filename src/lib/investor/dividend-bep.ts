/**
 * Resolusi BEP (modal terbalik) tingkat CABANG — dipakai bersama oleh jalur
 * baca (`getDividendConsoleData`) dan jalur tulis (`saveDividendConsoleMonth`)
 * di `yeobo-dividend-console.actions.ts`.
 *
 * Sebelum modul ini ada, kedua jalur menghitung `cumBefore` dengan cara
 * BERBEDA: baca memakai baseline hybrid (estimasi PnL s/d Apr 2026 + payout
 * real Mei 2026+), tulis memakai Σ investor_payouts mentah tanpa baseline
 * sama sekali. Selama afterBep cuma memengaruhi badge tampilan, divergensi
 * ini tidak terasa. Sejak entitlement dibekukan dari mgmtPct saat deklarasi
 * pool (migrasi 136), afterBep MENENTUKAN uang — admin bisa melihat satu
 * split di UI dan split lain yang benar-benar tersimpan. Satu implementasi,
 * dua pemanggil, supaya itu tidak mungkin lagi terjadi.
 */

import type { YeoboPnLReport } from "@/lib/cashflow/pnl-yeobo";
import {
  cumulativeDividendPool,
  investorPoolFracBeforeBep,
  type DivBranchConfig,
} from "./dividend-allocation";

/** Batas model BEP: sama dengan `dividend-allocation.ts` — jangan biarkan
 *  drift, dua modul ini menjelaskan bulan yang sama secara konseptual. */
const BEP_BASELINE_THROUGH = { year: 2026, month: 4 } as const;

function prevYm(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * Kumulatif "modal terbalik" investor tingkat CABANG (bukan per-kontrak —
 * lihat `cumulativeInvestorRecoup` di dividend-allocation.ts untuk versi
 * per-kontrak yang dipakai hero investor), dihitung SEBELUM (year, month):
 *   - rank ≤ Apr-2026 : oldFrac × ΣDividendPool(→ bulan sebelumnya)
 *   - rank > Apr-2026 : oldFrac × ΣDividendPool(→ Apr-2026) + Σreal(Mei 2026 s/d sebelum bulan ini)
 *
 * `report` wajib mencakup dari awal histori dividen s/d minimal Apr 2026.
 * `realPayoutsBefore` = Σ investor_payouts cabang ini, periode Mei 2026+
 * s/d SEBELUM (year, month) — caller yang menyaring periode ini.
 */
export function branchInvestorRecoupBefore(args: {
  report: YeoboPnLReport;
  branch: string;
  config: DivBranchConfig;
  year: number;
  month: number;
  realPayoutsBefore: number;
}): number {
  const { report, branch, config, year, month, realPayoutsBefore } = args;
  const oldFrac = investorPoolFracBeforeBep(config);
  const rank = year * 100 + month;
  const baselineRank = BEP_BASELINE_THROUGH.year * 100 + BEP_BASELINE_THROUGH.month;

  if (rank <= baselineRank) {
    const pr = prevYm(year, month);
    return Math.round(oldFrac * cumulativeDividendPool(report, branch, pr.year, pr.month));
  }
  const baselineThruApr = Math.round(
    oldFrac *
      cumulativeDividendPool(
        report,
        branch,
        BEP_BASELINE_THROUGH.year,
        BEP_BASELINE_THROUGH.month
      )
  );
  return baselineThruApr + realPayoutsBefore;
}

/**
 * Apakah cabang sudah "setelah BEP" pada (year, month)? Override manual
 * `config.bepReachedYm` selalu menang. Selain itu: investor kolektif
 * dianggap balik modal saat kumulatif recoup SEBELUM bulan ini ≥ total modal.
 */
export function resolveBranchAfterBep(args: {
  config: DivBranchConfig;
  year: number;
  month: number;
  cumulativeInvestorRecoupBefore: number;
}): boolean {
  const { config, year, month, cumulativeInvestorRecoupBefore } = args;
  if (config.bepReachedYm) {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    return ym >= config.bepReachedYm;
  }
  const total = config.totalInvestmentIdr;
  if (total == null || total <= 0) return false;
  return cumulativeInvestorRecoupBefore >= total;
}
