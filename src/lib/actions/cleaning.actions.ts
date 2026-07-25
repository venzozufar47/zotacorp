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
import { localHhmm } from "@/lib/utils/break-windows";
import {
  cleaningWindowOpen,
  cleaningWindowLabel,
} from "@/lib/utils/cleaning-window";
import { isOnDutyToday, type RotationMode } from "@/lib/utils/cleaning-rotation";
import {
  branchDutySlotFor,
  resolveBranchDuty,
} from "@/lib/utils/cleaning-branch-duty";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One requested photo ("slot") within an item, with its own reference. */
export interface ItemPhoto {
  id: string;
  label: string | null;
  reference_photo_path: string | null;
  sort_order: number;
}

export interface CleaningItem {
  id: string;
  title: string;
  note: string | null;
  requires_photo: boolean;
  sort_order: number;
  /** Requested photo slots. Empty + requires_photo → one generic photo. */
  photos: ItemPhoto[];
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
  window_mode: string;
  window_start: string | null;
  window_end: string | null;
  rotation_group_id: string | null;
  rotation_order: number;
  rotation_mode: string;
  rotation_member_count: number;
  rotation_anchor: string | null;
  skip_holidays: boolean;
}

/** One thing the employee must complete: a checkbox, a generic photo, or a
 *  named photo slot. photo_req_id null = checkbox/generic. */
export interface TodayUnit {
  photo_req_id: string | null;
  label: string | null;
  requires_photo: boolean;
  reference_photo_path: string | null;
  completion: {
    id: string;
    photo_path: string | null;
    completed_at: string;
  } | null;
}

export interface TodayTaskItem {
  id: string;
  title: string;
  note: string | null;
  sort_order: number;
  units: TodayUnit[];
  done: boolean;
}

export interface TodayTask {
  assignment_id: string;
  checklist_id: string;
  checklist_name: string;
  block_checkout: boolean;
  /** Whether the time-of-day window is currently open (true if no window). */
  window_open: boolean;
  /** Human label of the window, or null if unrestricted. */
  window_label: string | null;
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

export interface MonitorUnit {
  photo_req_id: string | null;
  label: string | null;
  requires_photo: boolean;
  completed: boolean;
  photo_path: string | null;
  completion_id: string | null;
}

export interface MonitorItem {
  id: string;
  title: string;
  completed: boolean;
  photo_missing: number;
  units: MonitorUnit[];
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

interface UnitSpec {
  photo_req_id: string | null;
  label: string | null;
  requires_photo: boolean;
  reference_photo_path: string | null;
}

/** The required completion units for an item:
 *   - requires_photo false → one checkbox (null id, no photo)
 *   - requires_photo true + slots → one photo per slot
 *   - requires_photo true + no slots → one generic photo (null id) */
function requiredUnits(item: {
  requires_photo: boolean;
  photos: ItemPhoto[];
}): UnitSpec[] {
  if (!item.requires_photo) {
    return [{ photo_req_id: null, label: null, requires_photo: false, reference_photo_path: null }];
  }
  const slots = (item.photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  if (slots.length === 0) {
    return [
      {
        photo_req_id: null,
        label: null,
        requires_photo: true,
        reference_photo_path: null,
      },
    ];
  }
  return slots.map((s) => ({
    photo_req_id: s.id,
    label: s.label,
    requires_photo: true,
    reference_photo_path: s.reference_photo_path,
  }));
}

// ---------------------------------------------------------------------------
// Admin: checklist templates + items
// ---------------------------------------------------------------------------

export async function listChecklists(): Promise<CleaningChecklist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_checklists")
    .select(
      "id, name, description, is_active, items:cleaning_checklist_items(id, title, note, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order))"
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
        photos: (it.photos ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => ({
            id: p.id,
            label: p.label,
            reference_photo_path: p.reference_photo_path,
            sort_order: p.sort_order,
          })),
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

/** Duplicate a checklist with all its items + photo slots (labels + references).
 *  Assignments are NOT copied — a duplicate is a fresh template to assign. */
export async function duplicateChecklist(input: {
  id: string;
}): Promise<{ ok: true; id: string } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();

  const { data: src } = await supabase
    .from("cleaning_checklists")
    .select(
      "name, description, is_active, items:cleaning_checklist_items(title, note, requires_photo, sort_order, photos:cleaning_item_photos(label, reference_photo_path, sort_order))"
    )
    .eq("id", input.id)
    .maybeSingle();
  if (!src) return { error: "Checklist tidak ditemukan." };

  const { data: newCl, error: clErr } = await supabase
    .from("cleaning_checklists")
    .insert({
      name: `${src.name} (salinan)`,
      description: src.description,
      is_active: src.is_active,
    })
    .select("id")
    .single();
  if (clErr || !newCl) return { error: clErr?.message ?? "Gagal menduplikat checklist." };

  const items = (src.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  for (const it of items) {
    const { data: newItem, error: itErr } = await supabase
      .from("cleaning_checklist_items")
      .insert({
        checklist_id: newCl.id,
        title: it.title,
        note: it.note,
        requires_photo: it.requires_photo,
        sort_order: it.sort_order,
      })
      .select("id")
      .single();
    if (itErr || !newItem) return { error: itErr?.message ?? "Gagal menyalin item." };

    const photos = it.photos ?? [];
    if (photos.length > 0) {
      const { error: phErr } = await supabase.from("cleaning_item_photos").insert(
        photos.map((p) => ({
          item_id: newItem.id,
          label: p.label,
          reference_photo_path: p.reference_photo_path,
          sort_order: p.sort_order,
        }))
      );
      if (phErr) return { error: phErr.message };
    }
  }

  revalidatePath("/admin/cleaning");
  return { ok: true, id: newCl.id };
}

export async function addChecklistItem(input: {
  checklist_id: string;
  title: string;
  note?: string;
  requires_photo?: boolean;
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
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const patch: {
    title?: string;
    note?: string | null;
    requires_photo?: boolean;
  } = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { error: "Judul item tidak boleh kosong." };
    patch.title = title;
  }
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.requires_photo !== undefined) patch.requires_photo = input.requires_photo;
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
  const results = await Promise.all(
    input.ordered_ids.map((id, i) =>
      supabase.from("cleaning_checklist_items").update({ sort_order: i }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: item photo slots (multiple requested photos per item)
// ---------------------------------------------------------------------------

export async function addItemPhoto(input: {
  item_id: string;
  label?: string | null;
  reference_photo_path?: string | null;
}): Promise<{ ok: true; id: string } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("cleaning_item_photos")
    .select("sort_order")
    .eq("item_id", input.item_id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("cleaning_item_photos")
    .insert({
      item_id: input.item_id,
      label: input.label?.trim() || null,
      reference_photo_path: input.reference_photo_path ?? null,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Gagal menambah foto." };
  revalidatePath("/admin/cleaning");
  return { ok: true, id: data.id };
}

export async function updateItemPhoto(input: {
  id: string;
  label?: string | null;
  reference_photo_path?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const patch: { label?: string | null; reference_photo_path?: string | null } = {};
  if (input.label !== undefined) patch.label = input.label?.trim() || null;
  if (input.reference_photo_path !== undefined)
    patch.reference_photo_path = input.reference_photo_path;
  if (Object.keys(patch).length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_item_photos")
    .update(patch)
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

export async function deleteItemPhoto(input: {
  id: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_item_photos")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
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
      "id, checklist_id, user_id, weekdays, block_checkout, is_active, window_mode, window_start, window_end, rotation_group_id, rotation_order, rotation_mode, rotation_member_count, rotation_anchor, skip_holidays, checklist:cleaning_checklists(name), profile:profiles(full_name, business_unit)"
    )
    .is("location_id", null) // branch duties are listed by listBranchDuties()
    .order("rotation_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.flatMap((a) => {
    // Defensive: the filter above already excludes person-less branch duties.
    if (!a.user_id) return [];
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
      window_mode: a.window_mode,
      window_start: a.window_start,
      window_end: a.window_end,
      rotation_group_id: a.rotation_group_id,
      rotation_order: a.rotation_order,
      rotation_mode: a.rotation_mode,
      rotation_member_count: a.rotation_member_count,
      rotation_anchor: a.rotation_anchor,
      skip_holidays: a.skip_holidays,
    };
  });
}

/** All national holidays as a Map (YYYY-MM-DD → name). The table is tiny
 *  (~17 dates/year); fetched whole so the rotation index can exclude holidays
 *  from the duty sequence (skip a holiday without advancing the turn). */
async function fetchHolidays(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("national_holidays")
    .select("holiday_date, name");
  return new Map((data ?? []).map((h) => [h.holiday_date, h.name]));
}

type MonitorCompletion = {
  id: string;
  photo_path: string | null;
};

/**
 * Per-item progress for one person against one checklist, for the admin
 * monitor. Shared by personal assignments and branch duties so both are
 * measured identically — "done" always means every required photo slot filled.
 */
function buildMonitorProgress(
  items: (CleaningItem & { title: string })[],
  userId: string,
  compMap: ReadonlyMap<string, MonitorCompletion>
): { items: MonitorItem[]; completedCount: number; photoMissing: number } {
  let completedCount = 0;
  let photoMissing = 0;
  const monitorItems: MonitorItem[] = items.map((it) => {
    const units: MonitorUnit[] = requiredUnits(it).map((u) => {
      const comp = compMap.get(`${userId}|${it.id}|${u.photo_req_id ?? ""}`);
      if (u.requires_photo && (!comp || !comp.photo_path)) photoMissing++;
      return {
        photo_req_id: u.photo_req_id,
        label: u.label,
        requires_photo: u.requires_photo,
        completed: !!comp,
        photo_path: comp?.photo_path ?? null,
        completion_id: comp?.id ?? null,
      };
    });
    const itemDone = units.every((u) => u.completed);
    if (itemDone) completedCount++;
    return {
      id: it.id,
      title: it.title,
      completed: itemDone,
      photo_missing: units.filter((u) => u.requires_photo && !u.photo_path).length,
      units,
    };
  });
  return { items: monitorItems, completedCount, photoMissing };
}

/**
 * Which branch-duty assignment (if any) the given user must perform today.
 *
 * Branch duties belong to a place, not a person (migration 109), so the owner
 * is derived instead of stored: find where the user checked in, take that
 * branch's ordered pool members who are also present today, rank them, and let
 * cleaning-branch-duty.ts hand out the slots (with the daily swap).
 *
 * Returns null whenever the user has no duty — not checked in, checked in
 * somewhere that runs no duty, not in the pool, ranked beyond the number of
 * slots, or the day is unscheduled/a skipped holiday.
 */
async function resolveMyBranchDuty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
  dow: number,
  holidaySet: ReadonlySet<string>,
  matchedLocationId: string | null | undefined
): Promise<{ assignmentId: string; slot: number } | null> {
  if (!matchedLocationId) return null;

  // Both lookups depend only on the location, so they go out together.
  const [{ data: duties }, { data: present }] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select("id, duty_slot, weekdays, skip_holidays, rotation_anchor")
      .eq("location_id", matchedLocationId)
      .eq("is_active", true)
      .order("duty_slot", { ascending: true }),
    // Ordered pool members present at this branch today (SECURITY DEFINER: an
    // employee cannot read a colleague's attendance row directly).
    supabase.rpc("cleaning_branch_present", {
      p_location_id: matchedLocationId,
      p_date: today,
    }),
  ]);
  if (!duties || duties.length === 0) return null;

  const presentUserIds = (present ?? []).map((p) => p.user_id);
  if (!presentUserIds.includes(userId)) return null;

  // Slot config is uniform per branch; slot 0 carries the schedule.
  const base = duties[0];
  const slot = branchDutySlotFor(userId, {
    dateYmd: today,
    anchorYmd: base.rotation_anchor ?? today,
    dow,
    weekdays: base.weekdays,
    slotCount: duties.length,
    presentUserIds,
    holidays: holidaySet,
    skipHolidays: base.skip_holidays,
  });
  if (slot < 0) return null;

  const row = duties.find((d) => d.duty_slot === slot);
  return row ? { assignmentId: row.id, slot } : null;
}

/** Checklist payload shape shared by the monitor queries. */
type MonitorChecklist = {
  name: string;
  is_active: boolean;
  items: (CleaningItem & { title: string })[];
};

/**
 * Monitor rows for every branch duty on `date`. Nobody owns these checklists,
 * so the performers are re-derived from attendance exactly the way the employee
 * view derives them — the admin sees the same truth the employee was shown.
 * Branches where nobody eligible turned up simply produce no rows.
 */
async function buildBranchDutyMonitorRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string,
  dow: number,
  holidaySet: ReadonlySet<string>,
  isHoliday: boolean,
  compMap: ReadonlyMap<string, MonitorCompletion>
): Promise<MonitorRow[]> {
  const { data: duties } = await supabase
    .from("cleaning_assignments")
    .select(
      "id, location_id, duty_slot, weekdays, block_checkout, skip_holidays, rotation_anchor, checklist:cleaning_checklists!inner(name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order)))"
    )
    .eq("is_active", true)
    .not("location_id", "is", null)
    .order("duty_slot", { ascending: true });
  if (!duties || duties.length === 0) return [];

  const locationIds = [
    ...new Set(duties.map((d) => d.location_id).filter((id): id is string => !!id)),
  ];
  const [{ data: pool }, { data: present }] = await Promise.all([
    supabase
      .from("cleaning_duty_pool")
      .select(
        "location_id, user_id, sort_order, profile:profiles!inner(full_name, business_unit, is_active)"
      )
      .in("location_id", locationIds),
    // Admins may read all attendance, so no RPC needed on this path.
    supabase
      .from("attendance_logs")
      .select("user_id, matched_location_id")
      .eq("date", date)
      .in("matched_location_id", locationIds),
  ]);

  const rows: MonitorRow[] = [];
  for (const locationId of locationIds) {
    const slots = duties.filter((d) => d.location_id === locationId);
    const base = slots[0];
    if (!base) continue;
    if (base.skip_holidays && isHoliday) continue;

    const poolRows = (pool ?? [])
      .filter((p) => p.location_id === locationId)
      .sort(
        (a, b) => a.sort_order - b.sort_order || a.user_id.localeCompare(b.user_id)
      );
    const presentSet = new Set(
      (present ?? [])
        .filter((p) => p.matched_location_id === locationId)
        .map((p) => p.user_id)
    );
    const presentUserIds = poolRows
      .filter((p) => presentSet.has(p.user_id))
      .map((p) => p.user_id);

    const dutyByUser = resolveBranchDuty({
      dateYmd: date,
      anchorYmd: base.rotation_anchor ?? date,
      dow,
      weekdays: base.weekdays,
      slotCount: slots.length,
      presentUserIds,
      holidays: holidaySet,
      skipHolidays: base.skip_holidays,
    });

    for (const [userId, slot] of dutyByUser) {
      const duty = slots.find((d) => d.duty_slot === slot);
      if (!duty) continue;
      const checklist = duty.checklist as unknown as MonitorChecklist | null;
      if (!checklist?.is_active) continue;
      const items = (checklist.items ?? [])
        .slice()
        .sort((x, y) => x.sort_order - y.sort_order);
      if (items.length === 0) continue;

      const profile = poolRows.find((p) => p.user_id === userId)?.profile as unknown as
        | { full_name?: string; business_unit?: string | null; is_active?: boolean }
        | null;
      if (profile && profile.is_active === false) continue; // hide resigned

      const { items: monitorItems, completedCount, photoMissing } =
        buildMonitorProgress(items, userId, compMap);
      rows.push({
        assignment_id: duty.id,
        user_id: userId,
        user_name: profile?.full_name ?? "—",
        business_unit: profile?.business_unit ?? null,
        checklist_name: checklist.name,
        block_checkout: duty.block_checkout,
        total_items: items.length,
        completed_items: completedCount,
        photo_missing: photoMissing,
        is_exception: completedCount < items.length || photoMissing > 0,
        items: monitorItems,
      });
    }
  }
  return rows;
}

/** Normalize window fields: keep only the times the mode uses. */
function normalizeWindow(
  mode: string | undefined,
  start: string | null | undefined,
  end: string | null | undefined
): { window_mode: string; window_start: string | null; window_end: string | null } {
  const m = mode === "before" || mode === "after" || mode === "between" ? mode : "anytime";
  const s = start?.trim() || null;
  const e = end?.trim() || null;
  if (m === "before") return { window_mode: m, window_start: null, window_end: e };
  if (m === "after") return { window_mode: m, window_start: s, window_end: null };
  if (m === "between") return { window_mode: m, window_start: s, window_end: e };
  return { window_mode: "anytime", window_start: null, window_end: null };
}

export async function assignChecklist(input: {
  checklist_id: string;
  user_id: string;
  weekdays: number;
  block_checkout: boolean;
  skip_holidays?: boolean;
  window_mode?: string;
  window_start?: string | null;
  window_end?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  if (!input.checklist_id || !input.user_id) {
    return { error: "Checklist dan karyawan wajib dipilih." };
  }
  const win = normalizeWindow(input.window_mode, input.window_start, input.window_end);
  const supabase = await createClient();
  const { error } = await supabase.from("cleaning_assignments").insert({
    checklist_id: input.checklist_id,
    user_id: input.user_id,
    weekdays: input.weekdays,
    block_checkout: input.block_checkout,
    skip_holidays: input.skip_holidays ?? false,
    ...win,
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
  skip_holidays?: boolean;
  window_mode?: string;
  window_start?: string | null;
  window_end?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const patch: {
    weekdays?: number;
    block_checkout?: boolean;
    is_active?: boolean;
    skip_holidays?: boolean;
    window_mode?: string;
    window_start?: string | null;
    window_end?: string | null;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };
  if (input.weekdays !== undefined) patch.weekdays = input.weekdays;
  if (input.block_checkout !== undefined) patch.block_checkout = input.block_checkout;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.skip_holidays !== undefined) patch.skip_holidays = input.skip_holidays;
  if (input.window_mode !== undefined) {
    const win = normalizeWindow(input.window_mode, input.window_start, input.window_end);
    patch.window_mode = win.window_mode;
    patch.window_start = win.window_start;
    patch.window_end = win.window_end;
  }
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
// Admin: duty rotations (one checklist shared by 2+ employees, alternating)
// ---------------------------------------------------------------------------

/** Create a rotation: N assignment rows sharing one rotation_group_id, ordered
 *  by member_user_ids. Absorbs any pre-existing assignment of this checklist for
 *  the chosen members so the unique(checklist_id,user_id) constraint won't fire. */
export async function assignRotation(input: {
  checklist_id: string;
  member_user_ids: string[];
  weekdays: number;
  block_checkout: boolean;
  rotation_mode: RotationMode;
  skip_holidays?: boolean;
  window_mode?: string;
  window_start?: string | null;
  window_end?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const members = Array.from(new Set((input.member_user_ids ?? []).filter(Boolean)));
  if (!input.checklist_id) return { error: "Checklist wajib dipilih." };
  if (members.length < 2) return { error: "Rotasi butuh minimal 2 karyawan." };
  const mode: RotationMode = input.rotation_mode === "weekly" ? "weekly" : "daily";
  const win = normalizeWindow(input.window_mode, input.window_start, input.window_end);
  const supabase = await createClient();

  // Absorb existing assignments of this checklist for the chosen members.
  const { error: delErr } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("checklist_id", input.checklist_id)
    .in("user_id", members);
  if (delErr) return { error: delErr.message };

  const groupId = crypto.randomUUID();
  const anchor = jakartaDateString(new Date());
  const rows = members.map((uid, i) => ({
    checklist_id: input.checklist_id,
    user_id: uid,
    weekdays: input.weekdays,
    block_checkout: input.block_checkout,
    skip_holidays: input.skip_holidays ?? false,
    ...win,
    rotation_group_id: groupId,
    rotation_order: i,
    rotation_mode: mode,
    rotation_anchor: anchor,
    rotation_member_count: members.length,
  }));
  const { error } = await supabase.from("cleaning_assignments").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

/** Patch shared schedule/window/active across ALL rows of a rotation group. */
export async function updateRotation(input: {
  rotation_group_id: string;
  weekdays?: number;
  block_checkout?: boolean;
  is_active?: boolean;
  skip_holidays?: boolean;
  window_mode?: string;
  window_start?: string | null;
  window_end?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const patch: {
    weekdays?: number;
    block_checkout?: boolean;
    is_active?: boolean;
    skip_holidays?: boolean;
    window_mode?: string;
    window_start?: string | null;
    window_end?: string | null;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };
  if (input.weekdays !== undefined) patch.weekdays = input.weekdays;
  if (input.block_checkout !== undefined) patch.block_checkout = input.block_checkout;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.skip_holidays !== undefined) patch.skip_holidays = input.skip_holidays;
  if (input.window_mode !== undefined) {
    const win = normalizeWindow(input.window_mode, input.window_start, input.window_end);
    patch.window_mode = win.window_mode;
    patch.window_start = win.window_start;
    patch.window_end = win.window_end;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_assignments")
    .update(patch)
    .eq("rotation_group_id", input.rotation_group_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

/** Replace a rotation's members (ordered): add/remove/reorder rows, keeping the
 *  shared schedule. Min 2 members (dissolve via deleteRotation instead). */
export async function setRotationMembers(input: {
  rotation_group_id: string;
  member_user_ids: string[];
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const members = Array.from(new Set((input.member_user_ids ?? []).filter(Boolean)));
  if (members.length < 2) {
    return { error: "Rotasi minimal 2 karyawan. Hapus rotasi untuk membubarkan." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("cleaning_assignments")
    .select(
      "user_id, checklist_id, weekdays, block_checkout, window_mode, window_start, window_end, rotation_mode, rotation_anchor"
    )
    .eq("rotation_group_id", input.rotation_group_id);
  if (!existing || existing.length === 0) return { error: "Rotasi tidak ditemukan." };
  // Rotations are always per-person; a branch duty never carries a group id.
  const existingRows = existing.filter(
    (e): e is typeof e & { user_id: string } => e.user_id !== null
  );
  if (existingRows.length === 0) return { error: "Rotasi tidak ditemukan." };
  const tmpl = existingRows[0];
  const existingUsers = new Set(existingRows.map((e) => e.user_id));
  const newSet = new Set(members);

  // Remove members no longer in the rotation (cascades their completions).
  const removed = existingRows.filter((e) => !newSet.has(e.user_id)).map((e) => e.user_id);
  if (removed.length) {
    const { error } = await supabase
      .from("cleaning_assignments")
      .delete()
      .eq("rotation_group_id", input.rotation_group_id)
      .in("user_id", removed);
    if (error) return { error: error.message };
  }

  // Add new members (absorb any standalone of this checklist they may hold first).
  const added = members.filter((u) => !existingUsers.has(u));
  if (added.length) {
    const { error: delErr } = await supabase
      .from("cleaning_assignments")
      .delete()
      .eq("checklist_id", tmpl.checklist_id)
      .in("user_id", added);
    if (delErr) return { error: delErr.message };
    const rows = added.map((uid) => ({
      checklist_id: tmpl.checklist_id,
      user_id: uid,
      weekdays: tmpl.weekdays,
      block_checkout: tmpl.block_checkout,
      window_mode: tmpl.window_mode,
      window_start: tmpl.window_start,
      window_end: tmpl.window_end,
      rotation_group_id: input.rotation_group_id,
      rotation_order: 0,
      rotation_mode: tmpl.rotation_mode,
      rotation_anchor: tmpl.rotation_anchor,
      rotation_member_count: members.length,
    }));
    const { error } = await supabase.from("cleaning_assignments").insert(rows);
    if (error) return { error: error.message };
  }

  // Re-number rotation_order by the new order + sync member_count on every row.
  const results = await Promise.all(
    members.map((uid, i) =>
      supabase
        .from("cleaning_assignments")
        .update({ rotation_order: i, rotation_member_count: members.length })
        .eq("rotation_group_id", input.rotation_group_id)
        .eq("user_id", uid)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

/** Dissolve a rotation: delete all its assignment rows. */
export async function deleteRotation(input: {
  rotation_group_id: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("rotation_group_id", input.rotation_group_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cleaning");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Employee: today's tasks + completion
// ---------------------------------------------------------------------------

/** Assignment row + its full checklist payload, as the employee view needs it. */
const TODAY_ASSIGNMENT_SELECT =
  "id, checklist_id, weekdays, block_checkout, skip_holidays, window_mode, window_start, window_end, rotation_group_id, rotation_order, rotation_mode, rotation_anchor, rotation_member_count, checklist:cleaning_checklists!inner(id, name, is_active, items:cleaning_checklist_items(id, title, note, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order)))";

export async function getTodayCleaningTasks(): Promise<TodayCleaningTasks> {
  const user = await getCurrentUser();
  const tz = await getTimezone();
  const now = new Date();
  const today = jakartaDateString(now);
  const dow = jakartaDayOfWeek(now, tz);
  const empty: TodayCleaningTasks = { date: today, checked_in: false, tasks: [] };
  if (!user) return empty;

  const supabase = await createClient();
  const [{ data: assignments }, { data: log }, { data: completions }, holidays] =
    await Promise.all([
      supabase
        .from("cleaning_assignments")
        .select(TODAY_ASSIGNMENT_SELECT)
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase
        .from("attendance_logs")
        .select("id, checked_in_at, checked_out_at, matched_location_id")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle(),
      supabase
        .from("cleaning_task_completions")
        .select("id, item_id, photo_req_id, photo_path, completed_at")
        .eq("user_id", user.id)
        .eq("date", today),
      fetchHolidays(supabase),
    ]);
  const holidaySet = new Set(holidays.keys());
  const isHoliday = holidays.has(today);

  // Today's branch duty, if the place they checked in at runs one. It is an
  // ordinary assignment row, so it joins the same pipeline below.
  const branchDuty = await resolveMyBranchDuty(
    supabase,
    user.id,
    today,
    dow,
    holidaySet,
    log?.matched_location_id
  );
  let branchAssignments: typeof assignments = null;
  if (branchDuty) {
    const { data } = await supabase
      .from("cleaning_assignments")
      .select(TODAY_ASSIGNMENT_SELECT)
      .eq("id", branchDuty.assignmentId);
    branchAssignments = data;
  }

  const checkedIn = !!log?.checked_in_at && !log?.checked_out_at;
  // Key completions by item + photo slot (null slot → "").
  const compByKey = new Map(
    (completions ?? []).map((c) => [`${c.item_id}|${c.photo_req_id ?? ""}`, c])
  );

  const nowHhmm = localHhmm(now, tz);
  type AssignmentChecklist = {
    id: string;
    name: string;
    is_active: boolean;
    items: CleaningItem[];
  };
  const tasks: TodayTask[] = [...(assignments ?? []), ...(branchAssignments ?? [])]
    .filter(
      (a) =>
        isWorkdayFor(a.weekdays, dow) &&
        !(a.skip_holidays && isHoliday) &&
        (a.checklist as AssignmentChecklist)?.is_active &&
        isOnDutyToday({
          dateYmd: today,
          anchorYmd: a.rotation_anchor ?? today,
          dow,
          weekdays: a.weekdays,
          mode: (a.rotation_mode as RotationMode) ?? "daily",
          memberOrder: a.rotation_order,
          memberCount: a.rotation_member_count,
          holidays: holidaySet,
          skipHolidays: a.skip_holidays,
        })
    )
    .map((a) => {
      const checklist = a.checklist as AssignmentChecklist;
      return {
      assignment_id: a.id,
      checklist_id: checklist.id,
      checklist_name: checklist.name,
      block_checkout: a.block_checkout,
      window_open: cleaningWindowOpen(
        a.window_mode,
        a.window_start,
        a.window_end,
        nowHhmm
      ),
      window_label: cleaningWindowLabel(a.window_mode, a.window_start, a.window_end),
      items: (checklist.items ?? [])
        .slice()
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((it) => {
          const units: TodayUnit[] = requiredUnits(it).map((u) => {
            const comp = compByKey.get(`${it.id}|${u.photo_req_id ?? ""}`);
            return {
              photo_req_id: u.photo_req_id,
              label: u.label,
              requires_photo: u.requires_photo,
              reference_photo_path: u.reference_photo_path,
              completion: comp
                ? {
                    id: comp.id,
                    photo_path: comp.photo_path,
                    completed_at: comp.completed_at,
                  }
                : null,
            };
          });
          return {
            id: it.id,
            title: it.title,
            note: it.note,
            sort_order: it.sort_order,
            units,
            done: units.every((u) => u.completion),
          };
        }),
      };
    });

  return { date: today, checked_in: checkedIn, tasks };
}

export async function completeCleaningItem(input: {
  assignment_id: string;
  item_id: string;
  /** Which photo slot this completion is for; null = checkbox/generic photo. */
  photo_req_id?: string | null;
  photo_path?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Tidak terautentikasi." };
  const tz = await getTimezone();
  const now = new Date();
  const today = jakartaDateString(now);
  const supabase = await createClient();

  // Independent reads in parallel: today's attendance log, the item, the
  // assignment, and the national-holiday calendar. Guards run after.
  const [{ data: log }, { data: item }, { data: assignment }, holidays] =
    await Promise.all([
      supabase
        .from("attendance_logs")
        .select("checked_in_at, checked_out_at, matched_location_id")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle(),
      supabase
        .from("cleaning_checklist_items")
        .select("id, requires_photo, checklist_id")
        .eq("id", input.item_id)
        .maybeSingle(),
      supabase
        .from("cleaning_assignments")
        .select(
          "id, checklist_id, user_id, location_id, duty_slot, weekdays, skip_holidays, window_mode, window_start, window_end, rotation_anchor, rotation_mode, rotation_order, rotation_member_count"
        )
        .eq("id", input.assignment_id)
        .maybeSingle(),
      fetchHolidays(supabase),
    ]);
  const holidaySet = new Set(holidays.keys());
  const todayHoliday = holidays.get(today) ?? null;

  // Must have an open check-in today — evidence is only meaningful during the
  // shift (mirrors the breakOut guard).
  if (!log?.checked_in_at) {
    return { error: "Anda harus check in dulu sebelum mengisi checklist." };
  }
  if (log.checked_out_at) {
    return { error: "Anda sudah check out hari ini." };
  }

  // Verify the item is part of the assignment, and the assignment is the
  // employee's own.
  if (!item) return { error: "Item checklist tidak ditemukan." };
  if (!assignment) return { error: "Assignment tidak valid." };
  if (assignment.location_id) {
    // Branch duty: nobody owns the row, so ownership is re-derived from today's
    // attendance. This is the write-side twin of the read-side resolution —
    // being able to see a checklist and being allowed to submit it must agree.
    const duty = await resolveMyBranchDuty(
      supabase,
      user.id,
      today,
      jakartaDayOfWeek(now, tz),
      holidaySet,
      log.matched_location_id
    );
    if (!duty || duty.assignmentId !== assignment.id) {
      return { error: "Checklist ini bukan giliran Anda hari ini." };
    }
  } else if (assignment.user_id !== user.id) {
    return { error: "Assignment tidak valid." };
  }
  if (assignment.checklist_id !== item.checklist_id) {
    return { error: "Item tidak termasuk dalam checklist ini." };
  }

  // Holiday skip: nobody works this checklist on a national holiday.
  if (assignment.skip_holidays && todayHoliday) {
    return { error: `Hari ini libur nasional (${todayHoliday}) — checklist dilompati.` };
  }

  // Rotation: only the on-duty member may submit today (holiday-aware).
  if (
    !isOnDutyToday({
      dateYmd: today,
      anchorYmd: assignment.rotation_anchor ?? today,
      dow: jakartaDayOfWeek(now, tz),
      weekdays: assignment.weekdays,
      mode: (assignment.rotation_mode as RotationMode) ?? "daily",
      memberOrder: assignment.rotation_order,
      memberCount: assignment.rotation_member_count,
      holidays: holidaySet,
      skipHolidays: assignment.skip_holidays,
    })
  ) {
    return { error: "Bukan giliran Anda hari ini." };
  }

  // If a photo slot is given, it must belong to this item.
  const photoReqId = input.photo_req_id ?? null;
  if (photoReqId) {
    const { data: slot } = await supabase
      .from("cleaning_item_photos")
      .select("id, item_id")
      .eq("id", photoReqId)
      .maybeSingle();
    if (!slot || slot.item_id !== item.id) {
      return { error: "Slot foto tidak valid." };
    }
  }

  // Time-of-day window: reject submissions outside the configured window.
  if (
    !cleaningWindowOpen(
      assignment.window_mode,
      assignment.window_start,
      assignment.window_end,
      localHhmm(now, tz)
    )
  ) {
    const label = cleaningWindowLabel(
      assignment.window_mode,
      assignment.window_start,
      assignment.window_end
    );
    return {
      error: label
        ? `Di luar jam pengerjaan. ${label}.`
        : "Di luar jam pengerjaan checklist ini.",
    };
  }

  if (item.requires_photo && !input.photo_path) {
    return { error: "Item ini wajib menyertakan foto bukti." };
  }

  const { error } = await supabase.from("cleaning_task_completions").upsert(
    {
      user_id: user.id,
      assignment_id: input.assignment_id,
      item_id: input.item_id,
      photo_req_id: photoReqId,
      date: today,
      photo_path: input.photo_path ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      note: input.note?.trim() || null,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id,date,photo_req_id" }
  );
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uncompleteCleaningItem(input: {
  item_id: string;
  /** Slot to clear; null = the checkbox/generic completion. */
  photo_req_id?: string | null;
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
  let q = supabase
    .from("cleaning_task_completions")
    .delete()
    .eq("user_id", user.id)
    .eq("item_id", input.item_id)
    .eq("date", today);
  q = input.photo_req_id
    ? q.eq("photo_req_id", input.photo_req_id)
    : q.is("photo_req_id", null);
  const { error } = await q;
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

  const blockingSelect =
    "id, weekdays, skip_holidays, rotation_anchor, rotation_mode, rotation_order, rotation_member_count, checklist:cleaning_checklists!inner(name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order)))";

  const [{ data: assignments }, { data: completions }, { data: log }, holidays] =
    await Promise.all([
      supabase
        .from("cleaning_assignments")
        .select(blockingSelect)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .eq("block_checkout", true),
      supabase
        .from("cleaning_task_completions")
        .select("item_id, photo_req_id")
        .eq("user_id", user.id)
        .eq("date", today),
      supabase
        .from("attendance_logs")
        .select("matched_location_id")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle(),
      fetchHolidays(supabase),
    ]);
  const holidaySet = new Set(holidays.keys());
  const isHoliday = holidays.has(today);

  // A branch duty blocks check-out exactly like a personal assignment does —
  // but only for the person it landed on today.
  const branchDuty = await resolveMyBranchDuty(
    supabase,
    user.id,
    today,
    dow,
    holidaySet,
    log?.matched_location_id
  );
  let branchAssignments: typeof assignments = null;
  if (branchDuty) {
    const { data } = await supabase
      .from("cleaning_assignments")
      .select(blockingSelect)
      .eq("id", branchDuty.assignmentId)
      .eq("block_checkout", true);
    branchAssignments = data;
  }

  // Done units keyed by item + slot (null slot → "").
  const doneUnits = new Set(
    (completions ?? []).map((c) => `${c.item_id}|${c.photo_req_id ?? ""}`)
  );
  const blocking: BlockingChecklist[] = [];

  for (const a of [...(assignments ?? []), ...(branchAssignments ?? [])]) {
    if (!isWorkdayFor(a.weekdays, dow)) continue;
    if (a.skip_holidays && isHoliday) continue; // holiday → not blocking
    // Off-duty rotation members are NOT blocked by someone else's turn.
    if (
      !isOnDutyToday({
        dateYmd: today,
        anchorYmd: a.rotation_anchor ?? today,
        dow,
        weekdays: a.weekdays,
        mode: (a.rotation_mode as RotationMode) ?? "daily",
        memberOrder: a.rotation_order,
        memberCount: a.rotation_member_count,
        holidays: holidaySet,
        skipHolidays: a.skip_holidays,
      })
    )
      continue;
    const checklist = a.checklist as {
      name: string;
      is_active: boolean;
      items: (CleaningItem & { title: string })[];
    };
    if (!checklist?.is_active) continue;
    const items = (checklist.items ?? [])
      .slice()
      .sort((x, y) => x.sort_order - y.sort_order);
    if (items.length === 0) continue;
    // An item is incomplete if any of its required units is missing.
    const remaining = items
      .filter((it) =>
        requiredUnits(it).some(
          (u) => !doneUnits.has(`${it.id}|${u.photo_req_id ?? ""}`)
        )
      )
      .map((it) => it.title);
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
}): Promise<{ date: string; holiday: string | null; rows: MonitorRow[] }> {
  const gate = await requireAdmin();
  const tz = await getTimezone();
  const now = new Date();
  const date = input?.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : jakartaDateString(now);
  if (!gate.ok) return { date, holiday: null, rows: [] };

  // Weekday of the selected date (midday avoids any DST/edge in tz mapping).
  const dow = jakartaDayOfWeek(new Date(`${date}T12:00:00`), tz);
  const supabase = await createClient();

  const [{ data: assignments }, { data: completions }, holidays] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select(
        "id, user_id, weekdays, block_checkout, skip_holidays, rotation_group_id, rotation_anchor, rotation_mode, rotation_order, rotation_member_count, checklist:cleaning_checklists!inner(name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order))), profile:profiles!inner(full_name, business_unit, is_active)"
      )
      .eq("is_active", true),
    supabase
      .from("cleaning_task_completions")
      .select("item_id, user_id, photo_req_id, photo_path, id")
      .eq("date", date),
    fetchHolidays(supabase),
  ]);
  const holidaySet = new Set(holidays.keys());
  const holidayNm = holidays.get(date) ?? null;
  const isHoliday = !!holidayNm;

  // Index completions by `${user_id}|${item_id}|${photo_req_id ?? ""}`.
  const compMap = new Map(
    (completions ?? []).map((c) => [
      `${c.user_id}|${c.item_id}|${c.photo_req_id ?? ""}`,
      c,
    ])
  );

  const rows: MonitorRow[] = [];
  for (const a of assignments ?? []) {
    // Branch duties have nobody to inner-join a profile against, so they never
    // reach here; they are reported by getBranchDutyMonitor() instead.
    if (!a.user_id) continue;
    if (!isWorkdayFor(a.weekdays, dow)) continue;
    if (a.skip_holidays && isHoliday) continue; // holiday → checklist skipped
    // For a rotation, attribute the day to ONLY the on-duty member; off-duty
    // members are skipped (not flagged as misses). Standalone rows pass through.
    if (
      a.rotation_group_id &&
      !isOnDutyToday({
        dateYmd: date,
        anchorYmd: a.rotation_anchor ?? date,
        dow,
        weekdays: a.weekdays,
        mode: (a.rotation_mode as RotationMode) ?? "daily",
        memberOrder: a.rotation_order,
        memberCount: a.rotation_member_count,
        holidays: holidaySet,
        skipHolidays: a.skip_holidays,
      })
    )
      continue;
    const checklist = a.checklist as {
      name: string;
      is_active: boolean;
      items: (CleaningItem & { title: string })[];
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

    const {
      items: monitorItems,
      completedCount,
      photoMissing,
    } = buildMonitorProgress(items, a.user_id, compMap);

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

  // Branch duties are person-less rows, so they are resolved separately and
  // appended before sorting — the admin sees one flat list either way.
  rows.push(
    ...(await buildBranchDutyMonitorRows(
      supabase,
      date,
      dow,
      holidaySet,
      isHoliday,
      compMap
    ))
  );

  // Exceptions first, then by employee name.
  rows.sort((x, y) => {
    if (x.is_exception !== y.is_exception) return x.is_exception ? -1 : 1;
    return x.user_name.localeCompare(y.user_name);
  });

  return { date, holiday: holidayNm, rows };
}

// ---------------------------------------------------------------------------
// Admin: branch duty — a checklist that belongs to a place, not a person
// ---------------------------------------------------------------------------

export interface BranchDutySlotRow {
  assignment_id: string;
  duty_slot: number;
  checklist_id: string;
  checklist_name: string;
}

export interface BranchDutyPoolMember {
  user_id: string;
  name: string;
  sort_order: number;
}

export interface BranchDutyRow {
  location_id: string;
  location_name: string;
  is_active: boolean;
  weekdays: number;
  block_checkout: boolean;
  skip_holidays: boolean;
  window_mode: string;
  window_start: string | null;
  window_end: string | null;
  rotation_anchor: string | null;
  slots: BranchDutySlotRow[];
  pool: BranchDutyPoolMember[];
}

export interface CleaningLocation {
  id: string;
  name: string;
}

/** Attendance locations, which double as the branches a duty can attach to. */
export async function listCleaningLocations(): Promise<CleaningLocation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_locations")
    .select("id, name")
    .order("name");
  return (data ?? []).map((l) => ({ id: l.id, name: l.name }));
}

export async function listBranchDuties(): Promise<BranchDutyRow[]> {
  const supabase = await createClient();
  const [{ data: duties }, { data: pool }] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select(
        "id, location_id, checklist_id, duty_slot, weekdays, block_checkout, skip_holidays, is_active, window_mode, window_start, window_end, rotation_anchor, checklist:cleaning_checklists(name), location:attendance_locations(name)"
      )
      .not("location_id", "is", null)
      .order("duty_slot", { ascending: true }),
    supabase
      .from("cleaning_duty_pool")
      .select("location_id, user_id, sort_order, profile:profiles(full_name)")
      .order("sort_order", { ascending: true }),
  ]);

  const byLocation = new Map<string, BranchDutyRow>();
  for (const d of duties ?? []) {
    if (!d.location_id || d.duty_slot === null) continue;
    const location = d.location as { name?: string } | null;
    const checklist = d.checklist as { name?: string } | null;
    let row = byLocation.get(d.location_id);
    if (!row) {
      row = {
        location_id: d.location_id,
        location_name: location?.name ?? "—",
        is_active: d.is_active,
        weekdays: d.weekdays,
        block_checkout: d.block_checkout,
        skip_holidays: d.skip_holidays,
        window_mode: d.window_mode,
        window_start: d.window_start,
        window_end: d.window_end,
        rotation_anchor: d.rotation_anchor,
        slots: [],
        pool: [],
      };
      byLocation.set(d.location_id, row);
    }
    row.slots.push({
      assignment_id: d.id,
      duty_slot: d.duty_slot,
      checklist_id: d.checklist_id,
      checklist_name: checklist?.name ?? "—",
    });
  }

  for (const p of pool ?? []) {
    const row = byLocation.get(p.location_id);
    if (!row) continue;
    const profile = p.profile as { full_name?: string } | null;
    row.pool.push({
      user_id: p.user_id,
      name: profile?.full_name ?? "—",
      sort_order: p.sort_order,
    });
  }

  return [...byLocation.values()].sort((a, b) =>
    a.location_name.localeCompare(b.location_name)
  );
}

/**
 * Create or rewrite a branch's duty: `checklist_ids` in order become slots
 * 0..n-1, which is also the swap order.
 *
 * Slots whose checklist is dropped are deleted (their completions cascade);
 * surviving slots are updated in place so today's evidence and the rotation
 * anchor stay intact. Renumbering happens in two phases because
 * (location_id, duty_slot) is unique — parking survivors on negative slots
 * first means a reorder can never collide mid-flight.
 */
export async function saveBranchDuty(input: {
  location_id: string;
  checklist_ids: string[];
  weekdays?: number;
  block_checkout?: boolean;
  skip_holidays?: boolean;
  window_mode?: string;
  window_start?: string | null;
  window_end?: string | null;
  is_active?: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  if (!input.location_id) return { error: "Cabang wajib dipilih." };

  const ids = [...new Set(input.checklist_ids.filter(Boolean))];
  if (ids.length === 0) return { error: "Pilih minimal 1 checklist." };
  if (ids.length > 6) return { error: "Maksimal 6 checklist per cabang." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("cleaning_assignments")
    .select("id, checklist_id, duty_slot, rotation_anchor")
    .eq("location_id", input.location_id);

  const win = normalizeWindow(input.window_mode, input.window_start, input.window_end);
  const settings = {
    weekdays: input.weekdays ?? 126, // Mon–Sat
    block_checkout: input.block_checkout ?? true,
    skip_holidays: input.skip_holidays ?? true,
    is_active: input.is_active ?? true,
    ...win,
  };
  // Keep the branch's original anchor so an edit never shifts whose turn it is.
  const anchor =
    (existing ?? []).find((e) => e.rotation_anchor)?.rotation_anchor ??
    jakartaDateString(new Date());

  const keep = new Set(ids);
  const doomed = (existing ?? [])
    .filter((e) => !keep.has(e.checklist_id))
    .map((e) => e.id);
  if (doomed.length) {
    const { error } = await supabase
      .from("cleaning_assignments")
      .delete()
      .in("id", doomed);
    if (error) return { error: error.message };
  }

  const survivors = (existing ?? []).filter((e) => keep.has(e.checklist_id));
  for (let i = 0; i < survivors.length; i++) {
    const { error } = await supabase
      .from("cleaning_assignments")
      .update({ duty_slot: -(i + 1) })
      .eq("id", survivors[i].id);
    if (error) return { error: error.message };
  }

  for (let i = 0; i < ids.length; i++) {
    const survivor = survivors.find((e) => e.checklist_id === ids[i]);
    if (survivor) {
      const { error } = await supabase
        .from("cleaning_assignments")
        .update({ duty_slot: i, rotation_anchor: anchor, ...settings })
        .eq("id", survivor.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("cleaning_assignments").insert({
        location_id: input.location_id,
        checklist_id: ids[i],
        duty_slot: i,
        user_id: null,
        rotation_anchor: anchor,
        ...settings,
      });
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/admin/cleaning");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Replace a branch's eligible-employee pool. Order = the daily rank order. */
export async function setBranchDutyPool(input: {
  location_id: string;
  user_ids: string[];
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  if (!input.location_id) return { error: "Cabang wajib dipilih." };

  const ids = [...new Set(input.user_ids.filter(Boolean))];
  const supabase = await createClient();
  const { error: delErr } = await supabase
    .from("cleaning_duty_pool")
    .delete()
    .eq("location_id", input.location_id);
  if (delErr) return { error: delErr.message };

  if (ids.length) {
    const { error } = await supabase.from("cleaning_duty_pool").insert(
      ids.map((user_id, i) => ({
        location_id: input.location_id,
        user_id,
        sort_order: i,
      }))
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/cleaning");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Remove a branch's duty entirely (slots + pool). Completions cascade. */
export async function deleteBranchDuty(input: {
  location_id: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("location_id", input.location_id);
  if (error) return { error: error.message };
  await supabase
    .from("cleaning_duty_pool")
    .delete()
    .eq("location_id", input.location_id);
  revalidatePath("/admin/cleaning");
  revalidatePath("/dashboard");
  return { ok: true };
}
