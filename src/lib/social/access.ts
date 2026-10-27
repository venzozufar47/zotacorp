/**
 * Akses laporan sosmed mingguan: owner (admin) atau pengisi terdaftar (`social_report_editors`).
 * Di React `cache()` — sekali per-request, dipakai layout + halaman.
 */

import { cache } from "react";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

export const isSocialReportEditor = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const db = createAdminClient();
  const { data } = await db
    .from("social_report_editors" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
});

/** Boleh melihat & mengisi laporan mingguan. */
export const canUseSocialReports = cache(async (): Promise<boolean> => {
  if ((await getCurrentRole()) === "admin") return true;
  return await isSocialReportEditor();
});
