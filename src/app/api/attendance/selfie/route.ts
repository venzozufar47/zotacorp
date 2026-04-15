import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/**
 * GET /api/attendance/selfie?logId={id}
 *
 * Returns a short-lived signed URL for the selfie attached to an
 * attendance log. The storage bucket is private; this route enforces
 * ownership (employee sees own, admin sees all) server-side before
 * minting the signed URL.
 *
 * RLS on `storage.objects` also enforces this, but we do the check here
 * too so we can return a clean 403 with a proper message instead of
 * leaking a signed URL to a bucket read that would 403 at fetch time.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logId = req.nextUrl.searchParams.get("logId");
  if (!logId) return NextResponse.json({ error: "Missing logId" }, { status: 400 });

  const supabase = await createClient();
  const { data: log, error } = await supabase
    .from("attendance_logs")
    .select("id, user_id, selfie_path")
    .eq("id", logId)
    .maybeSingle();

  if (error || !log) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getCurrentRole();
  if (log.user_id !== user.id && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!log.selfie_path) {
    return NextResponse.json({ error: "No selfie for this log" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("attendance-selfies")
    .createSignedUrl(log.selfie_path, 60);

  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? "Failed to sign" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
