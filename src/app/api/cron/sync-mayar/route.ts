/**
 * Cron harian: tarik transaksi Mayar untuk setiap rekening ber-bank
 * `mayar`. Dijadwalkan di vercel.json.
 *
 * Kenapa perlu jalan tiap hari meski transaksi lama tidak berubah:
 * Mayar baru melampirkan biaya (platform + channel) setelah transaksi
 * settle, dan settlement telat ±2–4 hari. Transaksi yang hari ini masih
 * `paid` sengaja TIDAK diimpor — ia akan masuk di run berikutnya, tetap
 * dengan tanggal transaksi aslinya. Jadi total suatu hari bisa terus
 * bertambah beberapa hari setelah tanggal itu lewat; itu perilaku yang
 * diharapkan, bukan bug.
 *
 * Autentikasi mengikuti cron lain: `Authorization: Bearer <CRON_SECRET>`,
 * fail-closed lewat `checkCronAuth`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { syncMayar } from "@/lib/actions/cashflow.actions";
import { checkCronAuth } from "@/lib/utils/cron-auth";

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  // Service-role client — cron tidak punya sesi user, jadi enumerasi
  // rekening lewat client yang bypass RLS. Server action-nya sendiri
  // tetap pakai client ber-RLS dan kita kirim `skipAuth: true`.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase service credentials not configured" },
      { status: 500 }
    );
  }
  const adminClient = createServiceClient<Database>(url, serviceKey);

  const { data: accounts } = await adminClient
    .from("bank_accounts")
    .select("id, account_name")
    .eq("bank", "mayar")
    .eq("is_active", true);

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    added?: number;
    skipped?: number;
    skippedUnsettled?: number;
    warnings?: string[];
    error?: string;
  }> = [];

  for (const acc of accounts ?? []) {
    const res = await syncMayar(acc.id, { skipAuth: true });
    if (res.ok) {
      results.push({
        id: acc.id,
        name: acc.account_name,
        ok: true,
        added: res.data!.added,
        skipped: res.data!.skipped,
        skippedUnsettled: res.data!.skippedUnsettled,
        warnings: res.data!.warnings,
      });
    } else {
      results.push({
        id: acc.id,
        name: acc.account_name,
        ok: false,
        error: res.error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    count: results.length,
    results,
  });
}
