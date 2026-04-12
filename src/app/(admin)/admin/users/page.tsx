export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { UsersTable } from "@/components/admin/UsersTable";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  const rows = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: (p.role === "admin" ? "admin" : "employee") as "admin" | "employee",
    created_at: p.created_at ?? new Date().toISOString(),
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Users"
        subtitle={`${rows.length} account${rows.length === 1 ? "" : "s"} — delete removes auth + profile + attendance`}
      />
      <UsersTable rows={rows} currentUserId={user.id} />
    </div>
  );
}
