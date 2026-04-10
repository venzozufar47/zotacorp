import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, email, full_name, role } = body;

    if (!id || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Enforce single-admin rule: if requesting admin role, reject when one exists
    if (role === "admin") {
      const { count } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if ((count ?? 0) > 0) {
        // Roll back the auth user we just created so the email is free to try again
        await adminClient.auth.admin.deleteUser(id);
        return NextResponse.json(
          { error: "An admin account already exists. Contact the existing admin." },
          { status: 409 }
        );
      }
    }

    // Auto-confirm email so user can sign in immediately (no email verification flow)
    const { error: confirmError } = await adminClient.auth.admin.updateUserById(id, {
      email_confirm: true,
    });

    if (confirmError) {
      console.error("Email confirm error:", confirmError);
      return NextResponse.json({ error: confirmError.message }, { status: 500 });
    }

    const { error } = await adminClient.from("profiles").upsert({
      id,
      email,
      full_name: full_name ?? "",
      department: "",
      position: "",
      role: role === "admin" ? "admin" : "employee",
      is_active: true,
    });

    if (error) {
      console.error("Profile upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Profile create route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
