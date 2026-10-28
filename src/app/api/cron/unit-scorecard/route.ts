/**
 * Cron malam Scorecard Unit Bisnis: hitung ulang 3 bulan terakhir yang sudah berakhir (menangkap transaksi yang
 * terlambat dicatat). Versi baru hanya dibuat bila ada angka yang berubah. Jalan setelah sync Mayar/sesi Yeobo.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 * Manual: curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/unit-scorecard"
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { yeoboAdminClient } from "@/lib/supabase/yeobo-admin";
import { checkCronAuth } from "@/lib/utils/cron-auth";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { recentEndedMonths, refreshScorecard } from "@/lib/unit-scorecard/refresh";
import { syncGoogleRatings, type GoogleRatingSyncResult } from "@/lib/unit-scorecard/google-rating";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  try {
    const months = recentEndedMonths(jakartaDateString(new Date()), 3);
    const sb = createAdminClient();
    // Rating Google bulan terakhir yang sudah berakhir (diambil sebelum hitung ulang supaya langsung ikut). Gagal di sini
    // tidak boleh menghentikan hitung ulang scorecard.
    let googleRatings: GoogleRatingSyncResult[] | null = null;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    if (placesKey) {
      try {
        googleRatings = await syncGoogleRatings(sb, months[months.length - 1], placesKey);
      } catch (err) {
        console.error("[unit-scorecard] rating Google gagal", err);
      }
    }
    const results = await refreshScorecard(sb, yeoboAdminClient(), months, null, "Otomatis (malam)");
    revalidateTag("unit-scorecard-config", { expire: 0 });
    return NextResponse.json({ ok: true, results, googleRatings });
  } catch (err) {
    console.error("[unit-scorecard] failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
