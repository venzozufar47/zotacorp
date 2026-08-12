"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedAttendanceSettings } from "@/lib/supabase/cached";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { jakartaDayOfWeek } from "@/lib/utils/workdays";
import { localHhmm } from "@/lib/utils/break-windows";
import type { RotationMode } from "@/lib/utils/cleaning-rotation";
import {
  buildCleaningRangeReport,
  type CleaningRangeReport,
  type RangeAssignmentInput,
  type RangeDay,
  type RangeItemInput,
} from "@/lib/cleaning/range-report";

/**
 * Laporan kebersihan untuk SATU RENTANG (7 / 30 hari) — skor cabang, kondisi
 * tiap titik, dan rekam jejak karyawan.
 *
 * Dipisah dari `cleaning.actions.ts` (sudah 2.000+ baris) karena ini permukaan
 * baca yang berbeda: satu action besar, tanpa mutasi.
 *
 * Aturan siapa-bertugas-kapan TIDAK diulang di sini — diperluas oleh
 * `buildCleaningRangeReport` dengan helper murni yang sama dengan checklist
 * karyawan. Lihat catatan di modul itu soal kenapa bukan RPC SQL.
 *
 * Jumlah query TETAP berapa pun panjang rentangnya: yang mahal adalah
 * round-trip per hari, bukan iterasi di memori.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 366;
const DAY_MS = 86_400_000;

/** Satu-satunya tempat "telat" didefinisikan: hanya jendela dengan batas akhir
 *  yang bisa dilewati. `anytime` & `after` tidak punya tenggat. */
function windowEndOf(mode: string | null, end: string | null): string | null {
  return mode === "before" || mode === "between" ? end : null;
}

type ChecklistShape = {
  id: string;
  name: string;
  is_active: boolean;
  items?: Array<{
    id: string;
    title: string;
    requires_photo: boolean;
    sort_order: number;
    photos?: Array<{ id: string }>;
  }>;
} | null;

function itemsOf(checklist: ChecklistShape): RangeItemInput[] {
  return (checklist?.items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      id: i.id,
      title: i.title,
      requiresPhoto: i.requires_photo,
      photoSlots: i.photos?.length ?? 0,
      sortOrder: i.sort_order,
    }));
}

export interface CleaningRangeEmployee {
  userId: string;
  name: string;
}

export interface CleaningRangeReportWithNames extends CleaningRangeReport {
  /** userId → nama, dipisah dari agregat supaya modul murni tidak perlu profil. */
  names: Record<string, string>;
}

export async function getCleaningRangeReport(input: {
  from: string;
  to: string;
  /** Hari terakhir yang masuk skor. Rentang selalu diambil ≥14 hari untuk
   *  strip; tanpa ini "Hari ini" akan menampilkan skor 14 hari. */
  scoreDays?: number;
}): Promise<ActionResult<CleaningRangeReportWithNames>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!ISO_DATE.test(input.from) || !ISO_DATE.test(input.to))
    return { ok: false, error: "Rentang tanggal tidak valid" };

  let from = input.from;
  let to = input.to;
  if (from > to) [from, to] = [to, from];
  const spanDays =
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  if (spanDays > MAX_SPAN_DAYS)
    return { ok: false, error: "Rentang maksimal 1 tahun" };

  const settings = await getCachedAttendanceSettings();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const supabase = await createClient();
  const now = new Date();
  const today = jakartaDateString(now);

  const [
    personRes,
    branchRes,
    completionRes,
    holidayRes,
    poolRes,
    presenceRes,
    locationRes,
  ] = await Promise.all([
    supabase
      .from("cleaning_assignments")
      .select(
        "id, user_id, weekdays, skip_holidays, window_mode, window_end, rotation_group_id, rotation_anchor, rotation_mode, rotation_order, rotation_member_count, checklist:cleaning_checklists!inner(id, name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order, photos:cleaning_item_photos(id))), profile:profiles!inner(is_active)"
      )
      .eq("is_active", true)
      .not("user_id", "is", null),
    supabase
      .from("cleaning_assignments")
      .select(
        "id, location_id, duty_slot, weekdays, skip_holidays, window_mode, window_end, rotation_anchor, checklist:cleaning_checklists!inner(id, name, is_active, items:cleaning_checklist_items(id, title, requires_photo, sort_order, photos:cleaning_item_photos(id)))"
      )
      .eq("is_active", true)
      .not("location_id", "is", null)
      .order("duty_slot", { ascending: true }),
    supabase
      .from("cleaning_task_completions")
      .select("item_id, user_id, date, completed_at, photo_path, photo_req_id")
      .gte("date", from)
      .lte("date", to),
    supabase.from("national_holidays").select("holiday_date, name"),
    supabase.from("cleaning_duty_pool").select("location_id, user_id, sort_order"),
    supabase
      .from("attendance_logs")
      .select("user_id, matched_location_id, date")
      .gte("date", from)
      .lte("date", to)
      .not("matched_location_id", "is", null),
    // Cabang = attendance_locations (tidak ada tabel cleaning_locations —
    // lokasi absensi sekaligus jadi cabang yang bisa dipasangi duty).
    supabase.from("attendance_locations").select("id, name"),
  ]);

  const assignments: RangeAssignmentInput[] = [];
  for (const a of personRes.data ?? []) {
    const checklist = a.checklist as ChecklistShape;
    const profile = a.profile as { is_active?: boolean } | null;
    if (!checklist?.is_active) continue;
    if (profile && profile.is_active === false) continue; // sembunyikan resign
    const items = itemsOf(checklist);
    if (items.length === 0) continue;
    assignments.push({
      id: a.id,
      kind: "person",
      userId: a.user_id,
      locationId: null,
      dutySlot: null,
      checklistId: checklist.id,
      checklistName: checklist.name,
      weekdays: a.weekdays,
      skipHolidays: a.skip_holidays,
      rotationGroupId: a.rotation_group_id,
      rotationAnchor: a.rotation_anchor,
      rotationMode: (a.rotation_mode as RotationMode) ?? "daily",
      rotationOrder: a.rotation_order,
      rotationMemberCount: a.rotation_member_count,
      windowEnd: windowEndOf(a.window_mode, a.window_end),
      items,
    });
  }
  for (const a of branchRes.data ?? []) {
    const checklist = a.checklist as ChecklistShape;
    if (!checklist?.is_active) continue;
    const items = itemsOf(checklist);
    if (items.length === 0) continue;
    assignments.push({
      id: a.id,
      kind: "branch",
      userId: null,
      locationId: a.location_id,
      dutySlot: a.duty_slot,
      checklistId: checklist.id,
      checklistName: checklist.name,
      weekdays: a.weekdays,
      skipHolidays: a.skip_holidays,
      rotationGroupId: null,
      rotationAnchor: a.rotation_anchor,
      // Duty cabang selalu berputar harian; rotasi per-orang tidak berlaku.
      rotationMode: "daily",
      rotationOrder: 0,
      rotationMemberCount: 1,
      windowEnd: windowEndOf(a.window_mode, a.window_end),
      items,
    });
  }

  // Nama & unit: pemilik assignment + seluruh anggota pool cabang.
  const userIds = new Set<string>();
  for (const a of assignments) if (a.userId) userIds.add(a.userId);
  for (const p of poolRes.data ?? []) userIds.add(p.user_id);
  const userUnits = new Map<string, string | null>();
  const names: Record<string, string> = {};
  if (userIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, business_unit")
      .in("id", [...userIds]);
    for (const p of profs ?? []) {
      userUnits.set(p.id, p.business_unit ?? null);
      names[p.id] = p.full_name || "—";
    }
  }

  const holidays = new Map(
    (holidayRes.data ?? []).map((h) => [h.holiday_date as string, h.name as string])
  );
  const days: RangeDay[] = [];
  const startMs = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < spanDays; i++) {
    const ymd = new Date(startMs + i * DAY_MS).toISOString().slice(0, 10);
    days.push({
      ymd,
      // Tengah hari menghindari kasus tepi pemetaan zona waktu.
      dow: jakartaDayOfWeek(new Date(`${ymd}T12:00:00`), tz),
      holiday: holidays.get(ymd) ?? null,
    });
  }

  const hhmm = /^(\d{2}):(\d{2})/.exec(localHhmm(now, tz));
  const report = buildCleaningRangeReport({
    days,
    today,
    scoreDays: input.scoreDays,
    nowMinutes: hhmm ? Number(hhmm[1]) * 60 + Number(hhmm[2]) : 0,
    // Jakarta tidak punya DST, jadi offsetnya tetap. Dititipkan sebagai angka
    // supaya modul agregasi tidak perlu tahu apa pun soal zona waktu.
    tzOffsetMinutes: 7 * 60,
    assignments,
    completions: (completionRes.data ?? []).map((c) => ({
      itemId: c.item_id,
      userId: c.user_id,
      date: c.date,
      completedAt: c.completed_at,
      photoPath: c.photo_path,
      photoReqId: c.photo_req_id,
    })),
    pool: (poolRes.data ?? []).map((p) => ({
      locationId: p.location_id,
      userId: p.user_id,
      sortOrder: p.sort_order,
    })),
    presence: (presenceRes.data ?? []).map((p) => ({
      locationId: p.matched_location_id as string,
      userId: p.user_id,
      date: p.date,
    })),
    locationNames: new Map(
      (locationRes.data ?? []).map((l) => [l.id as string, l.name as string])
    ),
    userUnits,
  });

  return { ok: true, data: { ...report, names } };
}
