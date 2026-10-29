// Di build Vercel tipe sharp tidak ter-resolve lewat "exports" (TS7016), padahal di lokal ter-resolve.
// Diabaikan agar build tidak gagal; runtime tidak terpengaruh.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sharp from "sharp";

/**
 * Kotak batas ukuran. Lebih longgar dari unggahan baru di browser (sisi terpanjang 1280) karena ini MENIMPA berkas
 * lama secara permanen: tangkapan layar portrait (mis. 1080x2400, bukti transfer) tetap terbaca teksnya, sedangkan
 * foto landscape/portrait biasa tetap mengecil banyak.
 */
export const SHORT_EDGE = 1280;
export const LONG_EDGE = 1920;
export const QUALITY = 70;
/** Hasil harus minimal sekecil ini dari aslinya, kalau tidak berkas dibiarkan. */
export const MIN_GAIN_RATIO = 0.85;

export interface CompressOutcome {
  buffer: Buffer;
  /** Apakah hasil cukup kecil untuk menggantikan aslinya. */
  worthIt: boolean;
}

async function boxFor(input: Buffer) {
  const { width = 0, height = 0, orientation = 1 } = await sharp(input).metadata();
  // EXIF orientasi 5–8 menukar lebar dan tinggi setelah .rotate().
  const swapped = orientation >= 5;
  const w = swapped ? height : width;
  const h = swapped ? width : height;
  const portrait = h > w;
  return {
    width: portrait ? SHORT_EDGE : LONG_EDGE,
    height: portrait ? LONG_EDGE : SHORT_EDGE,
    fit: "inside" as const,
    withoutEnlargement: true,
  };
}

/** Murni (tanpa jaringan): kecilkan satu JPEG. Orientasi EXIF diterapkan lalu metadata dibuang. */
export async function recompressJpeg(input: Buffer): Promise<CompressOutcome> {
  const buffer = await sharp(input)
    .rotate()
    .resize(await boxFor(input))
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
  return { buffer, worthIt: buffer.length <= input.length * MIN_GAIN_RATIO };
}
