/**
 * Perakit daftar "Opname hari ini" satu cabang dari data nyata (stok, pemakaian teoretis, riwayat opname).
 * BUKAN "use server": dipakai halaman/server action (di balik gate) dan cron pengingat (tanpa sesi pengguna).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { num } from "@/lib/costing/rows";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { loadBrandProcurement, loadOpnameHistory, type ProcurementRow } from "./rows";
import {
  CYCLE_COUNT_BRANDS,
  buildTodayPlan,
  classifyAbc,
  estimateMinutes,
  toleranceFor,
  varianceCheck,
  type AbcClass,
  type CountReason,
  type PlanMaterial,
} from "./cycle-count";

type DB = SupabaseClient<Database>;

export interface CountPlanItem {
  row: ProcurementRow;
  cls: AbcClass;
  reasons: CountReason[];
  done: boolean;
  tolerance: number;
}

export interface CountPlan {
  enabled: boolean;
  items: CountPlanItem[];
  doneCount: number;
  total: number;
  /** Perkiraan menit untuk bahan yang BELUM dihitung hari ini. */
  minutesLeft: number;
}

export const isCycleCountBrand = (businessUnit: string) => CYCLE_COUNT_BRANDS.includes(businessUnit);

export async function computeCountPlan(supabase: DB, businessUnit: string, now = new Date()): Promise<CountPlan> {
  const empty: CountPlan = { enabled: false, items: [], doneCount: 0, total: 0, minutesLeft: 0 };
  if (!isCycleCountBrand(businessUnit)) return empty;

  const { rows, usage } = await loadBrandProcurement(supabase, { businessUnit });
  if (rows.length === 0) return { ...empty, enabled: true };

  const today = jakartaDateString(now);
  const history = await loadOpnameHistory(supabase, businessUnit);
  const opnames = history.opnames;
  const opById = new Map(opnames.map((o) => [o.id, o]));

  type Hit = { atMs: number; at: string; date: string; expected: number | null; physical: number; unitCost: number };
  const hits = new Map<string, Hit[]>();
  {
    for (const it of history.items) {
      const op = opById.get(it.opname_id as string);
      if (!op) continue;
      const arr = hits.get(it.material_id as string) ?? [];
      arr.push({
        atMs: Date.parse(op.created_at),
        at: op.created_at,
        date: op.opname_date,
        expected: it.expected_qty == null ? null : num(it.expected_qty),
        physical: num(it.physical_qty),
        unitCost: num(it.unit_cost_snapshot),
      });
      hits.set(it.material_id as string, arr);
    }
  }

  const ids = rows.map((r) => r.material.id);
  const costs = new Map(ids.map((id) => [id, usage.byMaterial.get(id)?.cost ?? 0]));
  const classes = classifyAbc(costs, ids);

  const materials: PlanMaterial[] = rows.map((r) => {
    const id = r.material.id;
    const h = (hits.get(id) ?? []).sort((a, b) => a.atMs - b.atMs);
    const before = h.filter((x) => x.date < today);
    const last = h[h.length - 1];
    // Hitungan PERTAMA bahan tak punya pembanding (expected tak bermakna) → tak bisa dinilai melewati toleransi.
    const lastOut =
      h.length >= 2 && last
        ? varianceCheck({
            category: r.material.category,
            expected: last.expected ?? 0,
            physical: last.physical,
            unitCost: last.unitCost,
          }).outOfTolerance
        : false;
    return {
      id,
      category: r.material.category,
      cls: classes.get(id) ?? "B",
      usageCost: costs.get(id) ?? 0,
      lastCountBeforeToday: before.length ? before[before.length - 1].at : null,
      countedToday: h.some((x) => x.date === today),
      status: r.metrics.status,
      // Sudah dihitung ulang hari ini → tak perlu didahulukan lagi.
      lastOutOfTolerance: lastOut && !(last && last.date === today),
    };
  });

  const plan = buildTodayPlan(materials, now.getTime());
  const byId = new Map(rows.map((r) => [r.material.id, r]));
  const items: CountPlanItem[] = plan.map((p) => {
    const row = byId.get(p.id) as ProcurementRow;
    return { row, cls: classes.get(p.id) ?? "B", reasons: p.reasons, done: p.done, tolerance: toleranceFor(row.material.category) };
  });
  const doneCount = items.filter((i) => i.done).length;
  return { enabled: true, items, doneCount, total: items.length, minutesLeft: estimateMinutes(items.length - doneCount) };
}
