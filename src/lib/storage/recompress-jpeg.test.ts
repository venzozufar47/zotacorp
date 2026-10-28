import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { recompressJpeg } from "./recompress-jpeg.ts";

async function noisyJpeg(w: number, h: number, quality: number): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality }).toBuffer();
}

test("foto kamera besar diperkecil ke sisi terpanjang 1280 dan jauh lebih kecil", async () => {
  const src = await noisyJpeg(3000, 2000, 92);
  const out = await recompressJpeg(src);
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(Math.max(meta.width!, meta.height!), 1280);
  assert.equal(out.worthIt, true);
  assert.ok(out.buffer.length < src.length * 0.5);
});

test("foto yang sudah kecil tidak diperbesar dan tidak ditandai layak ganti", async () => {
  const src = await noisyJpeg(400, 300, 40);
  const out = await recompressJpeg(src);
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.width, 400);
  assert.equal(out.worthIt, false);
});

test("orientasi EXIF diterapkan lalu metadata dibuang", async () => {
  const src = await sharp(await noisyJpeg(1600, 800, 90)).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer();
  const out = await recompressJpeg(src);
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.orientation, undefined);
  assert.ok(meta.height! > meta.width!); // landscape + rotasi 90° → portrait
});
