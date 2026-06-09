"use client";

import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { compressImageFile } from "@/lib/images/compress-image";

/**
 * Helpers for the public `cleaning-refs` bucket (admin reference photos).
 * The browser client is created lazily once and reused — createClient() is
 * not memoized, so calling it per render (e.g. for every thumbnail) is waste.
 */
const REF_BUCKET = "cleaning-refs";

let cached: ReturnType<typeof createClient> | null = null;
const client = () => (cached ??= createClient());

/** Public URL for a reference photo path (bucket is public — sync, no fetch). */
export function cleaningRefUrl(path: string): string {
  return client().storage.from(REF_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Compress + upload an admin reference image; returns the storage path or null. */
export async function uploadCleaningRef(
  folder: string,
  file: File
): Promise<string | null> {
  const out = await compressImageFile(file);
  const ext = out.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client()
    .storage.from(REF_BUCKET)
    .upload(path, out, { upsert: false, contentType: out.type || "image/jpeg" });
  if (error) {
    toast.error("Gagal mengunggah foto contoh.");
    return null;
  }
  return path;
}
