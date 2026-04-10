import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const logId = request.nextUrl.searchParams.get("logId");
    if (!logId) {
      return NextResponse.json({ error: "logId is required" }, { status: 400 });
    }

    // Verify the caller is the owner or an admin
    const { data: log } = await supabase
      .from("attendance_logs")
      .select("user_id, late_proof_url")
      .eq("id", logId)
      .single();

    if (!log || !log.late_proof_url) {
      return NextResponse.json({ error: "Proof not found" }, { status: 404 });
    }

    if (log.user_id !== user.id) {
      // Check if admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const adminClient = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await adminClient.storage
      .from("late-proofs")
      .createSignedUrl(log.late_proof_url, 3600); // 1 hour

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: "Failed to generate signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error("Proof route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
