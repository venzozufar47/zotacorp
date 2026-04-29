"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/cached";
import { newAvatarSeed } from "@/lib/avatar";

/** Generate a fresh DiceBear seed (different face) for the current user. */
export async function regenerateAvatarSeed(): Promise<
  { ok: true; seed: string } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const seed = newAvatarSeed();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_seed: seed, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/admin/users");
  return { ok: true, seed };
}

/**
 * Upload a photo to Supabase Storage and set as avatar_url. Path is
 * `avatars/<user_id>/<ts>.<ext>`. Old avatar (if uploaded photo) is
 * deleted; DiceBear-only profiles have nothing to delete.
 */
export async function uploadAvatar(
  formData: FormData
): Promise<{ ok: true; url: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file uploaded" };
  if (file.size === 0) return { error: "File is empty" };
  if (file.size > 5 * 1024 * 1024) return { error: "File maks 5 MB" };
  if (!file.type.startsWith("image/")) return { error: "Hanya file gambar" };

  const supabase = await createClient();

  // Delete the previous uploaded photo (if any) so we don't accumulate.
  const { data: prev } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  if (prev?.avatar_url) {
    const path = extractStoragePath(prev.avatar_url);
    if (path) await supabase.storage.from("avatars").remove([path]);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) return { error: uploadErr.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = data.publicUrl;

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (updateErr) return { error: updateErr.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/admin/users");
  return { ok: true, url };
}

/** Clear uploaded photo — falls back to DiceBear next render. */
export async function clearUploadedAvatar(): Promise<
  { ok: true } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();

  const { data: prev } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  if (prev?.avatar_url) {
    const path = extractStoragePath(prev.avatar_url);
    if (path) await supabase.storage.from("avatars").remove([path]);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Extract storage path from a Supabase public URL ("/avatars/<path>"). */
function extractStoragePath(publicUrl: string): string | null {
  const marker = "/avatars/";
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.slice(idx + marker.length);
}
