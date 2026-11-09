/**
 * Langkah tulis "Terbitkan bonus" (docs/STATE_MACHINES.md SM-5).
 *
 * Mesin status `bonus_runs`: (tidak ada) → draft → finalized. Invarian:
 * run berstatus `finalized` selalu punya baris `bonus_run_shares`.
 *
 * Dulu run langsung di-upsert sebagai `finalized` lalu bagiannya ditulis.
 * Kalau penulisan bagian gagal, run tertinggal `finalized` TANPA bagian dan
 * tombol terbit menolak dicoba ulang ("sudah terbit"); dua penerbitan
 * bersamaan juga sama-sama lolos dan mengirim push dua kali. Sekarang:
 * pastikan barisnya ada (draft), klaim draft → finalized secara atomik,
 * tulis bagian, dan kembalikan ke draft bila bagian gagal ditulis.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- klien Supabase admin bertipe longgar, sama seperti bonus.actions */

export interface BonusRunValues {
  branch: string;
  period: string;
  gross_profit: number;
  lk_dasar: number;
  p: number;
  scorecard_multiplier: number;
  pool: number;
  breakdown: unknown;
}

export interface BonusShareInsert {
  user_id: string;
  hours: number;
  share: number;
  excluded: boolean;
  excluded_reason: string | null;
}

export async function publishBonusRunRows(
  db: { from(table: string): any },
  run: BonusRunValues,
  shares: BonusShareInsert[],
  userId: string,
  now: Date = new Date()
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const { error: seedErr } = await db
    .from("bonus_runs")
    .upsert({ ...run, status: "draft", created_by: userId }, { onConflict: "branch,period", ignoreDuplicates: true });
  if (seedErr) return { ok: false, error: seedErr.message };

  const { data: claimed, error: claimErr } = await db
    .from("bonus_runs")
    .update({ ...run, status: "finalized", finalized_by: userId, finalized_at: now.toISOString() })
    .eq("branch", run.branch)
    .eq("period", run.period)
    .eq("status", "draft")
    .select("id");
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed || claimed.length === 0) return { ok: false, error: "Bonus bulan ini sudah terbit." };
  const runId = (claimed[0] as { id: string }).id;

  const unpublish = async (error: string) => {
    await db
      .from("bonus_runs")
      .update({ status: "draft", finalized_by: null, finalized_at: null })
      .eq("id", runId)
      .eq("status", "finalized");
    return { ok: false as const, error };
  };

  const { error: delErr } = await db.from("bonus_run_shares").delete().eq("run_id", runId);
  if (delErr) return unpublish(delErr.message);
  const { error: sharesErr } = await db
    .from("bonus_run_shares")
    .insert(shares.map((s) => ({ run_id: runId, ...s })));
  if (sharesErr) return unpublish(sharesErr.message);

  return { ok: true, runId };
}
