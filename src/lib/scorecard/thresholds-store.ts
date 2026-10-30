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
