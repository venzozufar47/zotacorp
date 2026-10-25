import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildDeps, computeMonths } from "./compute";
import { diffSnapshots, type SnapRow } from "./changes";
import { prevMonthIso } from "./engine";
import { dataChecks, getOrCreatePeriod, latestSnapshots, persistRun, priorStatusesFor } from "./persist";

type Sb = SupabaseClient<Database>;
type YeoboSb = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RefreshResult {
  month: string;
  version: number;
  /** True bila versi baru dibuat (pertama kali, atau ada angka yang berubah). */
  created: boolean;
  changes: number;
  warnings: number;
}

/** N bulan terakhir yang SUDAH berakhir (tanpa bulan berjalan), urut naik. `todayIso` = tanggal WIB hari ini. */
export function recentEndedMonths(todayIso: string, n: number): string[] {
  let m = `${todayIso.slice(0, 7)}-01`;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    m = prevMonthIso(m);
    out.push(m);
  }
  return out.reverse();
}

/**
 * Hitung ulang scorecard untuk bulan-bulan yang diminta. Versi baru HANYA dibuat bila ada angka/status yang berubah
 * dibanding versi tersimpan; bila tidak, hanya peringatan versi terbaru yang disegarkan. Dipakai cron malam dan tombol
 * "Hitung ulang sekarang".
 */
export async function refreshScorecard(sb: Sb, yeobo: YeoboSb, months: string[], actorId: string | null, note: string): Promise<RefreshResult[]> {
  const sorted = [...months].sort();
  const deps = await buildDeps(sb, yeobo, sorted);
  const prior = await priorStatusesFor(sb, sorted[0]);
  const results = await computeMonths(deps, sorted, { prior });
  const out: RefreshResult[] = [];
  for (const month of sorted) {
    const rows = results.filter((r) => r.month === month);
    const next: SnapRow[] = rows.flatMap((r) => r.metrics.map((m) => ({ unit_id: r.unit_id, metric_code: m.metric_code, value: m.value, status: m.status })));
    const period = await getOrCreatePeriod(sb, month);
    const prev = await latestSnapshots(sb, period.id);
    const warnings = await dataChecks(sb, deps, month);
    const changes = prev.version === 0 ? [] : diffSnapshots(prev.rows, next);
    if (prev.version === 0 || changes.length > 0) {
      const version = await persistRun(sb, period.id, actorId, rows, note, { warnings, changes });
      out.push({ month, version, created: true, changes: changes.length, warnings: warnings.length });
    } else {
      const upd = await sb
        .from("scorecard_runs" as never)
        .update({ warnings } as never)
        .eq("period_id", period.id)
        .eq("version", prev.version);
      if (upd.error) throw new Error(upd.error.message);
      out.push({ month, version: prev.version, created: false, changes: 0, warnings: warnings.length });
    }
  }
  return out;
}
