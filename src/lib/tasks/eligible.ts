/**
 * Fitur Tugas untuk sementara hanya melayani karyawan satu lokasi kerja.
 * Satu-satunya tempat yang menentukan siapa yang boleh ditugaskan — daftar
 * penerima di UI, matriks, DAN validasi server memakai fungsi ini, supaya
 * UI dan server tidak pernah berbeda pendapat. Ubah konstanta ini (atau
 * jadikan setelan) bila cakupannya diperluas.
 */
export const TASK_ASSIGNEE_LOCATION = "Haengbocake Semarang";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Id karyawan AKTIF yang terdaftar di lokasi TASK_ASSIGNEE_LOCATION
 * (`employee_locations`). Kosong bila lokasinya tidak ditemukan — gagal
 * tertutup: lebih baik tak ada yang bisa ditugaskan daripada semua orang.
 */
export async function listEligibleAssigneeIds(db: any): Promise<Set<string>> {
  const { data: loc } = await db
    .from("attendance_locations")
    .select("id")
    .eq("name", TASK_ASSIGNEE_LOCATION)
    .maybeSingle();
  if (!loc) return new Set();

  const { data: links } = await db
    .from("employee_locations")
    .select("employee_id")
    .eq("location_id", loc.id);
  const ids = [...new Set<string>((links ?? []).map((l: any) => l.employee_id))];
  if (ids.length === 0) return new Set();

  const { data: people } = await db
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("role", "employee")
    .eq("is_active", true);
  return new Set<string>((people ?? []).map((p: any) => p.id));
}
