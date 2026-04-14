"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, User, LogOut, Receipt, Settings } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t.nav.home },
    { href: "/attendance", icon: Clock, label: t.nav.attendance },
    { href: "/payslips", icon: Receipt, label: t.nav.payslips },
    { href: "/profile", icon: User, label: t.nav.profile },
    { href: "/settings", icon: Settings, label: t.nav.settings },
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
        <form action={signOut} className="flex-1">
          <button
            type="submit"
            className="flex flex-col items-center gap-1 w-full py-3 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
          >
            <LogOut size={22} strokeWidth={1.8} />
            <span>{t.nav.signOut}</span>
          </button>
        </form>
      </div>
    </nav>
  );
}
