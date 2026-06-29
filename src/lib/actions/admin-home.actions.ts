"use server";

import { createAdminClient as adminClient } from "./_supabase-admin";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentRole,
  getCurrentUser,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { zonedDateString } from "@/lib/utils/celebrations";

/**
 * Live snapshot for the admin Home dashboard. All numbers are scoped
 * to "today" in the org timezone (defaults to Asia/Jakarta).
 *
 * Cheap aggregate — three small queries, all parallelized. Safe to call
 * on every page render; no expensive joins.
 */
export interface AdminHomeToday {
  totalEmployees: number;
  clockedInNow: ClockedInEmployee[];
  lateToday: number;
  posSalesToday: number;
  /** POS Haengbocake Pare — hari ini & akumulasi bulan ini (rupiah). */
  posHbcPareToday: number;
  posHbcPareMonth: number;
  /** Custom cake masuk BULAN INI per cabang, basis tanggal slip dibuat
   *  (created_at), bukan tanggal ambil. Rupiah. */
  cakeHbcPareMonth: number;
  cakeHbcSmgMonth: number;
  hourlyCheckIns: number[]; // 13 buckets covering 07:00 → 19:00
  asOfIso: string; // ISO timestamp the snapshot was taken
  todayIso: string; // yyyy-mm-dd in org tz
}

/** UTC range [start, end) untuk satu hari kalender di timezone `tz`. */
function tzDayRangeUtc(dateIso: string, tz: string): { startIso: string; endIso: string } {
  const assumed = new Date(`${dateIso}T00:00:00Z`);
  const utcWall = new Date(assumed.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzWall = new Date(assumed.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = tzWall.getTime() - utcWall.getTime();
  const start = new Date(assumed.getTime() - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export interface ClockedInEmployee {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  /** Unit kerja (Haengbocake Pare, Yeobo, dll). Null kalau profile
   *  belum di-set unit kerjanya — di-fallback ke "Lainnya" oleh UI. */
  businessUnit: string | null;
  status: string;
  checkedInAt: string;
  /** True once the employee has clocked out for the day (drives "off duty" styling on the Floor card). */
  checkedOut: boolean;
}

export async function getAdminHomeToday(): Promise<AdminHomeToday> {
  const role = await getCurrentRole();
  const empty: AdminHomeToday = {
    totalEmployees: 0,
    clockedInNow: [],
    lateToday: 0,
    posSalesToday: 0,
    posHbcPareToday: 0,
    posHbcPareMonth: 0,
    cakeHbcPareMonth: 0,
    cakeHbcSmgMonth: 0,
    hourlyCheckIns: Array(13).fill(0),
    asOfIso: new Date().toISOString(),
    todayIso: zonedDateString(new Date(), "Asia/Jakarta"),
  };
  if (role !== "admin") return empty;

  const supabase = await createClient();
  const settings = await getCachedAttendanceSettings();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const now = new Date();
  const todayIso = zonedDateString(now, tz);

  // Batas bulan kalender (zona org). POS pakai date string; cake pakai
  // created_at (timestamptz) → konversi batas bulan Jakarta ke instant UTC.
  const [yStr, mStr] = todayIso.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const monthStartDate = `${yStr}-${mStr}-01`;
  const nextMonthStartDate = `${ny}-${String(nm).padStart(2, "0")}-01`;
  const monthStartIso = tzDayRangeUtc(monthStartDate, tz).startIso;
  const monthEndIso = tzDayRangeUtc(nextMonthStartDate, tz).startIso;

  const cakeMonthQuery = (branch: string) =>
    // `cake_orders` belum ada di generated types (free_claim dst.) → cast
    // `as never` mengikuti konvensi codebase. Exclude batal/buang + klaim
    // gratis (tanpa pemasukan). "Masuk" = slip dibuat (created_at) BULAN INI.
    supabase
      .from("cake_orders" as never)
      .select("total_idr")
      .eq("branch", branch)
      .eq("free_claim", false)
      .not("status", "in", "(cancelled,discarded)")
      .gte("created_at", monthStartIso)
      .lt("created_at", monthEndIso);

  // POS Haengbocake Pare bisa >1000 baris/bulan → PostgREST cap default
  // 1000 row akan meng-undercount kalau di-sum langsung. Paginate.
  const sumPosPareTotal = async (range: {
    eqDate?: string;
    gte?: string;
    lt?: string;
  }): Promise<number> => {
    let total = 0;
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      let q = supabase
        .from("pos_sales")
        .select("total, bank_accounts!inner(business_unit, default_branch)")
        .is("voided_at", null)
        .eq("bank_accounts.business_unit", "Haengbocake")
        .eq("bank_accounts.default_branch", "Pare");
      if (range.eqDate) q = q.eq("sale_date", range.eqDate);
      if (range.gte) q = q.gte("sale_date", range.gte);
      if (range.lt) q = q.lt("sale_date", range.lt);
      const { data } = await q.range(offset, offset + PAGE - 1);
      const rows = (data ?? []) as { total: number | null }[];
      total += rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
      if (rows.length < PAGE) break;
    }
    return total;
  };

  const [
    employeesRes,
    todayLogsRes,
    posRes,
    cakePareRes,
    cakeSmgRes,
    posHbcPareToday,
    posHbcPareMonth,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .neq("role", "investor")
      .eq("payslip_excluded", false)
      .eq("is_active", true),
    supabase
      .from("attendance_logs")
      .select(
        "id, user_id, status, checked_in_at, checked_out_at, profiles!inner(full_name, avatar_url, avatar_seed, business_unit)"
      )
      .eq("date", todayIso),
    supabase
      .from("pos_sales")
      .select("total")
      .eq("sale_date", todayIso)
      .is("voided_at", null),
    cakeMonthQuery("pare"),
    cakeMonthQuery("semarang"),
    sumPosPareTotal({ eqDate: todayIso }),
    sumPosPareTotal({ gte: monthStartDate, lt: nextMonthStartDate }),
  ]);

  const totalEmployees = employeesRes.count ?? 0;
  const logs = (todayLogsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    status: string;
    checked_in_at: string;
    checked_out_at: string | null;
    profiles: {
      full_name: string | null;
      avatar_url: string | null;
      avatar_seed: string | null;
      business_unit: string | null;
    };
  }>;

  // All employees with a log today — Floor card shows checked-out ones
  // greyed out so admin sees the full day's roster, not just who's still
  // on duty. Sort: still-on-duty first, then by check-in time.
  const clockedInNow: ClockedInEmployee[] = logs
    .map((l) => ({
      userId: l.user_id,
      fullName: l.profiles.full_name ?? "(tanpa nama)",
      avatarUrl: l.profiles.avatar_url,
      avatarSeed: l.profiles.avatar_seed,
      businessUnit: l.profiles.business_unit,
      status: l.status,
      checkedInAt: l.checked_in_at,
      checkedOut: !!l.checked_out_at,
    }))
    .sort((a, b) => {
      if (a.checkedOut !== b.checkedOut) return a.checkedOut ? 1 : -1;
      return a.checkedInAt.localeCompare(b.checkedInAt);
    });

  const lateToday = logs.filter((l) => l.status === "late").length;

  const hourlyCheckIns = Array(13).fill(0) as number[];
  for (const l of logs) {
    const d = new Date(l.checked_in_at);
    const hourLocal = Number(
      d.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false })
    );
    const idx = hourLocal - 7;
    if (idx >= 0 && idx < hourlyCheckIns.length) hourlyCheckIns[idx]++;
  }

  const posSalesToday = (posRes.data ?? []).reduce(
    (s, r) => s + Number(r.total ?? 0),
    0
  );

  const sumIdr = (rows: { total_idr: number | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.total_idr ?? 0), 0);
  const cakeHbcPareMonth = sumIdr(
    cakePareRes.data as { total_idr: number | null }[] | null
  );
  const cakeHbcSmgMonth = sumIdr(
    cakeSmgRes.data as { total_idr: number | null }[] | null
  );
  // posHbcPareToday / posHbcPareMonth sudah dihitung (paginated) di atas.

  return {
    totalEmployees,
    clockedInNow,
    lateToday,
    posSalesToday,
    posHbcPareToday,
    posHbcPareMonth,
    cakeHbcPareMonth,
    cakeHbcSmgMonth,
    hourlyCheckIns,
    asOfIso: now.toISOString(),
    todayIso,
  };
}

/**
 * Floor snapshot untuk karyawan biasa — daftar siapa yang sudah
 * check-in hari ini (yang masih on-duty + yang sudah check-out).
 *
 * Sama shape dengan `clockedInNow` di `getAdminHomeToday`, tapi
 * tanpa gating role admin. Setiap karyawan yang sign-in boleh lihat
 * floor roster supaya tahu siapa yang sedang hadir di kantor.
 *
 * Pakai service-role client agar bisa baca attendance_logs +
 * profiles seluruh karyawan (RLS default: user hanya lihat log
 * sendiri, profiles only-own). Guard akses tetap di server action
 * (signed-in check), dan kolom yang dikembalikan ke client dibatasi
 * ke field aman: full_name, avatar_url, avatar_seed, status,
 * checkedInAt, checkedOut — tidak ada PII sensitif.
 */
export async function getFloorToday(): Promise<ClockedInEmployee[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = adminClient();
  const settings = await getCachedAttendanceSettings();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const todayIso = zonedDateString(new Date(), tz);

  const { data } = await supabase
    .from("attendance_logs")
    .select(
      "user_id, status, checked_in_at, checked_out_at, profiles!inner(full_name, avatar_url, avatar_seed, business_unit, is_active)"
    )
    .eq("date", todayIso)
    .eq("profiles.is_active", true);
  const logs = (data ?? []) as Array<{
    user_id: string;
    status: string;
    checked_in_at: string;
    checked_out_at: string | null;
    profiles: {
      full_name: string | null;
      avatar_url: string | null;
      avatar_seed: string | null;
      business_unit: string | null;
      is_active: boolean;
    };
  }>;

  return logs
    .map((l) => ({
      userId: l.user_id,
      fullName: l.profiles.full_name ?? "(tanpa nama)",
      avatarUrl: l.profiles.avatar_url,
      avatarSeed: l.profiles.avatar_seed,
      businessUnit: l.profiles.business_unit,
      status: l.status,
      checkedInAt: l.checked_in_at,
      checkedOut: !!l.checked_out_at,
    }))
    .sort((a, b) => {
      if (a.checkedOut !== b.checkedOut) return a.checkedOut ? 1 : -1;
      return a.checkedInAt.localeCompare(b.checkedInAt);
    });
}

// ─────────────────────────────────────────────────────────────────────
// Drawer: per-employee preview shown when admin clicks an employee chip
// on Home (Inbox row, Floor chip).
// ─────────────────────────────────────────────────────────────────────

export interface EmployeeDrawerActivity {
  id: string;
  date: string;
  status: string;
  checkedInAt: string;
  checkedOutAt: string | null;
}

export interface EmployeeDrawerData {
  /** Month-to-date stats — current calendar month in org tz. */
  onTimeRate: number; // 0..1
  presentDays: number;
  totalLogs: number;
  approvedOvertimeMinutes: number;
  /** Latest finalized payslip net total, IDR. Null if none yet. */
  latestPayslipNet: number | null;
  latestPayslipMonth: number | null;
  latestPayslipYear: number | null;
  /** Last 5 attendance logs, newest first. */
  recentActivity: EmployeeDrawerActivity[];
  /** Raw whatsapp_number from profile, null if none on file. */
  whatsappNumber: string | null;
}

export async function getEmployeeDrawerData(
  userId: string
): Promise<EmployeeDrawerData | null> {
  const role = await getCurrentRole();
  if (role !== "admin") return null;

  const supabase = await createClient();
  const settings = await getCachedAttendanceSettings();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const now = new Date();
  const todayIso = zonedDateString(now, tz);
  const [yyyy, mm] = todayIso.split("-");
  const monthStart = `${yyyy}-${mm}-01`;
  const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
  const monthEnd = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const [logsRes, recentRes, payslipRes, profileRes] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("status, overtime_minutes, overtime_status")
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    supabase
      .from("attendance_logs")
      .select("id, date, status, checked_in_at, checked_out_at")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("checked_in_at", { ascending: false })
      .limit(5),
    supabase
      .from("payslips")
      .select("net_total, month, year")
      .eq("user_id", userId)
      .eq("status", "finalized")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("whatsapp_number")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const logs = logsRes.data ?? [];
  const totalLogs = logs.length;
  const onTime = logs.filter(
    (l) => l.status === "on_time" || l.status === "flexible"
  ).length;
  const presentDays = logs.filter((l) => l.status !== "absent").length;
  const approvedOvertimeMinutes = logs.reduce(
    (s, l) =>
      s +
      (l.overtime_status === "approved" ? Number(l.overtime_minutes ?? 0) : 0),
    0
  );

  const recentActivity: EmployeeDrawerActivity[] = (recentRes.data ?? []).map(
    (l) => ({
      id: l.id,
      date: l.date,
      status: l.status,
      checkedInAt: l.checked_in_at,
      checkedOutAt: l.checked_out_at,
    })
  );

  const ps = payslipRes.data ?? null;

  return {
    onTimeRate: totalLogs === 0 ? 0 : onTime / totalLogs,
    presentDays,
    totalLogs,
    approvedOvertimeMinutes,
    latestPayslipNet: ps ? Number(ps.net_total) : null,
    latestPayslipMonth: ps?.month ?? null,
    latestPayslipYear: ps?.year ?? null,
    recentActivity,
    whatsappNumber: profileRes.data?.whatsapp_number ?? null,
  };
}

/**
 * Pending approvals for ONE employee — surfaced inside the admin Home
 * EmployeeDrawer so an admin can review + approve/reject every item for
 * that person in one place (not just the single inbox row they clicked).
 *
 * Two sources, same as the global inbox:
 *   - late_proof: attendance_logs with late_proof_status='pending' + a
 *     proof url. The approval target id is the attendance_logs.id
 *     (consumed by `reviewLateProof`).
 *   - overtime: overtime_requests with status='pending'. The approval
 *     target id is the overtime_requests.id (consumed by
 *     `reviewOvertimeRequest`) — NOT the attendance_logs.id.
 */
export type EmployeeApproval =
  | {
      kind: "late_proof";
      /** attendance_logs.id → reviewLateProof */
      id: string;
      date: string;
      lateMinutes: number;
      reason: string | null;
      hasProof: boolean;
    }
  | {
      kind: "overtime";
      /** overtime_requests.id → reviewOvertimeRequest */
      id: string;
      date: string;
      minutes: number;
      reason: string | null;
    };

export async function getEmployeeApprovals(
  userId: string
): Promise<EmployeeApproval[]> {
  const role = await getCurrentRole();
  if (role !== "admin" || !userId) return [];

  const supabase = await createClient();
  const [lateRes, otRes] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("id, date, late_minutes, late_proof_reason, late_proof_url")
      .eq("user_id", userId)
      .eq("late_proof_status", "pending")
      .not("late_proof_url", "is", null)
      .order("date", { ascending: false }),
    supabase
      .from("overtime_requests")
      .select("id, date, overtime_minutes, reason")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("date", { ascending: false }),
  ]);

  const out: EmployeeApproval[] = [];
  for (const r of lateRes.data ?? []) {
    out.push({
      kind: "late_proof",
      id: r.id,
      date: r.date,
      lateMinutes: Number(r.late_minutes ?? 0),
      reason: r.late_proof_reason ?? null,
      hasProof: Boolean(r.late_proof_url),
    });
  }
  for (const r of otRes.data ?? []) {
    out.push({
      kind: "overtime",
      id: r.id,
      date: r.date,
      minutes: Number(r.overtime_minutes ?? 0),
      reason: r.reason ?? null,
    });
  }
  // Newest first, late_proof before overtime on a date tie.
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "late_proof" ? -1 : 1;
    return 0;
  });
  return out;
}
