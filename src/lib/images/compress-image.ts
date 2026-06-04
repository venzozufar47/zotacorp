"use client";

/**
 * Resize + re-encode an image File on the client (canvas) before upload,
 * so phone photos (often 1–4 MB) don't bloat Supabase Storage. Non-image
 * files (e.g. PDF) pass through untouched. If anything fails — or the
 * result isn't actually smaller — the original file is returned so an
 * upload never breaks because of compression.
 *
 * Default: longest edge ≤ 1600px, JPEG quality 0.7. A typical 1.5 MB
 * receipt photo lands around ~150–250 KB while staying easily readable.
 */
export async function compressImageFile(
  file: File,
  opts?: { maxDim?: number; quality?: number }
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const maxDim = opts?.maxDim ?? 1600;
  const quality = opts?.quality ?? 0.7;

  try {
    const bitmap = await createImageBitmap(file);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
