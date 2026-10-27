/**
 * Akses laporan sosmed mingguan: owner (admin) atau pengisi terdaftar (`social_report_editors`), dan pengisi hanya
 * boleh brand yang ditunjuk (`brand_ids`). Di React `cache()` — sekali per-request, dipakai layout + halaman.
 */

import { cache } from "react";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/** Brand yang boleh diisi pengguna ini; pengisi tanpa brand dianggap bukan pengisi. */
export const editorBrandIds = cache(async (): Promise<string[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await createAdminClient()
    .from("social_report_editors" as never)
    .select("brand_ids")
    .eq("user_id", user.id)
    .maybeSingle();
  return ((data as { brand_ids?: string[] } | null)?.brand_ids ?? []) as string[];
});

export const isSocialReportEditor = cache(async (): Promise<boolean> => (await editorBrandIds()).length > 0);

/** Boleh melihat & mengisi laporan mingguan. */
export const canUseSocialReports = cache(async (): Promise<boolean> => {
  if ((await getCurrentRole()) === "admin") return true;
  return await isSocialReportEditor();
});

/** null = semua brand (owner); selain itu daftar brand yang boleh. */
export const allowedSocialBrandIds = cache(async (): Promise<string[] | null> => {
  if ((await getCurrentRole()) === "admin") return null;
  return await editorBrandIds();
});
