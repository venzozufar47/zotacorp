"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cake,
  Camera,
  ClipboardList,
  LogOut,
  MapPin,
  Menu,
  PartyPopper,
  Radio,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { PendingConfirmationsBell } from "./PendingConfirmationsBell";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

/**
 * Admin mobile chrome.
 *  - Top bar tipis (logo + badge admin + bell pending) untuk konteks.
 *  - Bottom-nav: HANYA beberapa menu utama (tidak meniru seluruh sidebar
 *    seperti versi sebelumnya yang scrollable 12 item). Sisanya masuk ke
 *    bottom-sheet "Lainnya" — selaras dengan HamburgerMenu di BottomNav
 *    karyawan.
 */

type NavItem = {
  href: string;
  icon: typeof Wallet;
  label: string;
  color: string;
};

export function AdminMobileNav({
  pendingConfirmations = [],
}: {
  pendingConfirmations?: PendingConfirmationItem[];
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  // Tutup sheet saat pindah route.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Tutup sheet dengan Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // 4 menu utama di bar; sisanya di sheet "Lainnya".
  const primaryItems: NavItem[] = [
    { href: "/admin/attendance", icon: ClipboardList, label: t.nav.attendance, color: "bg-primary" },
    { href: "/admin/payslips/variables", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    { href: "/admin/finance", icon: Wallet, label: t.nav.finance, color: "bg-pop-emerald" },
    { href: "/admin/users", icon: Users, label: t.nav.users, color: "bg-pop-pink" },
  ];

  const moreItems: NavItem[] = [
    { href: "/admin/cleaning", icon: Sparkles, label: "Kebersihan", color: "bg-quaternary" },
    { href: "/admin/locations", icon: MapPin, label: t.nav.locations, color: "bg-quaternary" },
    { href: "/admin/celebrations", icon: PartyPopper, label: "Celebrations", color: "bg-pop-pink" },
    { href: "/admin/intercom", icon: Radio, label: "Intercom", color: "bg-pop-emerald" },
    { href: "/admin/cake-orders", icon: Cake, label: "Cake", color: "bg-pop-pink" },
    { href: "/admin/yeobo-booth", icon: Camera, label: "Booth", color: "bg-pop-emerald" },
    { href: "/admin/investors", icon: TrendingUp, label: "Investor", color: "bg-quaternary" },
    { href: "/admin/settings", icon: Settings, label: t.nav.settings, color: "bg-card" },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const anyMoreActive = moreItems.some((i) => isActive(i.href));

  return (
    <>
      {/* Top bar — logo + admin badge + bell. */}
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

      {/* Bottom-nav — 4 menu utama + tombol "Lainnya". */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-background border-t-2 border-foreground z-50 md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-stretch px-1 sm:px-2 max-w-lg mx-auto">
          {primaryItems.map(({ href, icon: Icon, label, color }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-1 flex-1 py-1 text-[11px] transition-colors"
              >
                <span
                  className={cn(
                    "flex items-center justify-center size-9 rounded-full border-2 border-foreground transition-transform duration-200",
                    active ? color + " text-foreground" : "bg-card text-muted-foreground"
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

          {/* Tombol "Lainnya" → bottom-sheet menu admin sisanya + keluar. */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-1 flex-1 py-1 text-[11px] transition-colors"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <span
              className={cn(
                "flex items-center justify-center size-9 rounded-full border-2 border-foreground transition-transform duration-200",
                anyMoreActive ? "bg-pop-pink text-foreground" : "bg-card text-muted-foreground"
              )}
            >
              <Menu size={18} strokeWidth={2.5} />
            </span>
            <span
              className={cn(
                "font-display font-bold uppercase tracking-wide text-[0.625rem]",
                anyMoreActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              Lainnya
            </span>
          </button>
        </div>
      </nav>

      {/* Bottom-sheet "Lainnya". */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl border-t-2 border-foreground shadow-hard pb-[env(safe-area-inset-bottom,0px)] md:hidden animate-pop-in origin-bottom"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b-2 border-foreground/10">
              <span className="font-display text-base font-bold">{t.nav.menu}</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="size-8 flex items-center justify-center rounded-full border-2 border-foreground bg-card hover:rotate-90 transition-transform"
                aria-label="Close"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="py-2 px-2 max-h-[60vh] overflow-y-auto">
              {moreItems.map(({ href, icon: Icon, label, color }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 my-0.5 rounded-full text-sm transition-colors",
                      active ? "bg-foreground text-background font-bold" : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-center size-8 rounded-full border-2 border-foreground",
                        active ? color + " text-foreground" : "bg-card text-muted-foreground"
                      )}
                    >
                      <Icon size={16} strokeWidth={2.5} />
                    </span>
                    {label}
                  </Link>
                );
              })}
              <div className="my-1.5 border-t-2 border-foreground/10" />
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="group/out flex items-center gap-3 px-3 py-3 my-0.5 rounded-full text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <span className="flex items-center justify-center size-8 rounded-full border-2 border-foreground bg-card group-hover/out:bg-destructive group-hover/out:text-white">
                    <LogOut size={16} strokeWidth={2.5} />
                  </span>
                  {t.nav.signOut}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
