/**
 * Satu aturan "profil lengkap". Dipakai kartu kelengkapan di dashboard karyawan,
 * gerbang slip gaji, dan tampilan admin supaya ketiganya selalu sepakat.
 *
 * Profil lengkap membuka slip gaji (lihat src/app/(employee)/payslips/page.tsx).
 */

export const REQUIRED_PROFILE_KEYS = [
  "full_name",
  "gender",
  "date_of_birth",
  "place_of_birth",
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
  "business_unit",
  "job_role",
  "whatsapp_number",
  "npwp",
  "emergency_contact_name",
  "emergency_contact_whatsapp",
] as const;

export type RequiredProfileKey = (typeof REQUIRED_PROFILE_KEYS)[number];

type ProfileLike = Record<string, unknown> | null | undefined;

/** NPWP dianggap terisi bila karyawan menyatakan tidak punya (profiles.npwp_not_applicable). */
export function isProfileKeyFilled(p: ProfileLike, key: string): boolean {
  if (key === "npwp" && p?.npwp_not_applicable === true) return true;
  const v = p?.[key];
  return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
}

export function missingProfileKeys(p: ProfileLike): RequiredProfileKey[] {
  return REQUIRED_PROFILE_KEYS.filter((k) => !isProfileKeyFilled(p, k));
}

export function isProfileComplete(p: ProfileLike): boolean {
  return missingProfileKeys(p).length === 0;
}
