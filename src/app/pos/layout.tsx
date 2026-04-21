import type { Viewport } from "next";

/**
 * Minimal shell for POS routes. Tidak punya sidebar admin / header
 * employee — UI didesain untuk karyawan memegang HP, satu layar.
 *
 * `maximumScale: 1` + `userScalable: false` mencegah double-tap zoom
 * di iOS Safari yang bisa menyebabkan mis-tap pada blok produk.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
