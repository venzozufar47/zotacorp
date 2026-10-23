import Link from "next/link";
import { cn } from "@/lib/utils";

export type PengadaanTab = "catat" | "riwayat" | "stok";

const TABS: { key: PengadaanTab; label: string }[] = [
  { key: "catat", label: "Catat belanja" },
  { key: "riwayat", label: "Riwayat" },
  { key: "stok", label: "Stok bahan" },
];

/** Tab halaman Pengadaan & Pengeluaran + pemilih cabang (bila petugas memegang lebih dari satu). */
export function PengadaanTabs({
  active,
  brands,
  activeBrand,
  limited = false,
}: {
  active: PengadaanTab;
  brands: string[];
  activeBrand: string | null;
  /** Akun kasir (bukan petugas pengadaan): hanya form catat, tanpa tab lain. */
  limited?: boolean;
}) {
  const href = (tab: PengadaanTab, bu: string | null) =>
    `/pengadaan?tab=${tab}${bu ? `&bu=${encodeURIComponent(bu)}` : ""}`;
  return (
    <div className="space-y-2.5">
      {!limited && (
      <nav aria-label="Bagian Pengadaan" className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key, activeBrand)}
            aria-current={active === t.key ? "page" : undefined}
            prefetch={false}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition",
              active === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
        {/* Opname bahan punya halaman sendiri — tautan di sini supaya mudah ditemukan. */}
        <Link
          href={`/pengadaan/opname${activeBrand ? `?bu=${encodeURIComponent(activeBrand)}` : ""}`}
          prefetch={false}
          className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
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
