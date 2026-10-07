import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { decideBlockingTasks } from "./gate";
import type { BlockingTask } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Task `open` milik `userId` yang memblokir sign out hari ini. Memakai
 * service-role karena dipanggil dari `checkOut()` yang sudah punya sesi
 * terotentikasi; userId datang dari sesi itu, bukan dari klien.
 */
export async function getBlockingTasks(userId: string): Promise<BlockingTask[]> {
  const db = createAdminClient() as any;
  const today = jakartaDateString(new Date());

  const { data: tasks } = await db
    .from("assigned_tasks")
    .select("id, title, status, current_round")
    .eq("assignee_id", userId)
    .eq("status", "open")
    // Tugas terjadwal (belum mulai) belum mewajibkan apa pun.
    .lte("start_date", today);
  if (!tasks || tasks.length === 0) return [];

  const ids = tasks.map((t: any) => t.id as string);
  const [{ data: items }, { data: completions }, { data: deferrals }] = await Promise.all([
    db
      .from("assigned_task_items")
      .select("id, task_id, title, sort_order")
      .in("task_id", ids)
      .order("sort_order", { ascending: true }),
    db
      .from("assigned_task_completions")
      .select("item_id, task_id, round, photo_path")
      .in("task_id", ids),
    db
      .from("assigned_task_deferrals")
      .select("task_id")
      .in("task_id", ids)
      .eq("for_date", today),
  ]);

  const deferred = new Set<string>((deferrals ?? []).map((d: any) => d.task_id));
  return decideBlockingTasks(
    tasks.map((t: any) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      items: (items ?? [])
        .filter((i: any) => i.task_id === t.id)
        .map((i: any) => ({ id: i.id, title: i.title })),
      doneItemIds: new Set<string>(
        (completions ?? [])
          .filter((c: any) => c.task_id === t.id && c.round === t.current_round && c.photo_path)
          .map((c: any) => c.item_id)
      ),
      deferredToday: deferred.has(t.id),
    }))
  );
}
