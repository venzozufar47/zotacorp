/**
 * POST /api/employment-contracts/upload
 *
 * Upload SATU gambar tanda tangan (PNG) ke bucket privat
 * `employment-contracts` dan kembalikan storage path.
 *   - kind=employee + contractId: karyawan upload TTD sendiri (atau admin).
 *     Path: `${contractId}/employee-signature-${uuid}.png`.
 *   - kind=employer + templateId: admin upload TTD Pemberi Kerja (sekali per
 *     BU). Path: `templates/${templateId}/employer-signature-${uuid}.png`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { contractNeedsSignature } from "@/lib/employment-contracts/types";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 3 * 1024 * 1024; // 3 MB — tanda tangan kecil.

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const role = await getCurrentRole();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body bukan form-data" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const kind = (formData.get("kind") as string | null)?.trim() ?? "";
  const id = (formData.get("id") as string | null)?.trim() ?? "";

  if (!file || !id || (kind !== "employee" && kind !== "employer"))
    return NextResponse.json({ error: "file, kind, id wajib" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Hanya PNG/JPEG/WebP" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Ukuran maks 3 MB" }, { status: 400 });

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let path: string;
  if (kind === "employer") {
    if (role !== "admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    path = `templates/${id}/employer-signature-${crypto.randomUUID()}.png`;
  } else {
    // Employee signature — verifikasi kontrak milik user (atau admin) & masih
    // butuh (tanda tangan / tanda tangan ulang). Kontrak yang direvisi admin
    // berstatus "signed" tapi signed_version < version → tetap boleh TTD ulang.
    const { data: c } = await admin
      .from("employment_contracts" as never)
      .select("user_id, status, version, signed_version")
      .eq("id", id)
      .maybeSingle();
    const row = c as unknown as {
      user_id: string;
      status: "draft" | "pending_signature" | "signed" | "terminated";
      version: number | null;
      signed_version: number | null;
    } | null;
    if (!row) return NextResponse.json({ error: "Kontrak tidak ada" }, { status: 404 });
    if (role !== "admin" && row.user_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!contractNeedsSignature(row))
      return NextResponse.json(
        { error: "Kontrak tidak dalam status menunggu tanda tangan" },
        { status: 409 }
      );
    path = `${id}/employee-signature-${crypto.randomUUID()}.png`;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("employment-contracts")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("employment-contracts upload error", uploadErr);
    return NextResponse.json({ error: "Gagal upload" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, path });
}
