"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, Receipt, Wallet, Cake, Factory, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { HamburgerMenu, type MenuViewer } from "./HamburgerMenu";

export function BottomNav({
  hasFinance = false,
  hasCakeOrders = false,
  hasCakeProduction = false,
  assignmentCount = 0,
  me = null,
}: {
  hasFinance?: boolean;
  hasCakeOrders?: boolean;
  hasCakeProduction?: boolean;
  assignmentCount?: number;
  me?: MenuViewer | null;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t.nav.home, color: "bg-primary" },
    { href: "/attendance", icon: Clock, label: t.nav.attendance, color: "bg-pop-pink" },
    { href: "/payslips", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    ...(hasCakeOrders
      ? [{ href: "/cake-orders", icon: Cake, label: "Cake", color: "bg-pop-pink" }]
      : []),
    ...(hasCakeProduction
      ? [
          {
            href: "/cake-production",
            icon: Factory,
            label: "Produksi",
            color: "bg-tertiary",
          },
        ]
      : []),
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
    ...(assignmentCount > 0
      ? [
          {
            href: "/assignments",
            icon: Inbox,
            label: "Assign",
            color: "bg-pop-pink",
            badge: assignmentCount,
          },
        ]
      : []),
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-background border-t-2 border-foreground z-50 md:hidden"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-stretch gap-1 px-1 sm:px-2 max-w-lg mx-auto">
        {/* Item row scrollable horizontal — kalau ada banyak modul aktif
            (cake, produksi, keuangan) total item bisa 6 yang tidak muat
            di layar sempit. Pakai overflow-x-auto + fixed-width per
            item supaya item tidak terkompres dan setiap label tetap
            terbaca. Scrollbar disembunyikan via varian arbitrary
            Tailwind. */}
        <div
          className="flex items-center gap-1 flex-1 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
          aria-label="Main navigation"
        >
          {navItems.map((item) => {
            const { href, icon: Icon, label, color } = item;
            const badge = "badge" in item ? item.badge : undefined;
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
                    "relative flex items-center justify-center size-9 rounded-full border-2 border-foreground transition-transform duration-200",
                    active
                      ? color + " text-foreground"
                      : "bg-card text-muted-foreground"
                  )}
                >
                  <Icon size={18} strokeWidth={2.5} />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold bg-pop-pink text-foreground border-2 border-foreground">
                      {badge}
                    </span>
                  )}
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
        {/* Profile / Settings / Sign out — di luar area scroll supaya
            selalu terlihat (anchor kanan), tidak ikut scroll bersama
            tabs lain. */}
        <div className="shrink-0 flex items-center pl-1 border-l border-border/60">
          <HamburgerMenu variant="bottom" me={me} />
        </div>
      </div>
    </nav>
  );
}
