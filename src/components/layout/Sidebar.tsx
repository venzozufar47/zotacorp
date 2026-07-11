"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, Receipt, Wallet, Radio, Cake, Factory, Inbox, Camera, Coins, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { HamburgerMenu, type MenuViewer } from "./HamburgerMenu";

export function Sidebar({
  className,
  hasFinance = false,
  hasCash = false,
  hasCakeOrders = false,
  hasCakeProduction = false,
  hasYeoboBooth = false,
  hasTickets = false,
  assignmentCount = 0,
  me = null,
}: {
  className?: string;
  /** Show the "Keuangan" tab for users with at least one rekening assignment. */
  hasFinance?: boolean;
  /** Show the "Kas" tab only for users assigned to a Yeobo Space cash rekening. */
  hasCash?: boolean;
  hasCakeOrders?: boolean;
  hasCakeProduction?: boolean;
  /** Show the "Yeobo Booth" tab for users in the yeobo_booth_admins allowlist. */
  hasYeoboBooth?: boolean;
  /** Show "Tiket" tab for Yeobo Space employees / Kepala Studio. */
  hasTickets?: boolean;
  /** Jumlah transaksi yang di-assign ke user & masih "Needs Assignment". */
  assignmentCount?: number;
  me?: MenuViewer | null;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t.nav.home, color: "bg-primary" },
    { href: "/attendance", icon: Clock, label: t.nav.attendance, color: "bg-pop-pink" },
    { href: "/payslips", icon: Receipt, label: t.nav.payslips, color: "bg-tertiary" },
    { href: "/intercom", icon: Radio, label: "Intercom", color: "bg-pop-emerald" },
    ...(hasTickets
      ? [{ href: "/tickets", icon: Ticket, label: "Tiket", color: "bg-tertiary" }]
      : []),
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
    ...(hasCash
      ? [
          {
            href: "/cash",
            icon: Coins,
            label: "Kas",
            color: "bg-pop-emerald",
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
    ...(hasYeoboBooth
      ? [
          {
            href: "/admin/yeobo-booth",
            icon: Camera,
            label: "Yeobo Booth",
            color: "bg-pop-emerald",
          },
        ]
      : []),
    ...(assignmentCount > 0
      ? [
          {
            href: "/assignments",
            icon: Inbox,
            label: "Assignment",
            color: "bg-pop-pink",
            badge: assignmentCount,
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

      {/* Nav — scrolls internally so the footer (profile menu) stays pinned
          and reachable even when there are many nav items on short screens. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1.5">
        {navItems.map((item) => {
          const { href, icon: Icon, label, color } = item;
          const badge = "badge" in item ? item.badge : undefined;
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
              <span className="flex-1">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={cn(
                    "min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold border-2 border-foreground",
                    active ? "bg-background text-foreground" : "bg-pop-pink text-foreground"
                  )}
                >
                  {badge}
                </span>
              )}
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
