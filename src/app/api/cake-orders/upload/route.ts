/**
 * POST /api/cake-orders/upload
 *
 * Uploads ONE reference image to the `cake-order-attachments` bucket
 * and returns the storage path. Called from the new-order form as the
 * user picks each photo, so order submission is just paths (no large
 * multipart body). The form passes the returned paths to
 * `createCakeOrder`, which writes the cake_order_attachments rows.
 *
 * Field is stamped into the path so admins can later distinguish e.g.
 * a colour reference from a payment proof when browsing storage.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getCurrentRole } from "@/lib/supabase/cached";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const VALID_FIELDS = new Set([
  "color",
  "texture",
  "decoration",
  "accessories",
  "payment_proof",
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Gate: admin OR has any cake_access_assignments row. We don't
  // require 'orders' specifically because production members may
  // upload images via slip edits in Phase 2.
  const role = await getCurrentRole();
  const adminClient = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  if (role !== "admin") {
    const { data: access } = await adminClient
      .from("cake_access_assignments" as never)
      .select("scope")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!access)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body bukan form-data" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  const field = (formData.get("field") as string | null)?.trim() ?? "";

  if (!file || !field)
    return NextResponse.json(
      { error: "file dan field wajib" },
      { status: 400 }
    );
  if (!VALID_FIELDS.has(field))
    return NextResponse.json({ error: "field tidak valid" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json(
      { error: "Hanya JPEG / PNG / WebP / HEIC" },
      { status: 400 }
    );
  if (file.size > MAX_SIZE)
    return NextResponse.json(
      { error: "Ukuran file maks 5 MB" },
      { status: 400 }
    );

  // Ekstensi dari MIME yang SUDAH tervalidasi, bukan dari file.name
  // kiriman user (audit 2026-07: nama file tak dipercaya).
  const MIME_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  const ext = MIME_EXT[file.type] ?? "bin";
  // Random uuid to prevent collisions when the same user uploads two
  // photos for the same field in quick succession (form is unsubmitted
  // so we don't have an order_id yet — we use 'pending/' as the root
  // and the action moves them into the order's folder on submit if we
  // ever decide to. For now the path is permanent).
  const uuid = crypto.randomUUID();
  const path = `pending/${user.id}/${field}/${uuid}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await adminClient.storage
    .from("cake-order-attachments")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("cake-order upload error", uploadErr);
    return NextResponse.json(
      { error: "Gagal upload ke storage" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    path,
    mimeType: file.type,
    sizeBytes: file.size,
  });
}
