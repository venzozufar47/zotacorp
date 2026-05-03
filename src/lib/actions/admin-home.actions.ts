"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, getCachedAttendanceSettings } from "@/lib/supabase/cached";

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
  hourlyCheckIns: number[]; // 13 buckets covering 07:00 → 19:00
  asOfIso: string; // ISO timestamp the snapshot was taken
  todayIso: string; // yyyy-mm-dd in org tz
}

export interface ClockedInEmployee {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  status: string;
  checkedInAt: string;
}

export async function getAdminHomeToday(): Promise<AdminHomeToday> {
  const role = await getCurrentRole();
  const empty: AdminHomeToday = {
    totalEmployees: 0,
    clockedInNow: [],
    lateToday: 0,
    posSalesToday: 0,
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

  const [employeesRes, todayLogsRes, posRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("payslip_excluded", false),
    supabase
      .from("attendance_logs")
      .select(
        "id, user_id, status, checked_in_at, checked_out_at, profiles!inner(full_name, avatar_url, avatar_seed)"
      )
      .eq("date", todayIso),
    supabase
      .from("pos_sales")
      .select("total")
      .eq("sale_date", todayIso)
      .is("voided_at", null),
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
    };
  }>;

  const clockedInNow: ClockedInEmployee[] = logs
    .filter((l) => !l.checked_out_at)
    .map((l) => ({
      userId: l.user_id,
      fullName: l.profiles.full_name ?? "(tanpa nama)",
      avatarUrl: l.profiles.avatar_url,
      avatarSeed: l.profiles.avatar_seed,
      status: l.status,
      checkedInAt: l.checked_in_at,
    }));

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

  return {
    totalEmployees,
    clockedInNow,
    lateToday,
    posSalesToday,
    hourlyCheckIns,
    asOfIso: now.toISOString(),
    todayIso,
  };
}

function zonedDateString(d: Date, tz: string): string {
  // yyyy-mm-dd in the given timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}
