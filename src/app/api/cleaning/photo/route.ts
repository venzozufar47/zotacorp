import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/**
 * GET /api/cleaning/photo?completionId={id}
 *
 * Short-lived signed URL for a cleaning checklist evidence photo. The
 * `cleaning-photos` bucket is private; ownership (employee sees own, admin
 * sees all) is enforced here before minting the URL — same pattern as
 * /api/attendance/selfie. RLS on storage.objects also enforces this.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const completionId = req.nextUrl.searchParams.get("completionId");
  if (!completionId) {
    return NextResponse.json({ error: "Missing completionId" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("cleaning_task_completions")
    .select("id, user_id, photo_path")
    .eq("id", completionId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getCurrentRole();
  if (row.user_id !== user.id && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!row.photo_path) {
    return NextResponse.json({ error: "No photo for this item" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("cleaning-photos")
    .createSignedUrl(row.photo_path, 60);

  if (signErr || !signed) {
    return NextResponse.json(
      { error: signErr?.message ?? "Failed to sign" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
