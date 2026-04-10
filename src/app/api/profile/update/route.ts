import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

const ALLOWED_FIELDS = [
  "full_name",
  "nickname",
  "business_unit",
  "job_role",
  "gender",
  "date_of_birth",
  "place_of_birth",
  "current_city",
  "whatsapp_number",
  "npwp",
  "emergency_contact_name",
  "emergency_contact_whatsapp",
  "first_day_of_work",
  "motto",
  "shirt_size",
] as const;

function sanitize(body: Record<string, unknown>): ProfileUpdate {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      const v = body[key];
      out[key] = v === "" ? null : v;
    }
  }
  return out as ProfileUpdate;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetId, ...fields } = body;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Determine whose profile is being updated
    const profileId: string = targetId ?? user.id;

    // If editing someone else, caller must be admin
    if (profileId !== user.id) {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (callerProfile?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const clean = sanitize(fields);

    // Use service role so admin edits bypass RLS and self-edits work without
    // needing a broader UPDATE policy.
    const adminClient = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await adminClient
      .from("profiles")
      .update({ ...clean, updated_at: new Date().toISOString() })
      .eq("id", profileId);

    if (error) {
      console.error("Profile update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Profile update route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
