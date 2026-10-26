/**
 * Sisi database untuk pemeriksa selfie check-in (lihat selfie-gate.ts). Modul server biasa.
 * Tabel baru (migrasi 192) belum ada di types.ts tulisan tangan, jadi klien di-cast longgar.
 */
import type { createAdminClient } from "@/lib/actions/_supabase-admin";
import { jakartaDateString } from "@/lib/utils/jakarta";
import type { SelfieFilters, SelfieRuleSet } from "@/lib/attendance/selfie-gate";
import { uniformRequiredHijabColor } from "@/lib/attendance/selfie-gate";

/** Maks. foto yang diperiksa AI per karyawan per hari; lewat itu foto diterima tanpa AI (cegah biaya melonjak). */
export const SELFIE_AI_DAILY_CAP = 6;

/** Foto pertama dalam jendela ini dianggap awal sesi check-in (waktu absen dihitung dari situ). */
export const SELFIE_SESSION_WINDOW_MS = 20 * 60_000;

/** Kasus "tetap absen walau ditolak AI" hilang sendiri dari Inbox admin setelah sekian hari. */
export const SELFIE_OVERRIDE_INBOX_DAYS = 3;

type Admin = ReturnType<typeof createAdminClient>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (table: string) => any };

export function looseDb(client: Admin): LooseDb {
  return client as unknown as LooseDb;
}

/** Awal hari ini (WIB) sebagai ISO UTC. */
export function jakartaDayStartIso(now = new Date()): string {
  return new Date(`${jakartaDateString(now)}T00:00:00+07:00`).toISOString();
}

/** Aturan selfie untuk karyawan ini, atau null bila unit bisnisnya tidak dikenai filter. */
export async function loadSelfieRules(client: Admin, userId: string): Promise<SelfieRuleSet | null> {
  const db = looseDb(client);
  const { data: profile } = await client
    .from("profiles")
    .select("business_unit, gender")
    .eq("id", userId)
    .maybeSingle();
  const unit = profile?.business_unit;
  if (!unit) return null;
  const [{ data: rule }, { data: userRule }] = await Promise.all([
    db.from("attendance_selfie_rules").select("enabled, filters").eq("business_unit", unit).maybeSingle(),
    db.from("attendance_selfie_user_rules").select("head_cover, ai_exempt").eq("user_id", userId).maybeSingle(),
  ]);
  if (!rule?.enabled) return null;
  // Dibebaskan dari AI per karyawan: sama dengan unit tanpa filter (tanpa panduan kamera, tanpa pemeriksaan).
  if (userRule?.ai_exempt === true) return null;
  const f = (rule.filters ?? {}) as Partial<SelfieFilters>;
  // Ketentuan Seragam Tim Perempuan Haengbocake: khusus profil Female,
  // dan hanya hari yang punya ketentuan (Senin-Sabtu; null = Minggu).
  const requiredHijabColor = uniformRequiredHijabColor(jakartaDateString(new Date()));
  const uniformActive = f.uniform === true && profile?.gender === "Female" && requiredHijabColor !== null;
  return {
    filters: {
      indoor: f.indoor === true,
      face_full: f.face_full === true,
      no_mask: f.no_mask === true,
      apron: f.apron === true,
      lanyard: f.lanyard === true,
      uniform: uniformActive,
    },
    headCover: userRule?.head_cover === true,
    requiredHijabColor: uniformActive ? requiredHijabColor : null,
  };
}

/**
 * Waktu efektif check-in: bila karyawan sudah selfie lebih awal dalam sesi ini (lalu foto ulang),
 * pakai waktu foto PERTAMA agar foto ulang tidak membuatnya terlambat. Hanya baris yang ditulis
 * server (service role) yang dihitung, jadi tidak bisa dipalsukan klien.
 */
export function effectiveCheckInTime(now: Date, firstAttemptAt: string | null): Date {
  if (!firstAttemptAt) return now;
  const first = new Date(firstAttemptAt);
  if (Number.isNaN(first.getTime()) || first.getTime() > now.getTime()) return now;
  if (now.getTime() - first.getTime() > SELFIE_SESSION_WINDOW_MS) return now;
  return first;
}
