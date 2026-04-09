import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  const payload = await req.json();
  const user = payload.record;

  if (!user?.id) {
    return new Response("No user record", { status: 400 });
  }

  const metadata = user.raw_user_meta_data ?? {};

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? "",
    full_name: metadata.full_name ?? "",
    department: metadata.department ?? "",
    position: metadata.position ?? "",
    role: "employee",
    is_active: true,
  });

  if (error) {
    console.error("Failed to create profile:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
