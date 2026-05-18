import {
  BarChart3,
  Boxes,
  History,
  Home,
  Settings,
  Wallet,
} from "lucide-react";
import { PosNavLink } from "./PosNavLink";
import type { PosNavSection } from "./PosTopNav";

interface RailItem {
  href: string;
  label: string;
  icon: typeof Home;
  section: PosNavSection;
  adminOnly?: boolean;
}

const RAIL: RailItem[] = [
  { href: "/pos", label: "POS", icon: Home, section: "pos" },
  {
    href: "/pos/produk",
    label: "Katalog",
    icon: Settings,
    section: "produk",
    adminOnly: true,
  },
  { href: "/pos/shift", label: "Saldo", icon: Wallet, section: "shift" },
  { href: "/pos/stok", label: "Stok", icon: Boxes, section: "stok" },
  { href: "/pos/riwayat", label: "Riwayat", icon: History, section: "riwayat" },
  {
    href: "/pos/insights",
    label: "Insights",
    icon: BarChart3,
    section: "insights",
    adminOnly: true,
  },
];

/**
 * Workstation shell untuk semua halaman POS — concept-b design.
 * Top bar (brand + outlet + optional "Shift aktif" pill) + rail nav
 * di desktop, bottom-nav di mobile. Children diisi konten halaman.
 *
 * Menggantikan <PosTopNav> di sub-pages (stok, riwayat, shift, dst.)
 * supaya semua halaman POS punya chrome konsisten dengan /pos.
 *
 * Tidak menempatkan cart panel — /pos main yang punya cart inline-nya
 * sendiri di POSClient. Shell ini fokus ke layout 2-kolom (rail +
 * main) untuk sub-pages yang tidak punya cart aktif.
 */
export function PosShell({
  outletName,
  active,
  isAdmin,
  title,
  subtitle,
  actions,
  showShiftPill = true,
  children,
}: {
  outletName: string;
  active: PosNavSection;
  isAdmin: boolean;
  /** Heading di main area (mirror "page-head" dari design). */
  title?: string;
  /** Subteks di bawah title, misal "kelola stok harian, produksi & opname". */
  subtitle?: string;
  /** Tombol-tombol aksi di kanan page-head (e.g. "Catat produksi"). */
  actions?: React.ReactNode;
  /** Set ke false di sub-pages tanpa konteks shift aktif (misal /pos/produk). */
  showShiftPill?: boolean;
  children: React.ReactNode;
}) {
  const visible = RAIL.filter((it) => !it.adminOnly || isAdmin);
  return (
    <div className="min-h-screen flex flex-col md:grid md:h-screen md:grid-cols-[64px_minmax(0,1fr)] md:grid-rows-[56px_minmax(0,1fr)] bg-background">
      {/* Top bar */}
      <header className="md:col-span-2 h-14 border-b border-border bg-card flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0 z-20">
        <div className="size-9 rounded-xl bg-primary text-primary-foreground inline-flex items-center justify-center font-bold text-base shrink-0">
          Z
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
            POS
          </p>
          <p className="font-semibold text-foreground text-sm leading-tight truncate">
            {outletName}
          </p>
        </div>
        {showShiftPill && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/15 text-success border border-success/30 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            Shift aktif
          </span>
        )}
      </header>

      {/* Left rail (desktop) */}
      <aside className="hidden md:flex flex-col items-stretch gap-1 border-r border-border bg-card py-3 px-2 overflow-y-auto">
        {visible.map((it) => {
          const Icon = it.icon;
          const isActive = it.section === active;
          return (
            <PosNavLink
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={18} />
              {it.label}
            </PosNavLink>
          );
        })}
      </aside>

      {/* Main */}
      <main className="min-w-0 overflow-y-auto pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        {(title || actions) && (
          <div className="flex items-start justify-between gap-3 px-3 sm:px-5 py-4 border-b border-border bg-background sticky top-0 z-10 backdrop-blur">
            <div className="min-w-0">
              {title && (
                <h1 className="font-bold text-foreground text-base sm:text-lg leading-tight truncate">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 shrink-0">{actions}</div>
            )}
          </div>
        )}
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch">
          {visible.map((it) => {
            const Icon = it.icon;
            const isActive = it.section === active;
            return (
              <PosNavLink
                key={it.href}
                href={it.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} />
                {it.label}
              </PosNavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
