"use server";

import { createAdminClient } from "./_supabase-admin";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import { fetchAllPages, type PosDbClient } from "@/lib/pos/stock-engine";
import { computeWaste } from "@/lib/pos/waste";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";
import {
  computeVerdict,
  diagnose,
  idleHours,
  weeklySeries,
  type CapacityVerdict,
  type Diagnosis,
  type HourPoint,
  type KitchenDay,
  type WeekPoint,
} from "@/lib/pos/kitchen-capacity";

/**
 * Cabang yang sudah punya patokan. Semarang belum: tim produksinya belum stabil dan absensi bakernya baru tercatat
 * di lokasi Semarang sejak Okt 2026 — rekor yang dihitung dari data itu menyesatkan.
 * `from` = awal data yang layak (sebelumnya hampir semua hari lembur dan absensi belum rapi).
 */
const KITCHEN_BRANCHES: Record<string, { from: string; locationLike: string }> = {
  Pare: { from: "2026-06-01", locationLike: "%Pare%" },
};

const BAKER_ROLES = ["Baker", "Staf Dapur", "Baker & Kepala Produksi", "Kitchen Helper"];
/** Produksi satu baris di atas ini dianggap salah ketik (sama dengan WASTE_QTY_SANITY_CAP). */
const QTY_CAP = 10_000;

export interface KitchenCapacityData {
  enabled: boolean;
  branch: string | null;
  asOf: string;
  verdict: CapacityVerdict | null;
  weekly: WeekPoint[];
  hours: HourPoint[];
  idle: number[];
  /** Persen susut (expired + rusak) 30 hari; null bila tak ada produksi. */
  wastePct: number | null;
  /** Service level 30 hari (0–1); null bila belum ada data. */
  serviceLevel: number | null;
  diagnosis: Diagnosis;
  overtimeDays: number;
}

/**
 * Output dapur terhadap rekor reguler (tanpa lembur). Lihat `lib/pos/kitchen-capacity` untuk definisi dan batasannya:
 * ini patokan "terbukti pernah dicapai", bukan kapasitas fisik.
 */
export async function getKitchenCapacity(bankAccountId: string): Promise<ActionResult<KitchenCapacityData>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient();
  const today = jakartaDateString(new Date());
  const empty: KitchenCapacityData = {
    enabled: false,
    branch: null,
    asOf: today,
    verdict: null,
    weekly: [],
    hours: [],
    idle: [],
    wastePct: null,
    serviceLevel: null,
    diagnosis: "belum_cukup",
    overtimeDays: 0,
  };

  const { data: acct } = await admin.from("bank_accounts").select("default_branch").eq("id", bankAccountId).maybeSingle();
  const branch = acct?.default_branch ?? null;
  const cfg = branch ? KITCHEN_BRANCHES[branch] : undefined;
  if (!branch || !cfg) return { ok: true, data: { ...empty, branch } };

  try {
    const { rows } = await fetchAllPages<{
      id: string;
      product_id: string;
      qty: number;
      movement_date: string;
      movement_time: string | null;
    }>(() =>
      admin
        .from("pos_stock_movements")
        .select("id, product_id, qty, movement_date, movement_time")
        .eq("bank_account_id", bankAccountId)
        .eq("type", "production")
        .gte("movement_date", cfg.from)
        .lte("qty", QTY_CAP)
    );

    // Per hari: total, jumlah batch (satu catatan produksi = satu batch), jumlah jenis produk.
    const byDay = new Map<string, { qty: number; batches: number; skus: Set<string> }>();
    for (const r of rows) {
      const cur = byDay.get(r.movement_date) ?? { qty: 0, batches: 0, skus: new Set<string>() };
      cur.qty += r.qty;
      cur.batches += 1;
      cur.skus.add(r.product_id);
      byDay.set(r.movement_date, cur);
    }
    const days: KitchenDay[] = [...byDay.entries()].map(([date, v]) => ({
      date,
      qty: v.qty,
      batches: v.batches,
      skus: v.skus.size,
    }));

    // Hari lembur = ada baker bertanda lembur di lokasi cabang ini.
    const [{ data: bakers }, { data: locs }] = await Promise.all([
      admin.from("profiles").select("id").in("job_role", BAKER_ROLES),
      admin.from("attendance_locations").select("id").ilike("name", cfg.locationLike),
    ]);
    const bakerIds = (bakers ?? []).map((b) => b.id);
    const locIds = (locs ?? []).map((l) => l.id);
    const overtime = new Set<string>();
    if (bakerIds.length > 0 && locIds.length > 0) {
      const { data: logs } = await admin
        .from("attendance_logs")
        .select("date")
        .in("user_id", bakerIds)
        .in("matched_location_id", locIds)
        .eq("is_overtime", true)
        .gte("date", cfg.from)
        .limit(5000);
      for (const l of logs ?? []) overtime.add(l.date);
    }

    const verdict = computeVerdict(days, overtime, cfg.from);
    const weekly = weeklySeries(days, overtime, cfg.from, 16);

    // Pola jam: batch per hari kerja pada tiap jam (60 hari terakhir). Jam = jam pencatatan, bukan jam di oven.
    const since = jakartaDateMinusDays(today, 59);
    const recent = rows.filter((r) => r.movement_date >= since);
    const workdayCount = new Set(recent.map((r) => r.movement_date)).size || 1;
    const hourCount = new Map<number, number>();
    for (const r of recent) {
      const h = r.movement_time ? Number(r.movement_time.slice(0, 2)) : NaN;
      if (Number.isFinite(h)) hourCount.set(h, (hourCount.get(h) ?? 0) + 1);
    }
    const hours: HourPoint[] = [];
    for (let h = 6; h <= 21; h += 1) {
      hours.push({ hour: h, batchesPerDay: Math.round(((hourCount.get(h) ?? 0) / workdayCount) * 100) / 100 });
    }

    // Sinyal pembanding: susut 30 hari dan service level 30 hari.
    const from30 = jakartaDateMinusDays(today, 29);
    const [waste, sl] = await Promise.all([
      computeWaste(admin as unknown as PosDbClient, bankAccountId, { fromDate: from30, toDate: today }),
      admin
        .from("pos_service_level_daily")
        .select("ready_sum, tracked_skus, sample_count, percent")
        .eq("bank_account_id", bankAccountId)
        .gte("snapshot_date", from30)
        .lte("snapshot_date", today),
    ]);
    let ready = 0;
    let total = 0;
    for (const r of sl.data ?? []) {
      const denom = r.tracked_skus * r.sample_count;
      if (r.percent === null || denom === 0) continue;
      ready += r.ready_sum;
      total += denom;
    }
    const serviceLevel = total > 0 ? ready / total : null;
    const wastePct = waste.lossRate == null ? null : waste.lossRate * 100;

    return {
      ok: true,
      data: {
        enabled: true,
        branch,
        asOf: today,
        verdict,
        weekly,
        hours,
        idle: idleHours(hours),
        wastePct,
        serviceLevel,
        diagnosis: diagnose(verdict.ratio, wastePct, serviceLevel),
        overtimeDays: [...overtime].filter((d) => d >= cfg.from).length,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menghitung output dapur" };
  }
}
