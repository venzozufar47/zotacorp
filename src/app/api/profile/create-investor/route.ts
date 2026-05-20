import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Self-serve registrasi investor. Buat auth user + profile dengan
 * role='investor'. Tidak insert assignment apa pun — investor masuk
 * dashboard dengan state "menunggu admin assignment" sampai admin
 * meng-attach unit bisnis dari /admin/investors.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, full_name, company } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: "investor", company },
      });

    if (authError) {
      console.error("[create-investor] auth error", authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const userId = authData.user.id;

    const { error } = await adminClient.from("profiles").upsert({
      id: userId,
      email,
      full_name: full_name ?? "",
      department: "",
      position: company ?? "",
      role: "investor",
      is_active: true,
    });

    if (error) {
      console.error("[create-investor] profile error", error);
      await adminClient.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    console.error("[create-investor] route error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
