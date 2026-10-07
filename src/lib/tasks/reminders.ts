import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendPushToUser } from "@/lib/push/web-push";
import { jakartaDateMinusDays, jakartaDateString } from "@/lib/utils/jakarta";
import {
  REMINDER_MAX_SHIFT_HOURS,
  isReminderDue,
  reminderCutoff,
  reminderText,
} from "./reminder-rules";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TaskReminderSummary {
  signedIn: number;
  candidates: number;
  claimed: number;
  users: number;
}

/**
 * Pengingat tugas tiap ~2 jam selama karyawan sign in, sampai tugasnya
 * dikirim. Dipicu cron per jam. Berhenti sendiri saat: tugas dikirim/
 * disetujui/dibatalkan, karyawan sign out, atau tugas ditunda untuk hari ini.
 *
 * Aman terhadap cron ganda: tiap tugas "diklaim" lewat UPDATE bersyarat
 * (last_reminded_at masih lama) dan push hanya dikirim untuk baris yang
 * berhasil diklaim.
 */
export async function runTaskReminders(now: Date = new Date()): Promise<TaskReminderSummary> {
  const db = createAdminClient() as any;
  const summary: TaskReminderSummary = { signedIn: 0, candidates: 0, claimed: 0, users: 0 };

  const today = jakartaDateString(now);
  const yesterday = jakartaDateMinusDays(today, 1);
  const earliestIn = new Date(now.getTime() - REMINDER_MAX_SHIFT_HOURS * 3600 * 1000);

  // Sedang sign in: ada baris hari ini/kemarin (shift lewat tengah malam)
  // tanpa checked_out_at, dan belum lewat batas shift wajar.
  const { data: logs } = await db
    .from("attendance_logs")
    .select("user_id")
    .in("date", [today, yesterday])
    .is("checked_out_at", null)
    .gte("checked_in_at", earliestIn.toISOString());
  const userIds: string[] = [...new Set<string>((logs ?? []).map((l: any) => l.user_id))];
  summary.signedIn = userIds.length;
  if (userIds.length === 0) return summary;

  const cutoffIso = reminderCutoff(now).toISOString();
  const dueFilter = `last_reminded_at.is.null,last_reminded_at.lte.${cutoffIso}`;

  const { data: tasks } = await db
    .from("assigned_tasks")
    .select("id, title, assignee_id, last_reminded_at")
    .eq("status", "open")
    .in("assignee_id", userIds)
    .or(dueFilter);
  const dueTasks = (tasks ?? []).filter((t: any) => isReminderDue(t.last_reminded_at, now));
  if (dueTasks.length === 0) return summary;

  // Tugas yang ditunda untuk hari ini tidak diingatkan lagi hari ini.
  const { data: deferrals } = await db
    .from("assigned_task_deferrals")
    .select("task_id")
    .in("task_id", dueTasks.map((t: any) => t.id))
    .eq("for_date", today);
  const deferred = new Set<string>((deferrals ?? []).map((d: any) => d.task_id));
  const candidates = dueTasks.filter((t: any) => !deferred.has(t.id));
  summary.candidates = candidates.length;

  const titlesByUser = new Map<string, string[]>();
  for (const t of candidates) {
    // Klaim atomik: hanya satu pemanggil yang lolos untuk (tugas, jendela) ini.
    const { data: claimed } = await db
      .from("assigned_tasks")
      .update({ last_reminded_at: now.toISOString() })
      .eq("id", t.id)
      .eq("status", "open")
      .or(dueFilter)
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    summary.claimed++;
    const list = titlesByUser.get(t.assignee_id) ?? [];
    list.push(t.title);
    titlesByUser.set(t.assignee_id, list);
  }

  // Satu push per karyawan walau punya beberapa tugas.
  for (const [userId, titles] of titlesByUser) {
    try {
      const { title, body } = reminderText(titles);
      await sendPushToUser(userId, { title, body, url: "/dashboard" });
      summary.users++;
    } catch (err) {
      console.error("[task-reminders] push failed:", err);
    }
  }
  return summary;
}
