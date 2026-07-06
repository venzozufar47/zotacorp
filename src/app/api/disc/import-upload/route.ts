/**
 * POST /api/disc/import-upload
 *
 * Admin upload SATU PDF hasil DISC Frexor ke bucket privat `disc-imports`,
 * lalu parse text layer + best-effort angka grafik untuk prefill dialog
 * import. Menyimpan hasil ke DB dilakukan terpisah lewat server action
 * `importDiscResult` setelah admin review.
 *
 * Response: { ok, path, parsed } — `parsed` = FrexorParsed (boleh sebagian
 * null; admin lengkapi manual di dialog).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { parseFrexorText } from "@/lib/disc/import-parse";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const role = await getCurrentRole();
  if (role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body bukan form-data" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file wajib" }, { status: 400 });
  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "Hanya PDF" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Ukuran maks 5 MB" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Parse dulu (best-effort) — jangan gagalkan upload kalau parser error.
  let parsed = null;
  try {
    parsed = await parseFrexorText(bytes);
  } catch (err) {
    console.error("[disc] parse import PDF failed", err);
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const path = `imports/${crypto.randomUUID()}.pdf`;
  const { error: uploadErr } = await admin.storage
    .from("disc-imports")
    .upload(path, Buffer.from(bytes), {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadErr) {
    console.error("[disc] disc-imports upload error", uploadErr);
    return NextResponse.json({ error: "Gagal upload" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path, parsed });
}
