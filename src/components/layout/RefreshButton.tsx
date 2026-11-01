"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tombol "Muat ulang" di bilah navigasi bawah (mobile). Aplikasi terpasang sebagai PWA tanpa bilah alamat, sehingga
 * sebelumnya satu-satunya cara memuat ulang adalah menutup paksa aplikasi. Service worker kita tidak menyimpan halaman
 * (lihat public/sw.js), jadi muat ulang penuh selalu mengambil data dan versi terbaru dari server.
 *
 * Bentuknya sengaja sama dengan tab navigasi lain (lingkaran ikon + label kecil) di sebelah menu profil: selalu terlihat,
 * tidak melayang di atas konten, dan tidak menambah baris baru.
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
      className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] transition-colors active:scale-95"
    >
      <span className="flex items-center justify-center size-9 rounded-full border-2 border-foreground bg-card text-muted-foreground">
        <RefreshCw size={16} strokeWidth={2.5} className={cn(spinning && "animate-spin")} />
      </span>
      <span className="font-display font-bold uppercase tracking-wide text-[0.625rem] text-muted-foreground">Muat ulang</span>
    </button>
  );
}
