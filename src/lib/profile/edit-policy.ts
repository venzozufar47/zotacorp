/**
 * Siapa boleh mengubah kolom profil apa (docs/STATE_MACHINES.md SM-6).
 *
 * Karyawan hanya boleh mengubah data diri dasar miliknya. Jadwal kerja,
 * toleransi telat, pengaturan gaji/bonus, pengecualian slip, dan konfigurasi
 * kepegawaian lain hanya boleh diubah admin.
 *
 * Pengecualian onboarding: unit bisnis, jabatan, dan tanggal mulai kerja
 * diisi sendiri oleh karyawan baru (registrasi tidak mengisinya, dan unit
 * bisnis + jabatan wajib untuk profil lengkap yang membuka slip gaji). Karena
 * itu karyawan boleh mengisinya SEKALI selama masih kosong; setelah terisi
 * hanya admin yang bisa mengubahnya.
 *
 * Daftar yang sama dipakai trigger DB `profiles_guard_columns` (migrasi 324)
 * untuk tulisan langsung lewat PostgREST. Ubah keduanya bersamaan.
 */

/** Data diri dasar: bebas diubah karyawan pemilik profil. */
export const SELF_EDITABLE_FIELDS = [
  "full_name",
  "nickname",
  "gender",
  "date_of_birth",
  "place_of_birth",
  "current_city",
  "whatsapp_number",
  "npwp",
  "npwp_not_applicable",
  "emergency_contact_name",
  "emergency_contact_whatsapp",
  "motto",
  "shirt_size",
  "domisili_provinsi",
  "domisili_kota",
  "domisili_kecamatan",
  "domisili_kelurahan",
  "domisili_alamat",
  "asal_provinsi",
  "asal_kota",
  "asal_kecamatan",
  "asal_kelurahan",
  "asal_alamat",
] as const;

/** Data kepegawaian yang diisi karyawan saat onboarding: boleh diisi selama masih kosong. */
export const ONBOARDING_ONCE_FIELDS = ["business_unit", "job_role", "first_day_of_work"] as const;

/** Konfigurasi kepegawaian/gaji: hanya admin. */
export const ADMIN_ONLY_FIELDS = [
  "is_flexible_schedule",
  "work_start_time",
  "work_end_time",
  "grace_period_min",
  "workday_check_enabled",
  "workdays",
  "break_enabled",
  "break_windows",
  "holiday_bonus_enabled",
  "extra_work_enabled",
  "payslip_excluded",
  "is_probation",
] as const;

export const ALL_EDITABLE_FIELDS = [
  ...SELF_EDITABLE_FIELDS,
  ...ONBOARDING_ONCE_FIELDS,
  ...ADMIN_ONLY_FIELDS,
] as const;

export type OnboardingField = (typeof ONBOARDING_ONCE_FIELDS)[number];

export const ONBOARDING_FIELD_LABEL: Record<OnboardingField, string> = {
  business_unit: "Unit bisnis",
  job_role: "Jabatan",
  first_day_of_work: "Tanggal mulai kerja",
};

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * Saring patch profil sesuai peran pemanggil.
 *
 * - Admin: semua kolom yang dikenal.
 * - Karyawan (mengubah profilnya sendiri): data diri dasar; kolom onboarding
 *   hanya bila tersimpan masih kosong (nilai sama dengan tersimpan diabaikan,
 *   nilai berbeda ditolak); kolom admin-only selalu dibuang diam-diam, karena
 *   formulir mengirim seluruh isian tiap kali satu bagian disimpan.
 *
 * `patch` sudah melalui normalisasi; string kosong sudah menjadi null.
 */
export function filterProfilePatch(
  patch: Record<string, unknown>,
  opts: { isAdmin: boolean; stored: Partial<Record<OnboardingField, unknown>> }
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  if (opts.isAdmin) {
    for (const k of ALL_EDITABLE_FIELDS) if (k in patch) out[k] = patch[k];
    return { ok: true, patch: out };
  }
  for (const k of SELF_EDITABLE_FIELDS) if (k in patch) out[k] = patch[k];
  for (const k of ONBOARDING_ONCE_FIELDS) {
    if (!(k in patch)) continue;
    const next = patch[k];
    const stored = opts.stored[k];
    if (isEmpty(stored)) {
      if (!isEmpty(next)) out[k] = next;
      continue;
    }
    if (String(next ?? "") !== String(stored)) {
      return {
        ok: false,
        error: `${ONBOARDING_FIELD_LABEL[k]} sudah terisi dan hanya bisa diubah admin.`,
      };
    }
  }
  return { ok: true, patch: out };
}
