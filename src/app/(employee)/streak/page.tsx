export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentRole,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import {
  getMyStreak,
  getMyAttendanceDotGrid,
} from "@/lib/actions/attendance.actions";
import { StreakDetail } from "@/components/attendance/StreakDetail";

/**
 * Employee-only streak detail page. Read-only — shows current streak,
 * personal best, and a 30-day horizontal timeline. The hero-playful
 * banner replaces PageHeader for a premium playful look.
 */
export default async function StreakPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role === "admin") redirect("/admin/attendance");

  const [snapshot, grid, settings] = await Promise.all([
    getMyStreak(),
    getMyAttendanceDotGrid(30),
    getCachedAttendanceSettings(),
  ]);

  // Today in the attendance timezone for highlighting in the timeline.
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="space-y-5">
      <StreakDetail snapshot={snapshot} grid={grid} today={today} />
    </div>
  );
}
