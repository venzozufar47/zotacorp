"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  Brain,
  Cake,
  Camera,
  ClipboardList,
  Coins,
  Database,
  FileSignature,
  HandCoins,
  Home as HomeIcon,
  LogOut,
  MapPin,
  PartyPopper,
  Radio,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { PendingConfirmationsBell } from "./PendingConfirmationsBell";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

/**
 * Admin mobile chrome — selaras dengan AdminSidebar (desktop).
 *  - Top bar tipis (logo + badge admin + bell pending) untuk konteks.
 *  - Bottom-nav scrollable horizontal: MIRROR penuh menu AdminSidebar
 *    (urutan & item sama) supaya navigasi mobile selengkap desktop. Pakai
 *    overflow-x-auto + snap supaya semua menu muat tanpa men-compress
 *    label.
 *  - Sign-out di-anchor di kanan (di luar area scroll) supaya selalu
 *    accessible.
 *
 * CATATAN: daftar di bawah harus disinkronkan dengan AdminSidebar
 * (`allGroups`). Saat menambah menu admin baru, tambahkan di KEDUA tempat.
 */
export function AdminMobileNav({
  pendingConfirmations = [],
}: {
  pendingConfirmations?: PendingConfirmationItem[];
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  // Mirror AdminSidebar.allGroups (urutan sama, di-flatten).
  const navItems = [
    // Operations
    { href: "/admin", icon: HomeIcon, label: t.nav.home, color: "bg-primary" },
    { href: "/admin/attendance", icon: ClipboardList, label: t.nav.attendance, color: "bg-primary" },
    { href: "/admin/payslips/variables", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    { href: "/admin/cleaning", icon: Sparkles, label: "Kebersihan", color: "bg-quaternary" },
    // Org
    { href: "/admin/users", icon: Users, label: t.nav.users, color: "bg-pop-pink" },
    { href: "/admin/employment-contracts", icon: FileSignature, label: "Kontrak Kerja", color: "bg-quaternary" },
    { href: "/admin/disc", icon: Brain, label: "Tes DISC", color: "bg-pop-pink" },
    { href: "/admin/locations", icon: MapPin, label: t.nav.locations, color: "bg-quaternary" },
    // Money & Care
    { href: "/admin/finance", icon: Wallet, label: t.nav.finance, color: "bg-pop-emerald" },
    { href: "/admin/finance/dividen", icon: HandCoins, label: "Dividen", color: "bg-pop-emerald" },
    { href: "/cash", icon: Coins, label: "Kas Cabang", color: "bg-pop-emerald" },
    { href: "/admin/celebrations", icon: PartyPopper, label: "Celebrations", color: "bg-pop-pink" },
    // Comms
    { href: "/admin/intercom", icon: Radio, label: "Intercom", color: "bg-pop-emerald" },
    // Cake
    { href: "/admin/cake-orders", icon: Cake, label: "Pesanan Cake", color: "bg-pop-pink" },
    // Yeobo Booth
    { href: "/admin/yeobo-booth", icon: Camera, label: "Scheduling", color: "bg-pop-emerald" },
    { href: "/admin/yeobo-booth/settings", icon: BellRing, label: "Reminder", color: "bg-pop-emerald" },
    // Stakeholders
    { href: "/admin/investors", icon: TrendingUp, label: "Investor", color: "bg-quaternary" },
    // System
    { href: "/admin/settings", icon: Settings, label: t.nav.settings, color: "bg-card" },
    { href: "/admin/backups", icon: Database, label: "Backups", color: "bg-card" },
  ];

  // Untuk highlight: pilih match terpanjang supaya /admin/finance/dividen
  // tidak ikut menyalakan /admin/finance, dan /admin tidak menyalakan semua.
  const activeHref = navItems
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {/* Top bar — logo + admin badge + bell. Tinggal context strip. */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4 bg-background border-b-2 border-foreground md:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/zota-corp-logo-tosca.png"
            alt="Zota Corp"
            className="h-7 w-auto select-none"
          />
          <span className="px-2 py-0.5 rounded-full border-2 border-foreground bg-tertiary text-[0.625rem] font-display font-bold uppercase tracking-wider text-foreground">
            Admin
          </span>
        </div>
        <PendingConfirmationsBell items={pendingConfirmations} variant="compact" />
      </div>

      {/* Bottom-nav scrollable — mirror penuh AdminSidebar. */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-background border-t-2 border-foreground z-50 md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-stretch gap-1 px-1 sm:px-2">
          <div
            className="flex items-center gap-1 flex-1 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x"
            aria-label="Admin navigation"
          >
            {navItems.map(({ href, icon: Icon, label, color }) => {
              const active = href === activeHref;
              return (
                <Link
                  key={href}
                  href={href}
                  className="snap-start shrink-0 flex flex-col items-center gap-1 w-[64px] py-1 text-[11px] transition-colors"
                >
                  <span
                    className={cn(
                      "flex items-center justify-center size-9 rounded-full border-2 border-foreground transition-transform duration-200",
                      active
                        ? color + " text-foreground"
                        : "bg-card text-muted-foreground"
                    )}
                  >
                    <Icon size={18} strokeWidth={2.5} />
                  </span>
                  <span
                    className={cn(
                      "font-display font-bold uppercase tracking-wide text-[0.625rem] truncate max-w-full",
                      active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Sign-out anchor — di luar area scroll supaya selalu terlihat. */}
          <div className="shrink-0 flex items-center pl-1 border-l border-border/60">
            <form action={signOut}>
              <button
                type="submit"
                className="flex flex-col items-center gap-1 w-[56px] py-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                aria-label={t.nav.signOut}
              >
                <span className="flex items-center justify-center size-9 rounded-full border-2 border-foreground bg-card">
                  <LogOut size={16} strokeWidth={2.5} />
                </span>
                <span className="font-display font-bold uppercase tracking-wide text-[0.625rem]">
                  Keluar
                </span>
              </button>
            </form>
          </div>
        </div>
      </nav>
    </>
  );
}
