import { createAdminClient } from "@/lib/actions/_supabase-admin";
import type { Database } from "@/lib/supabase/types";
import { isProfileComplete } from "@/lib/profile/completion";
import { parseBreakWindows } from "@/lib/utils/break-windows";
import type { UserRow } from "@/components/admin/karyawan/schedule-controls";
import {
  deriveActions,
  deriveStage,
  parseIdDate,
  type ContractFacts,
  type ContractStatus,
  type EmployeeAction,
  type EmployeeFacts,
  type EmployeeStage,
} from "./lifecycle";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** Postgres TIME tampil "HH:MM:SS"; <input type="time"> butuh "HH:MM". */
export function toHHMM(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : t;
}

/** Bentuk baris yang dipakai komponen jadwal & toggle di `UsersTable`. */
export function toUserRow(p: ProfileRow, locationIds: string[]): UserRow {
  return {
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    avatar_url: p.avatar_url ?? null,
    avatar_seed: p.avatar_seed ?? null,
    role: p.role === "admin" ? "admin" : "employee",
    business_unit: p.business_unit ?? null,
    job_role: p.job_role ?? null,
    is_flexible_schedule: p.is_flexible_schedule ?? false,
    work_start_time: toHHMM(p.work_start_time) ?? "09:00",
    work_end_time: toHHMM(p.work_end_time) ?? "18:00",
    grace_period_min: p.grace_period_min ?? 15,
    workday_check_enabled: p.workday_check_enabled ?? false,
    workdays: p.workdays ?? 126,
    break_enabled: p.break_enabled ?? false,
    break_windows: parseBreakWindows(p.break_windows),
    holiday_bonus_enabled: p.holiday_bonus_enabled ?? false,
    profile_complete: isProfileComplete(p as Record<string, unknown>),
    assigned_location_ids: locationIds,
    payslip_excluded: p.payslip_excluded ?? false,
    is_probation: p.is_probation ?? false,
    is_active: p.is_active ?? true,
    resigned_at: p.resigned_at ?? null,
    resigned_by: p.resigned_by ?? null,
  };
}

export interface RosterEntry {
  profile: ProfileRow;
  locationIds: string[];
  facts: EmployeeFacts;
  stage: EmployeeStage;
  actions: EmployeeAction[];
}

/**
 * Semua karyawan (tanpa investor) beserta tahap dan tindakan terbukanya.
 * Pemanggil wajib sudah memastikan user adalah admin: klien service-role
 * melewati RLS.
 */
export async function loadRoster(opts?: { userId?: string }): Promise<RosterEntry[]> {
  const db = createAdminClient();
  const only = opts?.userId;

  let profilesQ = db.from("profiles").select("*").neq("role", "investor").order("full_name");
  if (only) profilesQ = profilesQ.eq("id", only);

  // Tabel di bawah belum semua ada di tipe hasil generate; baca sebagai `never`.
  const contractsQ = db
    .from("employment_contracts" as never)
    .select("user_id, status, ended_at, resign_notice_at, archived_at, created_at, fields")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const leaveQ = db.from("leave_requests").select("user_id").eq("status", "pending");
  const settingsQ = db.from("payslip_settings").select("user_id, is_finalized");
  const locQ = db.from("employee_locations").select("employee_id, location_id");
  const issueQ = db
    .from("payslips")
    .select("user_id")
    .eq("employee_response", "issue")
    .is("admin_issue_reply", null);
  const offQ = db.from("offboarding_checklists").select("id, user_id").order("created_at", { ascending: false });

  const [
    { data: profiles },
    { data: contracts },
    { data: leaves },
    { data: settings },
    { data: locs },
    { data: offs },
    { data: issues },
  ] =
    await Promise.all([
      profilesQ,
      only ? contractsQ.eq("user_id" as never, only as never) : contractsQ,
      only ? leaveQ.eq("user_id", only) : leaveQ,
      only ? settingsQ.eq("user_id", only) : settingsQ,
      only ? locQ.eq("employee_id", only) : locQ,
      only ? offQ.eq("user_id", only) : offQ,
      only ? issueQ.eq("user_id", only) : issueQ,
    ]);

  const offRows = (offs ?? []) as { id: string; user_id: string }[];
  const { data: offItems } = offRows.length
    ? await db.from("offboarding_manual_items").select("checklist_id, done").in(
        "checklist_id",
        offRows.map((o) => o.id)
      )
    : { data: [] as { checklist_id: string; done: boolean }[] };

  const contractByUser = new Map<string, ContractFacts>();
  for (const c of (contracts ?? []) as unknown as {
    user_id: string;
    status: ContractStatus;
    ended_at: string | null;
    resign_notice_at: string | null;
    fields: Record<string, string> | null;
  }[]) {
    if (!contractByUser.has(c.user_id)) {
      contractByUser.set(c.user_id, {
        status: c.status,
        endedAt: c.ended_at,
        resignNoticeAt: c.resign_notice_at,
        termEndsOn: parseIdDate(c.fields?.tgl_berakhir),
      });
    }
  }

  const leaveCount = new Map<string, number>();
  for (const l of leaves ?? []) leaveCount.set(l.user_id, (leaveCount.get(l.user_id) ?? 0) + 1);

  const issueCount = new Map<string, number>();
  for (const i of issues ?? []) issueCount.set(i.user_id, (issueCount.get(i.user_id) ?? 0) + 1);

  const finalByUser = new Map((settings ?? []).map((s) => [s.user_id, !!s.is_finalized]));

  const locsByUser = new Map<string, string[]>();
  for (const l of locs ?? []) {
    const arr = locsByUser.get(l.employee_id) ?? [];
    arr.push(l.location_id);
    locsByUser.set(l.employee_id, arr);
  }

  // Checklist terbaru per karyawan saja; resign-aktifkan-resign bisa membuat lebih dari satu.
  const latestOffByUser = new Map<string, string>();
  for (const o of offRows) if (!latestOffByUser.has(o.user_id)) latestOffByUser.set(o.user_id, o.id);
  const offTally = new Map<string, { total: number; done: number }>();
  for (const i of offItems ?? []) {
    const t = offTally.get(i.checklist_id) ?? { total: 0, done: 0 };
    t.total += 1;
    if (i.done) t.done += 1;
    offTally.set(i.checklist_id, t);
  }

  const now = new Date();
  return (profiles ?? []).map((p) => {
    const offId = latestOffByUser.get(p.id);
    const facts: EmployeeFacts = {
      isAdmin: p.role === "admin",
      isActive: p.is_active ?? true,
      isProbation: p.is_probation ?? false,
      joinedAt: p.first_day_of_work ?? p.created_at,
      resignedAt: p.resigned_at ?? null,
      profileComplete: isProfileComplete(p as Record<string, unknown>),
      locationCount: locsByUser.get(p.id)?.length ?? 0,
      payslipIncluded: !(p.payslip_excluded ?? false),
      payslipSettingsFinal: finalByUser.get(p.id) ?? false,
      contract: contractByUser.get(p.id) ?? null,
      offboarding: offId ? offTally.get(offId) ?? { total: 0, done: 0 } : null,
      pendingLeave: leaveCount.get(p.id) ?? 0,
      openPayslipIssues: issueCount.get(p.id) ?? 0,
    };
    return {
      profile: p,
      locationIds: locsByUser.get(p.id) ?? [],
      facts,
      stage: deriveStage(facts, now),
      actions: deriveActions(facts, now),
    };
  });
}
