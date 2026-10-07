import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { TASK_EVIDENCE_BUCKET } from "./types";

/** URL bertanda-tangan 30 menit untuk foto bukti (path → url). */
export async function signEvidencePhotos(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await createAdminClient()
    .storage.from(TASK_EVIDENCE_BUCKET)
    .createSignedUrls(unique, 1800);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}
