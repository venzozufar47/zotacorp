"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { NATIONAL_HOLIDAYS } from "@/lib/holidays/indonesia";

export interface HolidayRow {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true };
}

export async function listHolidays(): Promise<HolidayRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("national_holidays")
    .select("id, holiday_date, name")
    .order("holiday_date");
  if (error || !data) return [];
  return data.map((h) => ({ id: h.id, date: h.holiday_date, name: h.name }));
}

export async function createHoliday(input: {
  date: string;
  name: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const date = input.date?.trim();
  const name = input.name?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Tanggal tidak valid (format YYYY-MM-DD)." };
  }
  if (!name) return { error: "Nama hari libur wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("national_holidays")
    .insert({ holiday_date: date, name });
  if (error) {
    if (error.code === "23505") return { error: "Tanggal itu sudah ada di daftar." };
    return { error: error.message };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function deleteHoliday(input: {
  id: string;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("national_holidays")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Indonesia 2026 national holidays (SKB 3 Menteri, excludes cuti bersama): sumber tunggal di `@/lib/holidays/indonesia`. */
const HOLIDAYS_2026 = NATIONAL_HOLIDAYS.filter((h) => h.date.startsWith("2026-"));

/** Idempotent: insert any 2026 national holidays not already present. */
export async function seedHolidays2026(): Promise<
  { ok: true; inserted: number } | { error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("national_holidays")
    .upsert(
      HOLIDAYS_2026.map((h) => ({ holiday_date: h.date, name: h.name })),
      { onConflict: "holiday_date", ignoreDuplicates: true }
    )
    .select("id");
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true, inserted: data?.length ?? 0 };
}

/**
 * Samakan tabel `national_holidays` (dipakai absensi) dengan daftar resmi 2026–2027: tambahkan yang belum ada. Tanggal yang
 * sudah ada tidak diubah dan tanggal tambahan manual tidak dihapus.
 */
export async function syncOfficialHolidays(): Promise<{ ok: true; inserted: number } | { error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("national_holidays")
    .upsert(
      NATIONAL_HOLIDAYS.map((h) => ({ holiday_date: h.date, name: h.name })),
      { onConflict: "holiday_date", ignoreDuplicates: true }
    )
    .select("id");
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/admin/kalender-libur");
  return { ok: true, inserted: data?.length ?? 0 };
}
