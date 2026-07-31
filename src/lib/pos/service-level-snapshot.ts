import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";
import { computeServiceLevel, loadServiceLevelConfig } from "./service-level";

/**
 * Rekam snapshot Service Level harian.
 *
 * Dipakai DUA jalur: cron (`checkCronAuth`) dan tombol hitung-ulang admin.
 * Cron tak punya sesi user, jadi memakai service-role client langsung
 * tanpa gate — pola yang sama dengan `src/lib/costing/snapshot.ts`.
 * BUKAN "use server".
 *
 * KENAPA SNAPSHOT, bukan selalu hitung ulang:
 *  1. Penanggung jawab metrik yang bukan assignee POS tidak bisa membaca
 *     tabel POS mentah (RLS 035). Snapshot punya policy bacanya sendiri.
 *  2. Riwayat bisa berubah di belakang — deleteStockMovement hard delete,
 *     setProductStockTracking(false) menghapus permanen, void terlambat
 *     mengubah readiness masa lalu. Snapshot membekukan apa yang benar
 *     saat itu.
 */

/** Berapa hari ke belakang yang ikut dihitung ulang tiap run. */
const TRAILING_DAYS = 3;

/**
 * Tanggal WIB yang harus direkam sebuah run cron, dihitung dari
 * `now − 2 jam`.
 *
 * BUKAN dari `now` langsung. Cron dijadwalkan 22:30 WIB; kalau tertunda
 * atau di-retry melewati tengah malam, `jakartaDateString(now)` sudah
 * berpindah ke tanggal BERIKUTNYA — hari yang mau ditangkap terlewat DAN
 * baris untuk hari yang belum terjadi ikut ditulis.
 *
 * Mundur 2 jam membuat setiap run antara 22:30 dan **01:59 WIB** tetap
 * menunjuk tanggal yang benar (toleransi ~3,5 jam). Lewat 02:00 WIB
 * barulah bergeser — kalau cron sampai setelat itu, jendela hitung-ulang
 * `trailingDays` yang menambalnya di run berikutnya.
 *
 * Diekspor supaya bisa diuji; ini fungsi murni.
 */
export function resolveSnapshotTargetDate(nowMs: number): string {
  return jakartaDateString(new Date(nowMs - 2 * 60 * 60 * 1000));
}

export interface SnapshotOutcome {
  bankAccountId: string;
  accountName: string;
  datesWritten: string[];
  error?: string;
}

export interface SnapshotRunResult {
  count: number;
  outlets: SnapshotOutcome[];
  failed: string[];
}

/**
 * @param opts.targetDate Tanggal WIB terakhir yang direkam. WAJIB diisi
 *   eksplisit oleh cron — jangan mengandalkan "hari ini". Kalau cron
 *   tertunda atau di-retry melewati tengah malam, `jakartaDateString(now)`
 *   sudah berpindah ke tanggal BERIKUTNYA, sehingga hari yang mau
 *   ditangkap terlewat dan baris untuk hari yang belum terjadi ikut
 *   ditulis.
 * @param opts.trailingDays Berapa hari ke belakang ikut dihitung ulang;
 *   void atau koreksi yang masuk keesokan paginya jadi terserap. Yang
 *   lebih tua sengaja dibekukan (lihat catatan riwayat lossy di atas).
 * @param opts.source Ditandai di baris — 'backfill' TIDAK sebanding
 *   dengan 'cron' karena penyebutnya memakai katalog hari ini.
 */
export async function runServiceLevelSnapshot(opts?: {
  bankAccountId?: string;
  targetDate?: string;
  trailingDays?: number;
  source?: "cron" | "manual" | "backfill";
}): Promise<SnapshotRunResult> {
  const supabase = createAdminClient();
  const source = opts?.source ?? "cron";
  const trailing = Math.max(1, Math.min(90, opts?.trailingDays ?? TRAILING_DAYS));
  const targetDate = opts?.targetDate ?? jakartaDateString(new Date());
  const fromDate = jakartaDateMinusDays(targetDate, trailing - 1);

  let q = supabase
    .from("bank_accounts")
    .select("id, account_name")
    .eq("pos_enabled", true)
    .eq("is_active", true)
    .eq("service_level_enabled", true);
  if (opts?.bankAccountId) q = q.eq("id", opts.bankAccountId);
  const { data: accounts } = await q;

  const outlets: SnapshotOutcome[] = [];
  const failed: string[] = [];
  let count = 0;

  // Sekuensial dan ber-try/catch PER OUTLET: satu outlet yang gagal tidak
  // boleh menjatuhkan seluruh run. Outlet POS cuma segelintir, jadi
  // paralelisme tidak sepadan dengan risiko membanjiri koneksi.
  for (const acct of accounts ?? []) {
    try {
      const config = await loadServiceLevelConfig(supabase, acct.id);
      const result = await computeServiceLevel(supabase, acct.id, {
        fromDate,
        toDate: targetDate,
        config,
      });

      const rows = result.days.map((d) => ({
        bank_account_id: acct.id,
        snapshot_date: d.date,
        open_hour: result.openHour,
        close_hour: result.closeHour,
        sample_count: d.sampleCount,
        tracked_skus: d.trackedSkus,
        ready_sum: d.readySum,
        percent: d.percent,
        had_activity: d.hadActivity,
        has_baseline: d.hasBaseline,
        partial_opname: d.partialOpname,
        source,
        detail_json: { hourly: d.hourly },
      }));
      if (rows.length === 0) {
        outlets.push({
          bankAccountId: acct.id,
          accountName: acct.account_name,
          datesWritten: [],
        });
        continue;
      }

      // Idempoten: PK (bank_account_id, snapshot_date) jadi conflict
      // target, jadi run dobel atau retry Vercel aman.
      const { error } = await supabase
        .from("pos_service_level_daily")
        .upsert(rows, { onConflict: "bank_account_id,snapshot_date" });
      if (error) throw error;

      count += rows.length;
      outlets.push({
        bankAccountId: acct.id,
        accountName: acct.account_name,
        datesWritten: rows.map((r) => r.snapshot_date),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[service-level-snapshot] outlet ${acct.account_name} gagal`,
        err
      );
      failed.push(acct.account_name);
      outlets.push({
        bankAccountId: acct.id,
        accountName: acct.account_name,
        datesWritten: [],
        error: message,
      });
    }
  }

  return { count, outlets, failed };
}
