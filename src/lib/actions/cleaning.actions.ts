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
      "id, checklist_id, user_id, weekdays, block_checkout, is_active, window_mode, window_start, window_end, rotation_group_id, rotation_order, rotation_mode, rotation_member_count, checklist:cleaning_checklists(name), profile:profiles(full_name, business_unit)"
    )
    .order("rotation_order", { ascending: true })
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
      window_mode: a.window_mode,
      window_start: a.window_start,
      window_end: a.window_end,
      rotation_group_id: a.rotation_group_id,
      rotation_order: a.rotation_order,
      rotation_mode: a.rotation_mode,
      rotation_member_count: a.rotation_member_count,
    };
  });
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
    window_mode?: string;
    window_start?: string | null;
    window_end?: string | null;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };
  if (input.weekdays !== undefined) patch.weekdays = input.weekdays;
  if (input.block_checkout !== undefined) patch.block_checkout = input.block_checkout;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
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
    window_mode?: string;
    window_start?: string | null;
    window_end?: string | null;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };
  if (input.weekdays !== undefined) patch.weekdays = input.weekdays;
  if (input.block_checkout !== undefined) patch.block_checkout = input.block_checkout;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
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
  const tmpl = existing[0];
  const existingUsers = new Set(existing.map((e) => e.user_id));
  const newSet = new Set(members);

  // Remove members no longer in the rotation (cascades their completions).
  const removed = existing.filter((e) => !newSet.has(e.user_id)).map((e) => e.user_id);
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
          "id, checklist_id, weekdays, block_checkout, window_mode, window_start, window_end, rotation_group_id, rotation_order, rotation_mode, rotation_anchor, rotation_member_count, checklist:cleaning_checklists!inner(id, name, is_active, items:cleaning_checklist_items(id, title, note, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order)))"
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
        .select("id, item_id, photo_req_id, photo_path, completed_at")
        .eq("user_id", user.id)
        .eq("date", today),
    ]);

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
  const tasks: TodayTask[] = (assignments ?? [])
    .filter(
      (a) =>
        isWorkdayFor(a.weekdays, dow) &&
        (a.checklist as AssignmentChecklist)?.is_active &&
        isOnDutyToday({
          dateYmd: today,
          anchorYmd: a.rotation_anchor ?? today,
          dow,
          weekdays: a.weekdays,
          mode: (a.rotation_mode as RotationMode) ?? "daily",
          memberOrder: a.rotation_order,
          memberCount: a.rotation_member_count,
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

  // Independent reads in parallel: today's attendance log, the item, and the
  // assignment. Guards run after, in order.
  const [{ data: log }, { data: item }, { data: assignment }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("checked_in_at, checked_out_at")
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
        "id, checklist_id, user_id, weekdays, window_mode, window_start, window_end, rotation_anchor, rotation_mode, rotation_order, rotation_member_count"
      )
      .eq("id", input.assignment_id)
      .maybeSingle(),
  ]);

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
  if (!assignment || assignment.user_id !== user.id) {
    return { error: "Assignment tidak valid." };
  }
  if (assignment.checklist_id !== item.checklist_id) {
    return { error: "Item tidak termasuk dalam checklist ini." };
  }

  // Rotation: only the on-duty member may submit today.
  if (
    !isOnDutyToday({
      dateYmd: today,
      anchorYmd: assignment.rotation_anchor ?? today,
      dow: jakartaDayOfWeek(now, tz),
      weekdays: assignment.weekdays,
      mode: (assignment.rotation_mode as RotationMode) ?? "daily",
      memberOrder: assignment.rotation_order,
      memberCount: assignment.rotation_member_count,
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

  const [{ data: assignments }, { data: completions }] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select(
        "id, weekdays, rotation_anchor, rotation_mode, rotation_order, rotation_member_count, checklist:cleaning_checklists!inner(name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order)))"
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("block_checkout", true),
    supabase
      .from("cleaning_task_completions")
      .select("item_id, photo_req_id")
      .eq("user_id", user.id)
      .eq("date", today),
  ]);

  // Done units keyed by item + slot (null slot → "").
  const doneUnits = new Set(
    (completions ?? []).map((c) => `${c.item_id}|${c.photo_req_id ?? ""}`)
  );
  const blocking: BlockingChecklist[] = [];

  for (const a of assignments ?? []) {
    if (!isWorkdayFor(a.weekdays, dow)) continue;
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
        "id, user_id, weekdays, block_checkout, rotation_group_id, rotation_anchor, rotation_mode, rotation_order, rotation_member_count, checklist:cleaning_checklists!inner(name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order, photos:cleaning_item_photos(id, label, reference_photo_path, sort_order))), profile:profiles!inner(full_name, business_unit, is_active)"
      )
      .eq("is_active", true),
    supabase
      .from("cleaning_task_completions")
      .select("item_id, user_id, photo_req_id, photo_path, id")
      .eq("date", date),
  ]);

  // Index completions by `${user_id}|${item_id}|${photo_req_id ?? ""}`.
  const compMap = new Map(
    (completions ?? []).map((c) => [
      `${c.user_id}|${c.item_id}|${c.photo_req_id ?? ""}`,
      c,
    ])
  );

  const rows: MonitorRow[] = [];
  for (const a of assignments ?? []) {
    if (!isWorkdayFor(a.weekdays, dow)) continue;
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

    let completedCount = 0;
    let photoMissing = 0;
    const monitorItems: MonitorItem[] = items.map((it) => {
      const units: MonitorUnit[] = requiredUnits(it).map((u) => {
        const comp = compMap.get(`${a.user_id}|${it.id}|${u.photo_req_id ?? ""}`);
        const completed = !!comp;
        if (u.requires_photo && (!comp || !comp.photo_path)) photoMissing++;
        return {
          photo_req_id: u.photo_req_id,
          label: u.label,
          requires_photo: u.requires_photo,
          completed,
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
