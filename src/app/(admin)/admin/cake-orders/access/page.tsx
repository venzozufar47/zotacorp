export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listCakeAccessAssignments } from "@/lib/actions/cake-access.actions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { CakeAccessManager } from "@/components/admin/CakeAccessManager";

/**
 * Admin assigns 'orders' / 'production' scopes to specific employees.
 */
export default async function AdminCakeAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  // Pull profiles directly so we get avatar_url / avatar_seed too —
  // the lighter `getAllEmployees()` only returns id+name+email. Run
  // in parallel with the assignments fetch.
  const supabase = await createClient();
  const [{ data: profilesRaw }, accessRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, avatar_seed")
      .neq("role", "investor")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    listCakeAccessAssignments(),
  ]);
  const employees = (profilesRaw ?? []).map((e) => ({
    id: e.id,
    full_name: e.full_name ?? null,
    email: e.email ?? null,
    avatar_url: e.avatar_url ?? null,
    avatar_seed: e.avatar_seed ?? null,
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Akses Cake"
        subtitle="Karyawan yang ditunjuk untuk input order custom cake atau menerima slip produksi."
      />
      <CakeAccessManager
        initialAssignments={accessRes.ok ? accessRes.data ?? [] : []}
        employees={employees}
      />
    </div>
  );
}
