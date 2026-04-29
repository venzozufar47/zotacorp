"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { HamburgerMenu, type MenuViewer } from "./HamburgerMenu";

export function Sidebar({
  className,
  hasFinance = false,
  me = null,
}: {
  className?: string;
  /** Show the "Keuangan" tab for users with at least one rekening assignment. */
  hasFinance?: boolean;
  me?: MenuViewer | null;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t.nav.home, color: "bg-primary" },
    { href: "/attendance", icon: Clock, label: t.nav.attendance, color: "bg-pop-pink" },
    { href: "/payslips", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
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
    <aside className={cn("flex flex-col w-60 bg-background border-r-2 border-foreground h-screen sticky top-0", className)}>
      {/* Brand — icon-only (tosca) mirrors admin treatment; reads well on all three themes' light sidebar surfaces */}
      <div className="px-6 py-6 border-b-2 border-foreground">
        <Link href="/dashboard" className="inline-flex items-center gap-2 group">
          <img
            src="/zota-corp-logo-tosca.png"
            alt="Zota Corp"
            className="h-10 w-auto select-none"
          />
        </Link>
        <p className="eyebrow mt-2 text-muted-foreground">Workspace</p>
      </div>

      {/* Nav */}
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

      {/* Profile / Settings / Sign out — collapsed into one hamburger menu
          so the primary sidebar keeps a tight 3-item focus. */}
      <div className="px-3 py-4 border-t-2 border-foreground">
        <HamburgerMenu variant="sidebar" me={me} />
      </div>
    </aside>
  );
}
