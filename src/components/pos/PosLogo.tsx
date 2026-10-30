import Image from "next/image";
import type { PosPalette } from "@/lib/pos/branch";

/**
 * Logo POS (maskot). Berkas sudah dipotong dan dikompres (256px WebP ±10 KB), jadi `unoptimized` —
 * tidak perlu optimizer gambar Next untuk berkas sekecil ini.
 *
 * Palet "mamaya" memakai lencana huruf M berwarna merek (burgundy) — sementara, sampai berkas logo
 * Mamaya House tersedia — supaya tidak tertukar dengan maskot Haengbocake.
 */
export function PosLogo({
  size = 36,
  className = "",
  palette = "pink",
}: {
  size?: number;
  className?: string;
  palette?: PosPalette;
}) {
  if (palette === "mamaya") {
    return (
      <span
        role="img"
        aria-label="Mamaya House"
        style={{ width: size, height: size, fontSize: size * 0.55 }}
        className={`shrink-0 inline-flex items-center justify-center rounded-2xl bg-primary font-display font-bold leading-none text-primary-foreground ${className}`}
      >
        M
      </span>
    );
  }
  return (
    <Image
      src="/pos-logo.webp"
      alt="POS"
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
