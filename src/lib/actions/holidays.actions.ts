"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";

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

/** Indonesia 2026 national holidays (SKB 3 Menteri, excludes cuti bersama). */
const HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "Tahun Baru Masehi" },
  { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad saw." },
  { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili" },
  { date: "2026-03-19", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
  { date: "2026-03-21", name: "Idulfitri 1447 H" },
  { date: "2026-03-22", name: "Idulfitri 1447 H" },
  { date: "2026-04-03", name: "Wafat Yesus Kristus" },
  { date: "2026-04-05", name: "Kebangkitan Yesus Kristus (Paskah)" },
  { date: "2026-05-01", name: "Hari Buruh Internasional" },
  { date: "2026-05-14", name: "Kenaikan Yesus Kristus" },
  { date: "2026-05-27", name: "Iduladha 1447 H" },
  { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE" },
  { date: "2026-06-01", name: "Hari Lahir Pancasila" },
  { date: "2026-06-16", name: "Tahun Baru Islam 1448 H" },
  { date: "2026-08-17", name: "Proklamasi Kemerdekaan" },
  { date: "2026-08-25", name: "Maulid Nabi Muhammad saw." },
  { date: "2026-12-25", name: "Kelahiran Yesus Kristus" },
];

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
