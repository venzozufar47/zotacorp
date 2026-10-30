/**
 * Pembacaan feedback pelanggan untuk scorecard cabang (sisi server, service-role). Bukan berkas "use server" supaya
 * tidak terbuka sebagai endpoint.
 */

import type { createAdminClient } from "@/lib/actions/_supabase-admin";
import type { FeedbackBranch } from "./constants";

type Admin = ReturnType<typeof createAdminClient>;

/** Awal hari `iso` (YYYY-MM-DD) menurut WIB, sebagai timestamp UTC ISO. */
export const wibDayStart = (iso: string) => new Date(`${iso}T00:00:00+07:00`).toISOString();

/**
 * Bintang feedback yang tampil (tidak disembunyikan) untuk satu cabang pada jendela [from, to] (tanggal WIB, inklusif),
 * plus tanggal WIB feedback pertama cabang itu (untuk menghitung hari target). Dipaginasi: batas 1000 baris PostgREST.
 */
export async function loadFeedbackWindow(
  admin: Admin,
  branch: FeedbackBranch,
  from: string,
  to: string
): Promise<{ ratings: number[]; firstDate: string | null }> {
  const ratings: number[] = [];
  const PAGE = 1000;
  const end = new Date(new Date(wibDayStart(to)).getTime() + 86_400_000).toISOString();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("customer_feedback" as never)
      .select("rating")
      .eq("branch", branch)
      .eq("hidden", false)
      .gte("created_at", wibDayStart(from))
      .lt("created_at", end)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { rating: number }[];
    ratings.push(...page.map((r) => Number(r.rating)));
    if (page.length < PAGE) break;
  }
  const { data: first } = await admin
    .from("customer_feedback" as never)
    .select("created_at")
    .eq("branch", branch)
    .eq("hidden", false)
    .order("created_at", { ascending: true })
    .limit(1);
  const firstAt = ((first ?? []) as { created_at: string }[])[0]?.created_at ?? null;
  const firstDate = firstAt
    ? new Date(new Date(firstAt).getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
    : null;
  return { ratings, firstDate };
}
