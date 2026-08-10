"use client";

/**
 * Resize + re-encode an image File on the client (canvas) before upload,
 * so phone photos (often 1–4 MB) don't bloat Supabase Storage. Non-image
 * files (e.g. PDF) pass through untouched. If anything fails — or the
 * result isn't actually smaller — the original file is returned so an
 * upload never breaks because of compression.
 *
 * Format: WebP, falling back to JPEG when the browser can't encode it.
 * Measured on 15 real photos pulled from production (Aug 2026), WebP q70
 * lands at 30–56% of the same image as JPEG q70/q72, at visually equal
 * quality. Storage is the binding constraint on the org's Supabase quota,
 * so the format switch is worth the small amount of plumbing below.
 *
 * Default longest edge is 1280, down from the previous 1600. That number
 * is not arbitrary: at 960 the totals on a photographed thermal receipt
 * stayed readable but the fine print did not — a 16-digit NPWP became
 * illegible and one character of a transaction serial misread. At 1280
 * every field was recovered, for 42% of the original bytes instead of
 * 30%. Twelve points of size is cheap next to misreading a serial.
 */

/** Longest edge for documents: receipts, proofs, invoices — text must survive. */
export const MAX_EDGE_DOCUMENT = 1280;

/** Longest edge for scene/face photos, where no small text is being read. */
export const MAX_EDGE_PHOTO = 960;

/** Shared quality for both. Chosen against real samples, not by feel. */
export const IMAGE_QUALITY = 0.7;

/**
 * Encode a canvas to WebP, or JPEG when the browser won't.
 *
 * The fallback is not optional. Per the HTML spec, `toBlob` with an
 * unsupported type silently encodes PNG instead of failing — and a PNG of
 * a photo is far LARGER than the JPEG we were trying to replace. So the
 * result type is checked rather than assumed; older Safari hits this path.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  quality: number = IMAGE_QUALITY
): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality)
  );
  if (webp && webp.type === "image/webp") return webp;

  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
}

/** File extension matching an encoded blob, for building storage paths. */
export function extensionFor(blob: Blob): string {
  return blob.type === "image/webp" ? "webp" : "jpg";
}

export async function compressImageFile(
  file: File,
  opts?: { maxDim?: number; quality?: number }
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const maxDim = opts?.maxDim ?? MAX_EDGE_DOCUMENT;
  const quality = opts?.quality ?? IMAGE_QUALITY;

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

    const blob = await encodeCanvas(canvas, quality);
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.${extensionFor(blob)}`, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
