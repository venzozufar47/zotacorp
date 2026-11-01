/**
 * Ambang Waste/Service level yang berlaku (tabel `branch_scorecard_thresholds`), dibaca sisi server. Bukan berkas "use server"
 * supaya tidak terbuka sebagai endpoint. Dipakai scorecard cabang dan kalkulator bonus; cache singkat per instance karena
 * dihitung di setiap pembukaan beranda. Gagal baca atau nilai tidak sah → bawaan (aturan lama), tidak pernah mematikan scorecard.
 */

import type { createAdminClient } from "@/lib/actions/_supabase-admin";
import { DEFAULT_THRESHOLDS, validateThresholds, type BranchThresholds } from "./thresholds";

type Admin = ReturnType<typeof createAdminClient>;

const TTL_MS = 30_000;
let cache: { at: number; value: BranchThresholds } | null = null;

/** Dipanggil setelah owner menyimpan ambang baru (hanya menyegarkan instance ini; instance lain menyusul ≤ 30 detik). */
export function invalidateThresholdsCache(): void {
  cache = null;
}

type OverrideMetric = "waste" | "service_level" | "feedback";
const overrideCache = new Map<string, { at: number; value: Partial<Record<OverrideMetric, { green: number; yellow: number }>> }>();

/**
 * Ambang yang berlaku untuk SATU cabang pada SATU bulan (`monthStart` = "YYYY-MM-01"): ambang umum, lalu ditimpa per metrik oleh
 * baris di `branch_scorecard_threshold_overrides` bila ada. Hasil yang tidak sah (mis. batas kuning ≥ batas hijau) dibuang, jadi
 * penimpaan yang salah ketik tidak merusak scorecard. Gagal baca → ambang umum.
 */
export async function loadThresholdsFor(admin: Admin, branch: string, monthStart: string): Promise<BranchThresholds> {
  const base = await loadThresholds(admin);
  const key = `${branch}|${monthStart}`;
  let entry = overrideCache.get(key);
  if (!entry || Date.now() - entry.at >= TTL_MS) {
    const value: Partial<Record<OverrideMetric, { green: number; yellow: number }>> = {};
    try {
      const { data } = await admin
        .from("branch_scorecard_threshold_overrides" as never)
        .select("metric, green_bound, yellow_bound")
        .eq("branch", branch)
        .eq("month", monthStart);
      for (const r of (data ?? []) as { metric: OverrideMetric; green_bound: number | string; yellow_bound: number | string }[]) {
        value[r.metric] = { green: Number(r.green_bound), yellow: Number(r.yellow_bound) };
      }
    } catch {
      // Tanpa penimpaan.
    }
    entry = { at: Date.now(), value };
    overrideCache.set(key, entry);
  }
  const o = entry.value;
  if (!o.waste && !o.service_level && !o.feedback) return base;
  const candidate: BranchThresholds = {
    wasteGreen: o.waste?.green ?? base.wasteGreen,
    wasteYellow: o.waste?.yellow ?? base.wasteYellow,
    slGreen: o.service_level?.green ?? base.slGreen,
    slYellow: o.service_level?.yellow ?? base.slYellow,
    fbGreen: o.feedback?.green ?? base.fbGreen,
    fbYellow: o.feedback?.yellow ?? base.fbYellow,
  };
  return validateThresholds(candidate) ? base : candidate;
}

export async function loadThresholds(admin: Admin): Promise<BranchThresholds> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = DEFAULT_THRESHOLDS;
  try {
    const { data } = await admin.from("branch_scorecard_thresholds" as never).select("metric, green_bound, yellow_bound");
    const rows = (data ?? []) as { metric: string; green_bound: number | string; yellow_bound: number | string }[];
    const w = rows.find((r) => r.metric === "waste");
    const s = rows.find((r) => r.metric === "service_level");
    const f = rows.find((r) => r.metric === "feedback");
    const candidate: BranchThresholds = {
      wasteGreen: w ? Number(w.green_bound) : DEFAULT_THRESHOLDS.wasteGreen,
      wasteYellow: w ? Number(w.yellow_bound) : DEFAULT_THRESHOLDS.wasteYellow,
      slGreen: s ? Number(s.green_bound) : DEFAULT_THRESHOLDS.slGreen,
      slYellow: s ? Number(s.yellow_bound) : DEFAULT_THRESHOLDS.slYellow,
      fbGreen: f ? Number(f.green_bound) : DEFAULT_THRESHOLDS.fbGreen,
      fbYellow: f ? Number(f.yellow_bound) : DEFAULT_THRESHOLDS.fbYellow,
    };
    if (!validateThresholds(candidate)) value = candidate;
  } catch {
    // Pakai bawaan.
  }
  cache = { at: Date.now(), value };
  return value;
}
