import Link from "next/link";
import { cn } from "@/lib/utils";

export type PengadaanTab = "catat" | "pesanan" | "riwayat" | "stok" | "bahan";

const TABS: { key: PengadaanTab; label: string; short: string }[] = [
  { key: "catat", label: "Catat belanja", short: "Catat" },
  { key: "pesanan", label: "Pesanan", short: "Pesanan" },
  { key: "riwayat", label: "Riwayat", short: "Riwayat" },
  { key: "stok", label: "Stok bahan", short: "Stok" },
  { key: "bahan", label: "Daftar bahan", short: "Bahan" },
];

/** Tab halaman Pengadaan & Pengeluaran + pemilih cabang (bila petugas memegang lebih dari satu). */
export function PengadaanTabs({
  active,
  brands,
  activeBrand,
  limited = false,
  inTransitCount = 0,
}: {
  active: PengadaanTab;
  brands: string[];
  activeBrand: string | null;
  /** Akun kasir (bukan petugas pengadaan): hanya form catat, tanpa tab lain. */
  limited?: boolean;
  /** Jumlah pesanan yang belum tiba (badge di tab Pesanan). */
  inTransitCount?: number;
}) {
  const href = (tab: PengadaanTab, bu: string | null) =>
    `/pengadaan?tab=${tab}${bu ? `&bu=${encodeURIComponent(bu)}` : ""}`;
  return (
    <div className="space-y-2.5">
      {!limited && (
      <nav aria-label="Bagian Pengadaan" className="grid w-full grid-cols-6 gap-0.5 rounded-xl border border-border bg-muted/40 p-1 md:inline-grid md:w-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key, activeBrand)}
            aria-current={active === t.key ? "page" : undefined}
            prefetch={false}
            className={cn(
              "whitespace-nowrap rounded-lg px-0.5 py-2 text-center text-[12.5px] font-semibold transition md:px-3.5 md:py-1.5 md:text-sm",
              active === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="md:hidden">{t.short}</span>
            <span className="hidden md:inline">{t.label}</span>
            {t.key === "pesanan" && inTransitCount > 0 && (
              <span className="ml-1 inline-grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground tabular-nums">
                {inTransitCount}
                <span className="sr-only"> pesanan belum tiba</span>
              </span>
            )}
          </Link>
        ))}
        {/* Opname bahan punya halaman sendiri — tautan di sini supaya mudah ditemukan. */}
        <Link
          href={`/pengadaan/opname${activeBrand ? `?bu=${encodeURIComponent(activeBrand)}` : ""}`}
          prefetch={false}
          className="whitespace-nowrap rounded-lg px-0.5 py-2 text-center text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground md:px-3.5 md:py-1.5 md:text-sm"
        >
          Opname
        </Link>
      </nav>
      )}
      {brands.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {brands.map((b) => (
            <Link
              key={b}
              href={href(active, b)}
              prefetch={false}
              aria-current={b === activeBrand ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                b === activeBrand
                  ? "border-foreground bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {b.replace("Haengbocake ", "")}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
