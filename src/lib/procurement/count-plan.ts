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
  isNewMaterial,
  provisionalClass,
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
  /** Kelas sementara: bahan baru yang belum punya data pemakaian. */
  provisional: boolean;
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

/** Satu baris daftar yang dibekukan (kolom `items` di procurement_count_plans). */
interface FrozenItem {
  id: string;
  cls: AbcClass;
  reasons: CountReason[];
  provisional: boolean;
}

const PLAN_TABLE = "procurement_count_plans" as never;

async function readFrozenPlan(supabase: DB, businessUnit: string, planDate: string): Promise<FrozenItem[] | null> {
  const { data } = await supabase
    .from(PLAN_TABLE)
    .select("items")
    .eq("business_unit", businessUnit)
    .eq("plan_date", planDate)
    .maybeSingle();
  const items = (data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as FrozenItem[]) : null;
}

/**
 * Daftar "Opname hari ini" DIBEKUKAN per cabang per tanggal Jakarta: dibuat sekali saat pertama dihitung (halaman
 * dibuka atau pengingat jam 14.00) lalu dipakai sepanjang hari. Perubahan stok, pemakaian, kelas ABC, atau bahan baru
 * tidak mengubah daftar sampai besok; yang berubah hanya tanda "sudah dihitung" (dibaca hidup dari opname hari itu).
 */
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
  const countedToday = (id: string) => (hits.get(id) ?? []).some((x) => x.date === today);

  const byId = new Map(rows.map((r) => [r.material.id, r]));
  let frozen = await readFrozenPlan(supabase, businessUnit, today);

  if (!frozen) {
    const ids = rows.map((r) => r.material.id);
    const costs = new Map(ids.map((id) => [id, usage.byMaterial.get(id)?.cost ?? 0]));
    // Kelas sementara untuk bahan baru tanpa pemakaian (pengadaan tak perlu menunggu data pemakaian terekam).
    const provisional = new Map<string, AbcClass>();
    for (const r of rows) {
      if ((costs.get(r.material.id) ?? 0) <= 0 && isNewMaterial(r.material.created_at, now.getTime())) {
        provisional.set(r.material.id, provisionalClass(r.material.category));
      }
    }
    const classes = classifyAbc(costs, ids, provisional);

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
        provisional: provisional.has(id),
      };
    });

    const built = buildTodayPlan(materials, now.getTime());
    const clsOf = new Map(materials.map((m) => [m.id, m]));
    const toStore: FrozenItem[] = built.map((p) => ({
      id: p.id,
      cls: clsOf.get(p.id)?.cls ?? "B",
      reasons: p.reasons,
      provisional: clsOf.get(p.id)?.provisional ?? false,
    }));
    // Dua permintaan bersamaan: yang kalah diabaikan (PK), lalu semua membaca daftar pemenang.
    await supabase
      .from(PLAN_TABLE)
      .upsert({ business_unit: businessUnit, plan_date: today, items: toStore } as never, {
        onConflict: "business_unit,plan_date",
        ignoreDuplicates: true,
      });
    frozen = (await readFrozenPlan(supabase, businessUnit, today)) ?? toStore;
  }

  // Bahan yang sejak itu dihapus/dinonaktifkan hilang dari daftar; selain itu daftar tidak berubah.
  const items: CountPlanItem[] = [];
  for (const f of frozen) {
    const row = byId.get(f.id);
    if (!row) continue;
    items.push({
      row,
      cls: f.cls,
      provisional: !!f.provisional,
      reasons: f.reasons,
      done: countedToday(f.id),
      tolerance: toleranceFor(row.material.category),
    });
  }
  const doneCount = items.filter((i) => i.done).length;
  return { enabled: true, items, doneCount, total: items.length, minutesLeft: estimateMinutes(items.length - doneCount) };
}
