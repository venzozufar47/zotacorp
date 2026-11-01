import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isWorkdayFor, jakartaDayOfWeek } from "@/lib/utils/workdays";

/**
 * Opname bahan hanya berlaku di hari kerja petugas pengadaan. Hari kerja = bitmask `profiles.workdays` (bit 0 = Minggu ...
 * bit 6 = Sabtu; bawaan 126 = Senin–Sabtu). Di luar hari kerja: banner/daftar opname disembunyikan, halaman dan penyimpanan
 * opname ditolak, dan pengingat tidak dikirim. Owner (admin) tidak dibatasi.
 */
const TZ = "Asia/Jakarta";

/** Murni: apakah `now` bukan hari kerja untuk bitmask ini. Bitmask kosong/tidak ada dianggap bawaan (Senin–Sabtu). */
export function isOffWorkday(workdays: number | null | undefined, now: Date = new Date()): boolean {
  const mask = typeof workdays === "number" ? workdays : 126;
  return !isWorkdayFor(mask, jakartaDayOfWeek(now, TZ));
}

/** Id petugas (dari `userIds`) yang hari ini BUKAN hari kerjanya. */
export async function offWorkdayUserIds(
  admin: SupabaseClient<Database>,
  userIds: string[],
  now: Date = new Date()
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data } = await admin.from("profiles").select("id, workdays").in("id", userIds);
  return new Set((data ?? []).filter((p) => isOffWorkday(p.workdays, now)).map((p) => p.id));
}

export const OFF_WORKDAY_MESSAGE = "Hari ini bukan hari kerjamu, jadi opname tidak diperlukan.";
