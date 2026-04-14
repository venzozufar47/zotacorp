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
    .select(
      "id, email, full_name, role, created_at, is_flexible_schedule, work_start_time, work_end_time"
    )
    .order("created_at", { ascending: false });

  const rows = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: (p.role === "admin" ? "admin" : "employee") as "admin" | "employee",
    created_at: p.created_at ?? new Date().toISOString(),
    is_flexible_schedule: p.is_flexible_schedule ?? false,
    // Postgres TIME columns serialize as "HH:MM:SS" — trim to "HH:MM" so
    // <input type="time"> accepts them without normalizing (which would
    // mark the form dirty even before the admin touched anything).
    work_start_time: toHHMM(p.work_start_time) ?? "09:00",
    work_end_time: toHHMM(p.work_end_time) ?? "18:00",
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

/** Postgres TIME renders as "HH:MM:SS"; HTML <input type="time"> speaks
 *  "HH:MM". Normalize here so the value round-trips cleanly. */
function toHHMM(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : t;
}
