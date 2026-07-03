import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, full_name, role } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    // Validasi minimal (audit 2026-07): endpoint publik, jangan terima
    // input sembarangan.
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password minimal 8 karakter" },
        { status: 400 }
      );
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
        return NextResponse.json(
          { error: "An admin account already exists. Contact the existing admin." },
          { status: 409 }
        );
      }
    }

    // Create user server-side with admin API — email_confirm: true means
    // the user is pre-confirmed and Supabase sends NO confirmation email
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (authError) {
      console.error("Auth create user error:", authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const userId = authData.user.id;

    // Audit 2026-07: registrasi publik → akun baru TIDAK aktif sampai
    // admin mengaktifkan dari tab Pengguna (middleware is_active memblokir
    // login akun nonaktif). Pengecualian: bootstrap admin PERTAMA (sudah
    // lolos single-admin check di atas) tetap aktif — tanpa ini tidak ada
    // siapa pun yang bisa mengaktifkan akun.
    const isBootstrapAdmin = role === "admin";
    const { error } = await adminClient.from("profiles").upsert({
      id: userId,
      email,
      full_name: full_name ?? "",
      department: "",
      position: "",
      role: isBootstrapAdmin ? "admin" : "employee",
      is_active: isBootstrapAdmin,
    });

    if (error) {
      console.error("Profile upsert error:", error);
      // Clean up the auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // pendingActivation memberi tahu client agar TIDAK auto sign-in dan
    // menampilkan notice "menunggu aktivasi admin".
    return NextResponse.json({
      ok: true,
      userId,
      pendingActivation: !isBootstrapAdmin,
    });
  } catch (err) {
    console.error("Profile create route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
