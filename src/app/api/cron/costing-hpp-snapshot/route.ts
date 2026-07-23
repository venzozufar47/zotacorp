/**
 * Cron bulanan: ambil snapshot HPP semua produk costing (semua brand).
 *
 * Dispatched Vercel Cron (vercel.json) `0 18 1 * *` = tanggal 1 jam 01:00
 * WIB. Snapshot = histori HPP per produk per tanggal (untuk tren &
 * deteksi kenaikan HPP). Idempoten: upsert per (produk, tanggal).
 *
 * Auth: Bearer <CRON_SECRET> (checkCronAuth, fail-closed).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runHppSnapshotCapture } from "@/lib/costing/snapshot";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }
  try {
    const { count } = await runHppSnapshotCapture();
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    console.error("[costing-hpp-snapshot] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
