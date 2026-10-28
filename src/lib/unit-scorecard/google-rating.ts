import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Sb = SupabaseClient<Database>;

/** Place ID Google Maps tiap cabang Yeobo (sama dengan yang dipakai situs yeobospace.id). */
export const GOOGLE_PLACE_IDS: Record<string, string> = {
  yeobo_tlogosari: "ChIJWdN536-NcC4RxP4fD_LjXxY",
  yeobo_tembalang: "ChIJDzb3ghGPcC4Rd5Qq7cU0g6I",
  yeobo_jebres: "ChIJMVCbWhUXei4RPT6Y0QwjZlg",
};

/** Hanya minta rating dan jumlah ulasan: field mask sekecil mungkin supaya panggilan berbiaya serendah mungkin. */
const FIELD_MASK = "rating,userRatingCount";

/** Rating 1,0–5,0 dari respons Place Details (Places API v1), dibulatkan 1 desimal; null bila tidak valid. */
export function parsePlaceRating(json: unknown): number | null {
  const r = (json as { rating?: unknown } | null)?.rating;
  if (typeof r !== "number" || !Number.isFinite(r) || r < 1 || r > 5) return null;
  return Math.round(r * 10) / 10;
}

export async function fetchPlaceRating(placeId: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  return parsePlaceRating(await res.json());
}

export interface GoogleRatingSyncResult {
  unit: string;
  status: "saved" | "kept" | "failed";
  value?: number;
  error?: string;
}

/**
 * Simpan rating Google terkini sebagai nilai S6 bulan `monthIso` untuk tiap cabang Yeobo. Nilai yang sudah ada
 * (diisi manual, atau diambil otomatis sebelumnya) TIDAK ditimpa, jadi rating tersimpan sekali per bulan dan input
 * manual selalu menang. Rating Google adalah rata-rata terkini, bukan per bulan: ia diambil pada awal bulan berikutnya.
 */
export async function syncGoogleRatings(sb: Sb, monthIso: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<GoogleRatingSyncResult[]> {
  const codes = Object.keys(GOOGLE_PLACE_IDS);
  const { data: units, error } = await sb.from("scorecard_units" as never).select("id, code").in("code", codes);
  if (error) throw new Error(error.message);
  const out: GoogleRatingSyncResult[] = [];
  for (const u of (units ?? []) as unknown as { id: string; code: string }[]) {
    try {
      const { data: existing, error: exErr } = await sb
        .from("scorecard_manual_inputs" as never)
        .select("id")
        .eq("unit_id", u.id)
        .eq("month", monthIso)
        .eq("metric_code", "S6")
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (existing) {
        out.push({ unit: u.code, status: "kept" });
        continue;
      }
      const value = await fetchPlaceRating(GOOGLE_PLACE_IDS[u.code], apiKey, fetchImpl);
      if (value == null) throw new Error("Rating tidak ditemukan pada respons");
      const { error: insErr } = await sb
        .from("scorecard_manual_inputs" as never)
        .insert({ unit_id: u.id, month: monthIso, metric_code: "S6", value, entered_by: null } as never);
      if (insErr) throw new Error(insErr.message);
      out.push({ unit: u.code, status: "saved", value });
    } catch (e) {
      out.push({ unit: u.code, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
