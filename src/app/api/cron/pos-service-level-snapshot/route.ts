/**
 * Cron harian: rekam Service Level tiap outlet POS yang mengaktifkannya.
 *
 * Dispatched Vercel Cron (vercel.json) `30 15 * * *` = 22:30 WIB — setelah
 * jam tutup default (21:00) supaya hari yang baru selesai tertangkap utuh.
 *
 * Idempoten: upsert per (rekening, tanggal). Tiap run juga menghitung
 * ulang beberapa hari terakhir supaya void/koreksi yang masuk keesokan
 * paginya ikut terserap.
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

    const { count, outlets, failed } = await runServiceLevelSnapshot({
      targetDate,
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
