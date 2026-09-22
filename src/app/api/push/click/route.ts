import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/actions/_supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Dipanggil oleh service worker (public/sw.js, event `notificationclick`)
 * setiap kali user mengetuk sebuah push notification. Tidak ada auth gate
 * yang berarti di sini SENGAJA — request datang dari SW yang mungkin
 * tidak punya cookie sesi segar (mis. notifikasi diketuk sebelum app
 * dibuka lagi), jadi kita percaya `endpoint` (bukan session) sebagai
 * identitas: endpoint sudah unik per device di `push_subscriptions`, dan
 * cuma dipakai utk update `last_clicked_at` — tidak membocorkan/mengubah
 * data lain. Selalu balas 200 (fire-and-forget dari SW, tidak ada retry).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
    if (!endpoint) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const supabase = createAdminClient();
    await supabase
      .from("push_subscriptions")
      .update({ last_clicked_at: new Date().toISOString() })
      .eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
