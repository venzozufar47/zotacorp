// Di build Vercel tipe sharp tidak ter-resolve lewat "exports" (TS7016), padahal di lokal ter-resolve.
// Diabaikan agar build tidak gagal; runtime tidak terpengaruh.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sharp from "sharp";

/** Sisi terpanjang & kualitas yang sama dengan unggahan baru di browser (compress-image.ts). */
export const MAX_EDGE = 1280;
export const QUALITY = 70;
/** Hasil harus minimal sekecil ini dari aslinya, kalau tidak berkas dibiarkan. */
export const MIN_GAIN_RATIO = 0.85;

export interface CompressOutcome {
  buffer: Buffer;
  /** Apakah hasil cukup kecil untuk menggantikan aslinya. */
  worthIt: boolean;
}

/** Murni (tanpa jaringan): kecilkan satu JPEG. Orientasi EXIF diterapkan lalu metadata dibuang. */
export async function recompressJpeg(input: Buffer): Promise<CompressOutcome> {
  const buffer = await sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
  return { buffer, worthIt: buffer.length <= input.length * MIN_GAIN_RATIO };
}
