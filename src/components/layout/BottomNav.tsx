"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, Receipt, Wallet, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { HamburgerMenu, type MenuViewer } from "./HamburgerMenu";

export function BottomNav({
  hasFinance = false,
  me = null,
}: {
  hasFinance?: boolean;
  me?: MenuViewer | null;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t.nav.home, color: "bg-primary" },
    { href: "/attendance", icon: Clock, label: t.nav.attendance, color: "bg-pop-pink" },
    { href: "/payslips", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    { href: "/intercom", icon: Radio, label: "Intercom", color: "bg-pop-emerald" },
    ...(hasFinance
      ? [
          {
            href: "/admin/finance",
            icon: Wallet,
            label: "Keuangan",
            color: "bg-pop-emerald",
          },
        ]
      : []),
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-background border-t-2 border-foreground z-50 md:hidden"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-center max-w-lg mx-auto px-2">
        {navItems.map(({ href, icon: Icon, label, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 flex-1 py-2 text-[11px] transition-colors"
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
                  "font-display font-bold uppercase tracking-wide text-[0.625rem]",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
        {/* Profile / Settings / Sign out consolidated into one bottom-sheet
            menu so the rail keeps a 4-tab max on small screens. */}
        <HamburgerMenu variant="bottom" me={me} />
      </div>
    </nav>
  );
}
