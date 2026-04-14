"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, Receipt } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { HamburgerMenu } from "./HamburgerMenu";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t.nav.home },
    { href: "/attendance", icon: Clock, label: t.nav.attendance },
    { href: "/payslips", icon: Receipt, label: t.nav.payslips },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-border z-50 md:hidden"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-center max-w-lg mx-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 flex-1 py-3 text-[11px] transition-colors"
              style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span className={active ? "font-semibold" : ""}>{label}</span>
            </Link>
          );
        })}
        {/* Profile / Settings / Sign out consolidated into one bottom-sheet
            menu so the rail keeps a 4-tab max on small screens. */}
        <HamburgerMenu variant="bottom" />
      </div>
    </nav>
  );
}
