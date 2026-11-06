import Link from "next/link";
import { cn } from "@/lib/utils";

/** `pesanan` dan `riwayat` adalah nama lama: keduanya kini bagian dari tab `belanja`. */
export type PengadaanTab = "catat" | "belanja" | "stok" | "bahan";
export type BelanjaSection = "pesanan" | "riwayat";

const TABS: { key: PengadaanTab; label: string }[] = [
  { key: "catat", label: "Catat" },
  { key: "belanja", label: "Belanja" },
  { key: "stok", label: "Stok" },
  { key: "bahan", label: "Bahan" },
];

/**
 * Tab halaman Pengadaan (4 tab, muat di layar 360px tanpa menyempit). Lencana angka
 * menunjukkan pesanan yang belum tiba dan ikut mengisi lebar tab, bukan menimpa tetangga.
 */
export function PengadaanTabs({
  active,
  activeBrand,
  inTransitCount = 0,
}: {
  active: PengadaanTab;
  activeBrand: string | null;
  /** Jumlah pesanan yang belum tiba (lencana di tab Belanja). */
  inTransitCount?: number;
}) {
  const href = (tab: PengadaanTab) =>
    `/pengadaan?tab=${tab}${activeBrand ? `&bu=${encodeURIComponent(activeBrand)}` : ""}`;
  return (
    <nav aria-label="Bagian Pengadaan" className="grid grid-cols-4 gap-0.5 rounded-xl bg-muted p-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          prefetch={false}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold transition-colors",
            active === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          <span className="truncate">{t.label}</span>
          {t.key === "belanja" && inTransitCount > 0 && (
            <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">
              {inTransitCount}
              <span className="sr-only"> pesanan belum tiba</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Pemilih cabang untuk petugas yang memegang lebih dari satu cabang. */
export function BrandPills({
  brands,
  activeBrand,
  href,
}: {
  brands: string[];
  activeBrand: string | null;
  href: (bu: string) => string;
}) {
  if (brands.length < 2) return null;
  return (
    <div role="group" aria-label="Cabang" className="inline-flex rounded-lg bg-muted p-0.5">
      {brands.map((b) => (
        <Link
          key={b}
          href={href(b)}
          prefetch={false}
          aria-current={b === activeBrand ? "true" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-[13px] font-semibold transition-colors",
            b === activeBrand ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          {b.replace("Haengbocake ", "")}
        </Link>
      ))}
    </div>
  );
}
