/**
 * Cron harian: hitung ulang jumlah sesi foto Yeobo Space dari database
 * booking yeobospace.id.
 *
 * Dijadwalkan sesudah `sync-mayar` di vercel.json, bukan karena ada
 * ketergantungan data — keduanya menulis tabel yang berbeda — melainkan
 * supaya keduanya tidak berebut koneksi ke proyek yeobospace pada menit
 * yang sama.
 *
 * Hanya menyegarkan bulan berjalan + bulan lalu; bulan yang sudah dikunci
 * dilewati. Aman dijalankan berkali-kali: seluruh penulisan berupa upsert
 * pada kunci (cabang, studio, paket, tahun, bulan).
 *
 * `?dry=1` menghitung tanpa menulis apa pun — dipakai untuk membandingkan
 * hasil hitung terhadap angka yang sedang tampil sebelum mempercayainya.
 * `?months=N` melebarkan jangkauan ke belakang; bulan terkunci tetap tidak
 * tersentuh, jadi ini tidak bisa dipakai untuk merusak riwayat.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { checkCronAuth } from "@/lib/utils/cron-auth";
import { syncYeoboPhotoSessions } from "@/lib/yeobospace/session-sync";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase service credentials not configured" },
      { status: 500 }
    );
  }
  const admin = createServiceClient<Database>(url, serviceKey);

  const params = new URL(req.url).searchParams;
  const dryRun = params.get("dry") === "1";
  const monthsRaw = Number(params.get("months"));
  const months = Number.isFinite(monthsRaw) && monthsRaw > 0 ? monthsRaw : undefined;

  try {
    const result = await syncYeoboPhotoSessions(admin, { dryRun, months });
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      dryRun,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/sync-yeobo-sessions] gagal", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
