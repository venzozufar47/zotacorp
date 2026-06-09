"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cake,
  Camera,
  ClipboardList,
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
 * Admin mobile chrome — selaras dengan BottomNav karyawan:
 *  - Top bar tipis (logo + badge admin + bell pending) untuk konteks.
 *  - Bottom-nav scrollable horizontal dengan pill-style chip per
 *    menu admin. Item-row pakai overflow-x-auto + snap supaya 9+
 *    menu admin tetap muat tanpa men-compress label.
 *  - Tombol sign-out di-anchor di kanan (di luar area scroll) supaya
 *    selalu accessible — mirror peran HamburgerMenu di BottomNav.
 *
 * Drawer hamburger versi sebelumnya dihapus karena bottom-nav
 * scrollable sudah meng-cover navigasi ke semua menu.
 */
export function AdminMobileNav({
  pendingConfirmations = [],
}: {
  pendingConfirmations?: PendingConfirmationItem[];
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/admin/attendance", icon: ClipboardList, label: t.nav.attendance, color: "bg-primary" },
    { href: "/admin/payslips/variables", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    { href: "/admin/cleaning", icon: Sparkles, label: "Kebersihan", color: "bg-quaternary" },
    { href: "/admin/users", icon: Users, label: t.nav.users, color: "bg-pop-pink" },
    { href: "/admin/locations", icon: MapPin, label: t.nav.locations, color: "bg-quaternary" },
    { href: "/admin/finance", icon: Wallet, label: t.nav.finance, color: "bg-pop-emerald" },
    { href: "/admin/celebrations", icon: PartyPopper, label: "Celebrations", color: "bg-pop-pink" },
    { href: "/admin/intercom", icon: Radio, label: "Intercom", color: "bg-pop-emerald" },
    { href: "/admin/cake-orders", icon: Cake, label: "Cake", color: "bg-pop-pink" },
    { href: "/admin/yeobo-booth", icon: Camera, label: "Booth", color: "bg-pop-emerald" },
    { href: "/admin/investors", icon: TrendingUp, label: "Investor", color: "bg-quaternary" },
    { href: "/admin/settings", icon: Settings, label: t.nav.settings, color: "bg-card" },
  ];

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

      {/* Bottom-nav scrollable — mirror BottomNav karyawan. */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-background border-t-2 border-foreground z-50 md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-stretch gap-1 px-1 sm:px-2 max-w-lg mx-auto">
          <div
            className="flex items-center gap-1 flex-1 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
            aria-label="Admin navigation"
          >
            {navItems.map(({ href, icon: Icon, label, color }) => {
              const active =
                pathname === href || pathname.startsWith(href + "/");
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

          {/* Sign-out anchor — di luar area scroll supaya selalu
              terlihat. Tidak ikut compress saat item-row penuh. */}
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
