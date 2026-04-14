"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, User, LogOut, Receipt, Settings } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function Sidebar({ className }: { className?: string }) {
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
    <aside className={cn("flex flex-col w-56 bg-white border-r border-border min-h-screen sticky top-0", className)}>
      {/* Brand */}
      <div className="px-6 py-6 border-b border-border">
        <img
          src="/zota-corp-logo-tosca.png"
          alt="Zota Corp"
          className="h-10"
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--primary)" : "var(--muted-foreground)",
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-border">
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all"
          >
            <LogOut size={18} strokeWidth={1.8} />
            {t.nav.signOut}
          </button>
        </form>
      </div>
    </aside>
  );
}
