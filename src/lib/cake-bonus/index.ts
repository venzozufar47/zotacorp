"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getCustomCakeBonusMonth } from "@/lib/actions/custom-cake-bonus.actions";
import {
  CAKE_BONUS_POSITIONS,
  PARE_OMSET_BONUS_RATE,
  SEMARANG_BONUS_GE_THRESHOLD,
  SEMARANG_BONUS_LT_THRESHOLD,
  SEMARANG_DIAMETER_THRESHOLD_CM,
} from "./positions";

export interface DecoratorBonusBreakdown {
  /** Intan — Semarang per-cake diameter buckets. */
  semarang: {
    geCount: number; // dimension_cm >= threshold
    ltCount: number; // dimension_cm <  threshold (or null)
    bonus: number;
  };
  /** Zahra — Pare omset share. */
  pare: {
    cakeCount: number;
    omset: number;
    bonus: number;
  };
}

function monthBounds(month: number, year: number) {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { monthStart, monthEnd };
}

/**
 * Decorator bonuses sourced from `cake_orders` (the production system,
 * where 1 row = 1 cake with its own `dimension_cm` + `branch`).
 *
 * Counting rule (per user): every order whose `scheduled_at` falls in
 * the month and whose `status <> 'cancelled'`. Archived orders
 * (`archived_at` set) STILL count — archiving is the normal end-state,
 * not an exclusion.
 */
export async function getDecoratorBonuses(
  month: number,
  year: number
): Promise<DecoratorBonusBreakdown> {
  const empty: DecoratorBonusBreakdown = {
    semarang: { geCount: 0, ltCount: 0, bonus: 0 },
    pare: { cakeCount: 0, omset: 0, bonus: 0 },
  };
  const role = await getCurrentRole();
  if (role !== "admin") return empty;

  const supabase = await createClient();
  const { monthStart, monthEnd } = monthBounds(month, year);

  const { data } = await supabase
    .from("cake_orders")
    .select("branch, dimension_cm, total_idr, status, scheduled_at")
    .neq("status", "cancelled")
    .gte("scheduled_at", monthStart)
    .lt("scheduled_at", monthEnd);

  let geCount = 0;
  let ltCount = 0;
  let pareCount = 0;
  let pareOmset = 0;

  for (const r of (data ?? []) as Array<{
    branch: string | null;
    dimension_cm: number | null;
    total_idr: number | string | null;
  }>) {
    if (r.branch === "semarang") {
      const dia = r.dimension_cm;
      if (dia != null && Number(dia) >= SEMARANG_DIAMETER_THRESHOLD_CM) {
        geCount++;
      } else {
        ltCount++;
      }
    } else if (r.branch === "pare") {
      pareCount++;
      pareOmset += Number(r.total_idr ?? 0);
    }
  }

  return {
    semarang: {
      geCount,
      ltCount,
      bonus:
        geCount * SEMARANG_BONUS_GE_THRESHOLD +
        ltCount * SEMARANG_BONUS_LT_THRESHOLD,
    },
    pare: {
      cakeCount: pareCount,
      omset: pareOmset,
      bonus: Math.round(pareOmset * PARE_OMSET_BONUS_RATE),
    },
  };
}

/**
 * Computed cake bonus per recipient position for one month. Computed
 * ONCE per payslip-generation run, then looked up per user by their
 * `profiles.position`. Positions that don't earn a cake bonus map to 0.
 */
export async function getCakeBonusesByPosition(
  month: number,
  year: number
): Promise<Record<string, number>> {
  const [admin, dec] = await Promise.all([
    getCustomCakeBonusMonth(month, year),
    getDecoratorBonuses(month, year),
  ]);
  return {
    [CAKE_BONUS_POSITIONS.adminHaengbocake]: admin.totalBonus,
    [CAKE_BONUS_POSITIONS.decoratorSemarang]: dec.semarang.bonus,
    [CAKE_BONUS_POSITIONS.decoratorPare]: dec.pare.bonus,
  };
}
