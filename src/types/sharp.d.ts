/**
 * `sharp` 0.35 mendeklarasikan `exports` tanpa kondisi `types`, jadi di bawah `moduleResolution: "bundler"` TypeScript tidak
 * menemukan tipenya (TS7016) dan `next build` gagal di Vercel. Di mesin lokal error ini tersembunyi karena TypeScript
 * menemukan `sharp` versi lama di folder induk worktree (`../node_modules`). Deklarasi ambien ini membuat type check tidak
 * bergantung pada versi atau lokasi `sharp`. Pemakaiannya kecil (recompress-jpeg.ts) dan diuji oleh recompress-jpeg.test.ts.
 */
declare module "sharp";
