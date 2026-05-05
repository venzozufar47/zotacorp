"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ClipboardList, Users, Settings, LogOut, Receipt, MapPin, Wallet, PartyPopper, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { PendingConfirmationsBell } from "./PendingConfirmationsBell";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

export function AdminMobileNav({
  pendingConfirmations = [],
}: {
  pendingConfirmations?: PendingConfirmationItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const navItems = [
    { href: "/admin/attendance", icon: ClipboardList, label: t.nav.attendance, color: "bg-primary" },
    { href: "/admin/payslips/variables", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    { href: "/admin/users", icon: Users, label: t.nav.users, color: "bg-pop-pink" },
    { href: "/admin/locations", icon: MapPin, label: t.nav.locations, color: "bg-quaternary" },
    { href: "/admin/finance", icon: Wallet, label: t.nav.finance, color: "bg-pop-emerald" },
    { href: "/admin/celebrations", icon: PartyPopper, label: "Celebrations", color: "bg-pop-pink" },
    { href: "/admin/intercom", icon: Radio, label: "Intercom", color: "bg-pop-emerald" },
    { href: "/admin/settings", icon: Settings, label: t.nav.settings, color: "bg-card" },
  ];

  // Auto-close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Fixed top bar — mobile only */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4 bg-background border-b-2 border-foreground md:hidden">
        <div className="flex items-center gap-2">
          <img
            src="/zota-corp-logo-tosca.png"
            alt="Zota Corp"
            className="h-7 w-auto select-none"
          />
          <span className="px-2 py-0.5 rounded-full border-2 border-foreground bg-tertiary text-[0.625rem] font-display font-bold uppercase tracking-wider text-foreground">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PendingConfirmationsBell items={pendingConfirmations} variant="compact" />
          <button
            onClick={() => setOpen(!open)}
            className="size-10 flex items-center justify-center rounded-full border-2 border-foreground bg-card transition-transform hover:rotate-12 active:scale-95"
            aria-label="Menu"
          >
            {open ? <X size={18} strokeWidth={2.5} /> : <Menu size={18} strokeWidth={2.5} />}
          </button>
        </div>
      </div>

      {/* Backdrop overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-background z-50 transform transition-transform duration-200 ease-out border-r-2 border-foreground shadow-hard md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-6 border-b-2 border-foreground">
          <img
            src="/zota-corp-logo-tosca.png"
            alt="Zota Corp"
            className="h-10 w-auto select-none"
          />
          <div className="mt-2">
            <span className="inline-block px-2 py-0.5 rounded-full border-2 border-foreground bg-tertiary text-[0.625rem] font-display font-bold uppercase tracking-wider text-foreground">
              Admin
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1.5">
          {navItems.map(({ href, icon: Icon, label, color }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-full text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-foreground text-background font-bold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
        </nav>

        <div className="px-3 py-4 border-t-2 border-foreground">
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-3 rounded-full text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <span className="flex items-center justify-center size-8 rounded-full border-2 border-foreground bg-card">
                <LogOut size={16} strokeWidth={2.5} />
              </span>
              {t.nav.signOut}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
