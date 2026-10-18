import Image from "next/image";

/**
 * Logo POS (maskot). Berkas sudah dipotong dan dikompres (256px WebP ±10 KB), jadi `unoptimized` —
 * tidak perlu optimizer gambar Next untuk berkas sekecil ini.
 */
export function PosLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
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
