/**
 * Fitur Tugas untuk sementara hanya melayani tim Haengbocake Semarang.
 * Satu-satunya tempat yang menentukan siapa yang boleh ditugaskan — daftar
 * penerima di UI, matriks, DAN validasi server memakai fungsi ini, supaya
 * UI dan server tidak pernah berbeda pendapat.
 *
 * Basisnya unit bisnis (`profiles.business_unit`), BUKAN lokasi absen:
 * `employee_locations` hanya menandai tempat absen, dan banyak anggota tim
 * Semarang tidak punya lokasi "Haengbocake Semarang" (admin tanpa lokasi,
 * baker di Mamaya House). Karena Haengbocake juga punya tim Pare, yang
 * terdaftar di lokasi Pare dikecualikan.
 */
export const TASK_ASSIGNEE_UNIT = "Haengbocake";

/** Label tim untuk pesan ke admin. */
export const TASK_ASSIGNEE_LOCATION = "Haengbocake Semarang";

/** Lokasi absen yang menandai karyawan tim Pare (dikecualikan dari Tugas). */
export const TASK_EXCLUDED_LOCATIONS = ["Haengbocorner Pare", "Rumah Ibuk Pare"];

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Id karyawan AKTIF unit Haengbocake yang tidak terdaftar di lokasi Pare.
 * Kalau lokasi Pare ada tapi kueri anggotanya gagal, hasilnya dikosongkan
 * (gagal tertutup) — lebih baik tak ada yang bisa ditugaskan daripada
 * tim yang salah.
 */
export async function listEligibleAssigneeIds(db: any): Promise<Set<string>> {
  const { data: people, error } = await db
    .from("profiles")
    .select("id")
    .eq("role", "employee")
    .eq("is_active", true)
    .eq("business_unit", TASK_ASSIGNEE_UNIT);
  if (error || !people) return new Set();
  const ids = new Set<string>(people.map((p: any) => p.id));

  const { data: locs, error: locErr } = await db
    .from("attendance_locations")
    .select("id")
    .in("name", TASK_EXCLUDED_LOCATIONS);
  if (locErr) return new Set();
  const locIds = (locs ?? []).map((l: any) => l.id);
  if (locIds.length > 0) {
    const { data: links, error: linkErr } = await db
      .from("employee_locations")
      .select("employee_id")
      .in("location_id", locIds);
    if (linkErr) return new Set();
    for (const l of links ?? []) ids.delete(l.employee_id);
  }
  return ids;
}
