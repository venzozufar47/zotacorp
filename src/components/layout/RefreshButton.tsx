"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tombol "Muat ulang" ringkas di bilah navigasi bawah (mobile). Aplikasi terpasang sebagai PWA tanpa bilah alamat, sehingga
 * sebelumnya satu-satunya cara memuat ulang adalah menutup paksa aplikasi. Service worker kita tidak menyimpan halaman
 * (lihat public/sw.js), jadi muat ulang penuh selalu mengambil data dan versi terbaru dari server.
 *
 * Hanya ikon kecil (18 px, tanpa lingkaran dan tanpa label) supaya tidak menyaingi tab navigasi, tetapi area ketuknya tetap
 * 44 × 44 px (padding, bukan gambar) agar mudah ditekan. `aria-label` menggantikan label teks untuk pembaca layar.
 */
export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  function reload() {
    if (spinning) return;
    setSpinning(true);
    // Beri jeda sekejap supaya putaran ikon terlihat sebelum halaman diganti.
    window.setTimeout(() => window.location.reload(), 250);
  }

  return (
    <button
      type="button"
      onClick={reload}
      aria-label="Muat ulang halaman"
      title="Muat ulang"
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-foreground"
    >
      <RefreshCw size={18} strokeWidth={2.25} className={cn(spinning && "animate-spin")} aria-hidden />
    </button>
  );
}
