import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, email, full_name, department, position } = body;

    if (!id || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await adminClient.from("profiles").upsert({
      id,
      email,
      full_name: full_name ?? "",
      department: department ?? "",
      position: position ?? "",
      role: "employee",
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
