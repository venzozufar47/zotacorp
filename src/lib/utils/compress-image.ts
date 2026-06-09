/**
 * Client-side image compression — downscale to a max edge + re-encode to JPEG
 * at high quality. Used before uploading to storage so we don't keep multi-MB
 * phone originals when a perceptually-equivalent ~200 KB version suffices.
 *
 * Safe by design:
 *  - Non-images and vector/animated formats (svg/gif) pass through untouched.
 *  - If decoding fails, the original is returned (never blocks an upload).
 *  - If the compressed result isn't smaller, the original is kept.
 */
export interface CompressOptions {
  /** Cap for the longest edge in px (aspect preserved). Default 1600. */
  maxDim?: number;
  /** JPEG quality 0..1. Default 0.82 (visually near-lossless). */
  quality?: number;
}

export interface CompressedImage {
  blob: Blob;
  /** MIME type of `blob` (e.g. "image/jpeg", or the original's type). */
  contentType: string;
  /** File extension matching `contentType` (no dot). */
  ext: string;
}

function extForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

function passthrough(input: Blob): CompressedImage {
  const type = input.type || "image/jpeg";
  return { blob: input, contentType: type, ext: extForType(type) };
}

export async function compressImage(
  input: Blob,
  opts: CompressOptions = {}
): Promise<CompressedImage> {
  const { maxDim = 1600, quality = 0.82 } = opts;

  // Only raster images; leave vector/animated formats alone.
  if (
    !input.type.startsWith("image/") ||
    input.type === "image/svg+xml" ||
    input.type === "image/gif"
  ) {
    return passthrough(input);
  }
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return passthrough(input);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    return passthrough(input); // undecodable → upload as-is
  }

  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return passthrough(input);
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) return passthrough(input);

    // Keep whichever is smaller (e.g. already-optimized small images).
    if (blob.size < input.size) {
      return { blob, contentType: "image/jpeg", ext: "jpg" };
    }
    return passthrough(input);
  } finally {
    bitmap.close?.();
  }
}
