/**
 * Cached access helpers modul Pengadaan.
 *
 *  - myProcurementBusinessUnits() : unit bisnis yang ditugaskan ke saya.
 *  - isProcurementStaff()         : punya ≥1 penugasan.
 *  - canManageProcurement()       : admin — atur penugasan & setelan.
 *  - canOpenProcurement()         : admin ATAU staf (menentukan nav).
 *
 * Semua di React `cache()` — sekali per-request, dipakai layout + page +
 * sidebar. Pola `src/lib/sim-cards/access.ts`.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/**
 * Daftar unit bisnis yang saya pegang. Ini SATU-SATUNYA sumber daftar BU
 * untuk staf — jangan pernah menerima `?bu=` yang tidak ada di sini
 * (kalau tidak, staf bisa mengintip brand lain).
 */
export const myProcurementBusinessUnits = cache(async (): Promise<string[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("procurement_assignments" as never)
    .select("business_unit")
    .eq("user_id", user.id)
    .order("business_unit");
  const set = new Set<string>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const bu = (r.business_unit as string | null)?.trim();
    if (bu) set.add(bu);
  }
  return Array.from(set);
});

export const isProcurementStaff = cache(async (): Promise<boolean> => {
  return (await myProcurementBusinessUnits()).length > 0;
});

export const canManageProcurement = cache(async (): Promise<boolean> => {
  return (await getCurrentRole()) === "admin";
});

export const canOpenProcurement = cache(async (): Promise<boolean> => {
  if (await canManageProcurement()) return true;
  return await isProcurementStaff();
});
