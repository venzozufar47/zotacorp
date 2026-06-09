"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentRole,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { isWorkdayFor, jakartaDayOfWeek } from "@/lib/utils/workdays";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CleaningItem {
  id: string;
  title: string;
  note: string | null;
  requires_photo: boolean;
  sort_order: number;
  reference_photo_path: string | null;
}

export interface CleaningChecklist {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  items: CleaningItem[];
}

export interface CleaningAssignmentRow {
  id: string;
  checklist_id: string;
  checklist_name: string;
  user_id: string;
  user_name: string;
  business_unit: string | null;
  weekdays: number;
  block_checkout: boolean;
  is_active: boolean;
}

export interface TodayTaskItem extends CleaningItem {
  completion: {
    id: string;
    photo_path: string | null;
    completed_at: string;
    note: string | null;
  } | null;
}

export interface TodayTask {
  assignment_id: string;
  checklist_id: string;
  checklist_name: string;
  block_checkout: boolean;
  items: TodayTaskItem[];
}

export interface TodayCleaningTasks {
  date: string;
  /** True only when the user has an open check-in today (checked in, not out). */
  checked_in: boolean;
  tasks: TodayTask[];
}

export interface BlockingChecklist {
  checklist_name: string;
  remaining: string[];
}

export interface MonitorItem {
  id: string;
  title: string;
  requires_photo: boolean;
  completed: boolean;
  photo_path: string | null;
  completion_id: string | null;
  completed_at: string | null;
}

export interface MonitorRow {
  assignment_id: string;
  user_id: string;
  user_name: string;
  business_unit: string | null;
  checklist_name: string;
  block_checkout: boolean;
  total_items: number;
  completed_items: number;
  photo_missing: number;
  is_exception: boolean;
  items: MonitorItem[];
}

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true };
}

async function getTimezone(): Promise<string> {
  const settings = await getCachedAttendanceSettings();
  return settings?.timezone ?? "Asia/Jakarta";
}

// ---------------------------------------------------------------------------
// Admin: checklist templates + items
// ---------------------------------------------------------------------------

export async function listChecklists(): Promise<CleaningChecklist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_checklists")
    .select(
      "id, name, description, is_active, items:cleaning_checklist_items(id, title, note, requires_photo, sort_order, reference_photo_path)"
    )
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    is_active: c.is_active,
    items: (c.items ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((it) => ({
        id: it.id,
        title: it.title,
        note: it.note,
        requires_photo: it.requires_photo,
        sort_order: it.sort_order,
        reference_photo_path: it.reference_photo_path,
      })),
  }));
}

export async function createChecklist(input: {
  name: string;
  description?: string;
}): Promise<{ ok: true; id: string } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const name = input.name?.trim();
  if (!name) return { error: "Nama checklist wajib diisi." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_checklists")
    .insert({ name, description: input.description?.trim() || null })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Gagal membuat checklist." };
  revalidatePath("/admin/cleaning");
  return { ok: true, id: data.id };
}

export async function updateChecklist(input: {
  id: string;
  name?: string;
  description?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const patch: {
    name?: string;
    description?: string | null;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { error: "Nama checklist tidak boleh kosong." };
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_checklists")
    .update(patch)
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function setChecklistActive(input: {
  id: string;
  is_active: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_checklists")
    .update({ is_active: input.is_active, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function deleteChecklist(input: {
  id: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_checklists")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function addChecklistItem(input: {
  checklist_id: string;
  title: string;
  note?: string;
  requires_photo?: boolean;
  reference_photo_path?: string | null;
}): Promise<{ ok: true; id: string } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const title = input.title?.trim();
  if (!title) return { error: "Judul item wajib diisi." };
  const supabase = await createClient();
  // Append to the end: next sort_order = current max + 1.
  const { data: existing } = await supabase
    .from("cleaning_checklist_items")
    .select("sort_order")
    .eq("checklist_id", input.checklist_id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("cleaning_checklist_items")
    .insert({
      checklist_id: input.checklist_id,
      title,
      note: input.note?.trim() || null,
      requires_photo: input.requires_photo ?? true,
      reference_photo_path: input.reference_photo_path ?? null,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Gagal menambah item." };
  revalidatePath("/admin/cleaning");
  return { ok: true, id: data.id };
}

export async function updateChecklistItem(input: {
  id: string;
  title?: string;
  note?: string | null;
  requires_photo?: boolean;
  reference_photo_path?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const patch: {
    title?: string;
    note?: string | null;
    requires_photo?: boolean;
    reference_photo_path?: string | null;
  } = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { error: "Judul item tidak boleh kosong." };
    patch.title = title;
  }
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.requires_photo !== undefined) patch.requires_photo = input.requires_photo;
  if (input.reference_photo_path !== undefined)
    patch.reference_photo_path = input.reference_photo_path;
  if (Object.keys(patch).length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_checklist_items")
    .update(patch)
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function deleteChecklistItem(input: {
  id: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_checklist_items")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function reorderItems(input: {
  ordered_ids: string[];
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  // Sequential lightweight updates — item lists are short.
  for (let i = 0; i < input.ordered_ids.length; i++) {
    const { error } = await supabase
      .from("cleaning_checklist_items")
      .update({ sort_order: i })
      .eq("id", input.ordered_ids[i]);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: assignments
// ---------------------------------------------------------------------------

export async function listAssignments(): Promise<CleaningAssignmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_assignments")
    .select(
      "id, checklist_id, user_id, weekdays, block_checkout, is_active, checklist:cleaning_checklists(name), profile:profiles(full_name, business_unit)"
    )
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((a) => {
    const checklist = a.checklist as { name?: string } | null;
    const profile = a.profile as { full_name?: string; business_unit?: string | null } | null;
    return {
      id: a.id,
      checklist_id: a.checklist_id,
      checklist_name: checklist?.name ?? "—",
      user_id: a.user_id,
      user_name: profile?.full_name ?? "—",
      business_unit: profile?.business_unit ?? null,
      weekdays: a.weekdays,
      block_checkout: a.block_checkout,
      is_active: a.is_active,
    };
  });
}

export async function assignChecklist(input: {
  checklist_id: string;
  user_id: string;
  weekdays: number;
  block_checkout: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  if (!input.checklist_id || !input.user_id) {
    return { error: "Checklist dan karyawan wajib dipilih." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("cleaning_assignments").insert({
    checklist_id: input.checklist_id,
    user_id: input.user_id,
    weekdays: input.weekdays,
    block_checkout: input.block_checkout,
  });
  if (error) {
    if (error.code === "23505")
      return { error: "Checklist ini sudah di-assign ke karyawan tersebut." };
    return { error: error.message };
  }
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function updateAssignment(input: {
  id: string;
  weekdays?: number;
  block_checkout?: boolean;
  is_active?: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const patch: {
    weekdays?: number;
    block_checkout?: boolean;
    is_active?: boolean;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };
  if (input.weekdays !== undefined) patch.weekdays = input.weekdays;
  if (input.block_checkout !== undefined) patch.block_checkout = input.block_checkout;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_assignments")
    .update(patch)
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function deleteAssignment(input: {
  id: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Employee: today's tasks + completion
// ---------------------------------------------------------------------------

export async function getTodayCleaningTasks(): Promise<TodayCleaningTasks> {
  const user = await getCurrentUser();
  const tz = await getTimezone();
  const now = new Date();
  const today = jakartaDateString(now);
  const dow = jakartaDayOfWeek(now, tz);
  const empty: TodayCleaningTasks = { date: today, checked_in: false, tasks: [] };
  if (!user) return empty;

  const supabase = await createClient();
  const [{ data: assignments }, { data: log }, { data: completions }] =
    await Promise.all([
      supabase
        .from("cleaning_assignments")
        .select(
          "id, checklist_id, weekdays, block_checkout, checklist:cleaning_checklists!inner(id, name, is_active, items:cleaning_checklist_items(id, title, note, requires_photo, sort_order, reference_photo_path))"
        )
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase
        .from("attendance_logs")
        .select("id, checked_in_at, checked_out_at")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle(),
      supabase
        .from("cleaning_task_completions")
        .select("id, item_id, photo_path, completed_at, note")
        .eq("user_id", user.id)
        .eq("date", today),
    ]);

  const checkedIn = !!log?.checked_in_at && !log?.checked_out_at;
  const compByItem = new Map(
    (completions ?? []).map((c) => [c.item_id, c])
  );

  const tasks: TodayTask[] = (assignments ?? [])
    .filter((a) => isWorkdayFor(a.weekdays, dow))
    .map((a) => {
      const checklist = a.checklist as {
        id: string;
        name: string;
        is_active: boolean;
        items: CleaningItem[];
      };
      return { a, checklist };
    })
    .filter((x) => x.checklist?.is_active)
    .map(({ a, checklist }) => ({
      assignment_id: a.id,
      checklist_id: checklist.id,
      checklist_name: checklist.name,
      block_checkout: a.block_checkout,
      items: (checklist.items ?? [])
        .slice()
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((it) => {
          const comp = compByItem.get(it.id);
          return {
            id: it.id,
            title: it.title,
            note: it.note,
            requires_photo: it.requires_photo,
            sort_order: it.sort_order,
            reference_photo_path: it.reference_photo_path,
            completion: comp
              ? {
                  id: comp.id,
                  photo_path: comp.photo_path,
                  completed_at: comp.completed_at,
                  note: comp.note,
                }
              : null,
          };
        }),
    }));

  return { date: today, checked_in: checkedIn, tasks };
}

export async function completeCleaningItem(input: {
  assignment_id: string;
  item_id: string;
  photo_path?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Tidak terautentikasi." };
  const today = jakartaDateString(new Date());
  const supabase = await createClient();

  // Must have an open check-in today — evidence is only meaningful during the
  // shift (mirrors the breakOut guard).
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("checked_in_at, checked_out_at")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();
  if (!log?.checked_in_at) {
    return { error: "Anda harus check in dulu sebelum mengisi checklist." };
  }
  if (log.checked_out_at) {
    return { error: "Anda sudah check out hari ini." };
  }

  // Verify the item is part of the assignment (and the assignment is the
  // employee's own) and read requires_photo for the evidence guard.
  const { data: item } = await supabase
    .from("cleaning_checklist_items")
    .select("id, requires_photo, checklist_id")
    .eq("id", input.item_id)
    .maybeSingle();
  if (!item) return { error: "Item checklist tidak ditemukan." };

  const { data: assignment } = await supabase
    .from("cleaning_assignments")
    .select("id, checklist_id, user_id")
    .eq("id", input.assignment_id)
    .maybeSingle();
  if (!assignment || assignment.user_id !== user.id) {
    return { error: "Assignment tidak valid." };
  }
  if (assignment.checklist_id !== item.checklist_id) {
    return { error: "Item tidak termasuk dalam checklist ini." };
  }

  if (item.requires_photo && !input.photo_path) {
    return { error: "Item ini wajib menyertakan foto bukti." };
  }

  const { error } = await supabase.from("cleaning_task_completions").upsert(
    {
      user_id: user.id,
      assignment_id: input.assignment_id,
      item_id: input.item_id,
      date: today,
      photo_path: input.photo_path ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      note: input.note?.trim() || null,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id,date" }
  );
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uncompleteCleaningItem(input: {
  item_id: string;
}): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Tidak terautentikasi." };
  const today = jakartaDateString(new Date());
  const supabase = await createClient();
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("checked_out_at")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();
  if (log?.checked_out_at) {
    return { error: "Anda sudah check out hari ini." };
  }
  const { error } = await supabase
    .from("cleaning_task_completions")
    .delete()
    .eq("user_id", user.id)
    .eq("item_id", input.item_id)
    .eq("date", today);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Checkout gate. Returns the list of block_checkout checklists that are
 * scheduled for today (the current user's session) and not yet fully done.
 * Empty array → checkout allowed. Resolves the current user from session
 * itself (no params) so it can't be used to probe another employee.
 */
export async function getBlockingCleaning(): Promise<BlockingChecklist[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const tz = await getTimezone();
  const now = new Date();
  const today = jakartaDateString(now);
  const dow = jakartaDayOfWeek(now, tz);
  const supabase = await createClient();

  const [{ data: assignments }, { data: completions }] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select(
        "id, weekdays, checklist:cleaning_checklists!inner(name, is_active, items:cleaning_checklist_items(id, title, sort_order))"
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("block_checkout", true),
    supabase
      .from("cleaning_task_completions")
      .select("item_id")
      .eq("user_id", user.id)
      .eq("date", today),
  ]);

  const doneItems = new Set((completions ?? []).map((c) => c.item_id));
  const blocking: BlockingChecklist[] = [];

  for (const a of assignments ?? []) {
    if (!isWorkdayFor(a.weekdays, dow)) continue;
    const checklist = a.checklist as {
      name: string;
      is_active: boolean;
      items: { id: string; title: string; sort_order: number }[];
    };
    if (!checklist?.is_active) continue;
    const items = (checklist.items ?? [])
      .slice()
      .sort((x, y) => x.sort_order - y.sort_order);
    if (items.length === 0) continue;
    const remaining = items.filter((it) => !doneItems.has(it.id)).map((it) => it.title);
    if (remaining.length > 0) {
      blocking.push({ checklist_name: checklist.name, remaining });
    }
  }
  return blocking;
}

// ---------------------------------------------------------------------------
// Admin: monitoring (management by exception)
// ---------------------------------------------------------------------------

export async function getCleaningMonitor(input?: {
  date?: string;
}): Promise<{ date: string; rows: MonitorRow[] }> {
  const gate = await requireAdmin();
  const tz = await getTimezone();
  const now = new Date();
  const date = input?.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : jakartaDateString(now);
  if (!gate.ok) return { date, rows: [] };

  // Weekday of the selected date (midday avoids any DST/edge in tz mapping).
  const dow = jakartaDayOfWeek(new Date(`${date}T12:00:00`), tz);
  const supabase = await createClient();

  const [{ data: assignments }, { data: completions }] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select(
        "id, user_id, weekdays, block_checkout, checklist:cleaning_checklists!inner(name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order)), profile:profiles!inner(full_name, business_unit, is_active)"
      )
      .eq("is_active", true),
    supabase
      .from("cleaning_task_completions")
      .select("item_id, user_id, photo_path, completed_at, id")
      .eq("date", date),
  ]);

  // Index completions by `${user_id}|${item_id}`.
  const compMap = new Map(
    (completions ?? []).map((c) => [`${c.user_id}|${c.item_id}`, c])
  );

  const rows: MonitorRow[] = [];
  for (const a of assignments ?? []) {
    if (!isWorkdayFor(a.weekdays, dow)) continue;
    const checklist = a.checklist as {
      name: string;
      is_active: boolean;
      items: { id: string; title: string; requires_photo: boolean; sort_order: number }[];
    };
    const profile = a.profile as {
      full_name?: string;
      business_unit?: string | null;
      is_active?: boolean;
    } | null;
    if (!checklist?.is_active) continue;
    if (profile && profile.is_active === false) continue; // hide resigned
    const items = (checklist.items ?? [])
      .slice()
      .sort((x, y) => x.sort_order - y.sort_order);
    if (items.length === 0) continue;

    let completedCount = 0;
    let photoMissing = 0;
    const monitorItems: MonitorItem[] = items.map((it) => {
      const comp = compMap.get(`${a.user_id}|${it.id}`);
      const completed = !!comp;
      if (completed) completedCount++;
      if (it.requires_photo && (!comp || !comp.photo_path)) photoMissing++;
      return {
        id: it.id,
        title: it.title,
        requires_photo: it.requires_photo,
        completed,
        photo_path: comp?.photo_path ?? null,
        completion_id: comp?.id ?? null,
        completed_at: comp?.completed_at ?? null,
      };
    });

    rows.push({
      assignment_id: a.id,
      user_id: a.user_id,
      user_name: profile?.full_name ?? "—",
      business_unit: profile?.business_unit ?? null,
      checklist_name: checklist.name,
      block_checkout: a.block_checkout,
      total_items: items.length,
      completed_items: completedCount,
      photo_missing: photoMissing,
      is_exception: completedCount < items.length || photoMissing > 0,
      items: monitorItems,
    });
  }

  // Exceptions first, then by employee name.
  rows.sort((x, y) => {
    if (x.is_exception !== y.is_exception) return x.is_exception ? -1 : 1;
    return x.user_name.localeCompare(y.user_name);
  });

  return { date, rows };
}
