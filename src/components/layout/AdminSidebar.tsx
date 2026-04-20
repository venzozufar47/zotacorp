"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LogOut, Users, Settings, Receipt, MapPin, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function AdminSidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/admin/attendance", icon: ClipboardList, label: t.nav.attendance, color: "bg-primary" },
    { href: "/admin/payslips", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    { href: "/admin/users", icon: Users, label: t.nav.users, color: "bg-pop-pink" },
    { href: "/admin/locations", icon: MapPin, label: t.nav.locations, color: "bg-quaternary" },
    { href: "/admin/finance", icon: Wallet, label: t.nav.finance, color: "bg-pop-emerald" },
    { href: "/admin/settings", icon: Settings, label: t.nav.settings, color: "bg-card" },
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 bg-background border-r-2 border-foreground h-screen sticky top-0">
      <div className="px-6 py-6 border-b-2 border-foreground">
        <Link href="/admin/attendance" className="inline-flex items-center gap-2 group">
          <img
            src="/zota-corp-logo-tosca.png"
            alt="Zota Corp"
            className="h-9 w-auto select-none"
          />
        </Link>
        <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full border-2 border-foreground bg-tertiary text-[0.625rem] font-display font-bold uppercase tracking-wider text-foreground">
          Admin
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1.5">
        {navItems.map(({ href, icon: Icon, label, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group/nav flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all duration-200",
                active
                  ? "bg-foreground text-background font-bold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center size-7 rounded-full border-2 border-foreground transition-transform duration-200",
                  active ? color + " text-foreground" : "bg-card text-muted-foreground group-hover/nav:rotate-[-6deg]"
                )}
              >
                <Icon size={14} strokeWidth={2.5} />
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
            className="group/out flex items-center gap-3 px-3 py-2.5 rounded-full text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          >
            <span className="flex items-center justify-center size-7 rounded-full border-2 border-foreground bg-card text-muted-foreground group-hover/out:bg-destructive group-hover/out:text-white">
              <LogOut size={14} strokeWidth={2.5} />
            </span>
            {t.nav.signOut}
          </button>
        </form>
      </div>
    </aside>
  );
}
