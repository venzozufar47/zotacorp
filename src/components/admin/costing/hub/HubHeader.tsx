"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { rememberBrand } from "@/lib/costing/brands";

export interface HubTab {
  key: string;
  label: string;
  /** Angka kecil di samping label (mis. jumlah yang perlu ditinjau). */
  count?: number;
  icon?: React.ReactNode;
  /** Tab jarang dipakai: dirapatkan ke kanan. */
  secondary?: boolean;
}

/** "Haengbocake Pare" → "Pare". Brand lain apa adanya. */
export const shortBrand = (b: string) => b.replace(/^Haengbocake /, "");

/**
 * Kepala bersama kedua hub costing (HPP, Pengadaan): judul, pemilih brand, tab,
 * dan slot aksi. Pemilih brand memakai cookie yang sama di semua tab sehingga
 * brand terakhir yang dipilih terbawa ke hub satunya.
 */
export function HubHeader({
  title,
  basePath,
  tabs,
  activeTab,
  brands,
  activeBrand,
  allBrandsValue,
  actions,
}: {
  title: string;
  basePath: string;
  tabs: HubTab[];
  activeTab: string;
  brands: string[];
  /** null = "Semua" (hanya bila `allBrandsValue` diisi). */
  activeBrand: string | null;
  /** Nilai `?bu=` untuk opsi "Semua"; kosongkan bila hub tak mendukung. */
  allBrandsValue?: string;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const href = (tab: string, bu: string | null) => {
    const q = new URLSearchParams();
    q.set("tab", tab);
    if (bu) q.set("bu", bu);
    return `${basePath}?${q.toString()}`;
  };

  function pick(bu: string | null) {
    if (bu) rememberBrand(bu);
    router.push(href(activeTab, bu ?? allBrandsValue ?? null));
  }

  const primary = tabs.filter((t) => !t.secondary);
  const secondary = tabs.filter((t) => t.secondary);
  const brandOptions: { value: string | null; label: string }[] = [
    ...(allBrandsValue ? [{ value: null, label: "Semua" }] : []),
    ...brands.map((b) => ({ value: b, label: shortBrand(b) })),
  ];

  return (
    <header className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {brandOptions.length > 1 && (
          <div role="group" aria-label="Pilih brand" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5">
            {brandOptions.map((o) => {
              const on = o.value === activeBrand;
              return (
                <button
                  key={o.value ?? "semua"}
                  type="button"
                  aria-pressed={on}
                  title={o.value ?? "Semua cabang"}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition-colors",
                    on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      <nav aria-label={`Bagian ${title}`} className="flex items-end gap-1 border-b border-border">
        {primary.map((t) => (
          <TabLink key={t.key} tab={t} active={activeTab === t.key} href={href(t.key, activeBrand ?? allBrandsValue ?? null)} />
        ))}
        {secondary.length > 0 && <span className="flex-1" />}
        {secondary.map((t) => (
          <TabLink key={t.key} tab={t} active={activeTab === t.key} href={href(t.key, activeBrand ?? allBrandsValue ?? null)} />
        ))}
      </nav>
    </header>
  );
}

function TabLink({ tab, active, href }: { tab: HubTab; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {tab.icon}
      {tab.label}
      {tab.count != null && tab.count > 0 && (
        <span className="min-w-5 rounded-full bg-warning/25 px-1.5 text-center text-[11px] font-bold tabular-nums">
          {tab.count}
        </span>
      )}
    </Link>
  );
}
