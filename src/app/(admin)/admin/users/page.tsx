export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getDictionary } from "@/lib/i18n/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { UsersTable } from "@/components/admin/UsersTable";

/**
 * Keys that make up a "complete" employee profile. Mirrors the sections
 * the employee sees on their own dashboard ProfileCompletionCard so the
 * admin view shares one source of truth — if we ever add a new required
 * field there, add it here too.
 */
const PROFILE_COMPLETION_KEYS = [
  "full_name",
  "gender",
  "date_of_birth",
  "place_of_birth",
  "domisili_provinsi",
  "domisili_kota",
  "domisili_kecamatan",
  "domisili_kelurahan",
  "domisili_alamat",
  "asal_provinsi",
  "asal_kota",
  "asal_kecamatan",
  "asal_kelurahan",
  "asal_alamat",
  "business_unit",
  "job_role",
  "whatsapp_number",
  "npwp",
  "emergency_contact_name",
  "emergency_contact_whatsapp",
] as const;

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  // Select * is cheaper than maintaining a hand-rolled column list that
  // overlaps heavily with PROFILE_COMPLETION_KEYS anyway, and keeps the
  // generated Supabase types strongly-typed (`select(string[])` would
  // collapse to GenericStringError). The profiles row is small.
  const supabase = await createClient();
  const [{ data: profiles }, { data: locations }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("attendance_locations")
        .select("id, name")
        .order("name", { ascending: true }),
      supabase.from("employee_locations").select("employee_id, location_id"),
    ]);

  // Index assignments by employee so each row can pluck its own set in O(1).
  const assignmentsByEmployee = (assignments ?? []).reduce<Record<string, string[]>>(
    (acc, row) => {
      (acc[row.employee_id] ??= []).push(row.location_id);
      return acc;
    },
    {}
  );

  const rows = (profiles ?? []).map((p) => {
    // Profile is complete when every completion key is non-empty. Numbers
    // 0 and booleans false are not valid completion keys in our schema
    // (all of them are string-shaped), so a loose-truthy check is fine.
    const profileComplete = PROFILE_COMPLETION_KEYS.every((k) => {
      const v = (p as Record<string, unknown>)[k];
      return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
    });

    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: (p.role === "admin" ? "admin" : "employee") as "admin" | "employee",
      business_unit: p.business_unit ?? null,
      job_role: p.job_role ?? null,
      is_flexible_schedule: p.is_flexible_schedule ?? false,
      // Postgres TIME columns serialize as "HH:MM:SS" — trim to "HH:MM" so
      // <input type="time"> accepts them without normalizing (which would
      // mark the form dirty even before the admin touched anything).
      work_start_time: toHHMM(p.work_start_time) ?? "09:00",
      work_end_time: toHHMM(p.work_end_time) ?? "18:00",
      grace_period_min: p.grace_period_min ?? 15,
      profile_complete: profileComplete,
      assigned_location_ids: assignmentsByEmployee[p.id] ?? [],
      extra_work_enabled: p.extra_work_enabled ?? false,
    };
  });

  const { t } = await getDictionary();
  const subtitle =
    rows.length === 1
      ? t.adminUsers.pageSubtitleOne
      : t.adminUsers.pageSubtitleMany.replace("{n}", String(rows.length));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title={t.adminUsers.pageTitle} subtitle={subtitle} />
      <UsersTable
        rows={rows}
        currentUserId={user.id}
        allLocations={locations ?? []}
      />
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
