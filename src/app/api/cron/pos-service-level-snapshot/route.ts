/**
 * Cron harian: rekam Service Level tiap outlet POS yang mengaktifkannya.
 *
 * DUA JADWAL (vercel.json), keduanya menabrak route yang sama:
 *   `0 * * * *`     tiap jam, `?trailing=1` — menyegarkan HARI INI saja.
 *   `30 15 * * *`   22:30 WIB, trailing default 3 — menyerap koreksi
 *                   terlambat setelah toko tutup.
 *
 * Kenapa per jam: menghitung live ternyata ~3 detik berapa pun lebar
 * jendelanya (biayanya round-trip jaringan, bukan volume data), jadi
 * kartu di layar kasir TIDAK boleh menghitung live — layar itu yang
 * paling sering dibuka. Snapshot per jam membuatnya cukup baca satu
 * query, dan tidak ada informasi yang hilang karena metriknya memang
 * bergrid per jam.
 *
 * Idempoten: upsert per (rekening, tanggal).
 *
 * Auth: Bearer <CRON_SECRET> (checkCronAuth, fail-closed).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import {
  runServiceLevelSnapshot,
  resolveSnapshotTargetDate,
} from "@/lib/pos/service-level-snapshot";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }
  try {
    // `?date=YYYY-MM-DD` untuk menjalankan ulang hari tertentu secara
    // manual. Aman: route ini sudah di balik Bearer CRON_SECRET.
    const url = new URL(req.url);
    const override = url.searchParams.get("date");
    const targetDate =
      override && /^\d{4}-\d{2}-\d{2}$/.test(override)
        ? override
        : resolveSnapshotTargetDate(Date.now());

    const trailingRaw = Number(url.searchParams.get("trailing"));
    const trailingDays = Number.isFinite(trailingRaw) && trailingRaw > 0
      ? Math.min(90, Math.floor(trailingRaw))
      : undefined;

    const { count, outlets, failed } = await runServiceLevelSnapshot({
      targetDate,
      trailingDays,
      source: "cron",
    });
    // Kegagalan sebagian tetap 200 dengan daftar `failed` — outlet yang
    // berhasil sudah tersimpan, dan Vercel tidak perlu me-retry semuanya.
    return NextResponse.json({
      ok: failed.length === 0,
      targetDate,
      count,
      failed,
      outlets: outlets.map((o) => ({
        outlet: o.accountName,
        dates: o.datesWritten.length,
        ...(o.error ? { error: o.error } : {}),
      })),
    });
  } catch (err) {
    console.error("[pos-service-level-snapshot] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
