"use client";

import {
  BarChart3,
  Boxes,
  History,
  Home,
  Settings,
  Wallet,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { PosNavLink } from "./PosNavLink";

export type PosNavSection =
  | "pos"
  | "produk"
  | "shift"
  | "stok"
  | "riwayat"
  | "insights";

interface Props {
  accountName: string;
  /** Required so admin-only items render correctly on every sub-page. */
  isAdmin: boolean;
  /** Highlight the section the user is currently on. Caller passes
   *  this explicitly so we don't have to infer from pathname for
   *  nested routes (e.g. `/pos/stok/opname/[id]` is still "stok"). */
  active?: PosNavSection;
}

interface NavItem {
  href: string;
  label: string;
  section: PosNavSection;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/pos", label: "POS", section: "pos", icon: <Home size={16} /> },
  {
    href: "/pos/produk",
    label: "Katalog",
    section: "produk",
    icon: <Settings size={16} />,
    adminOnly: true,
  },
  {
    href: "/pos/shift",
    label: "Saldo",
    section: "shift",
    icon: <Wallet size={16} />,
  },
  {
    href: "/pos/stok",
    label: "Stok",
    section: "stok",
    icon: <Boxes size={16} />,
  },
  {
    href: "/pos/riwayat",
    label: "Riwayat",
    section: "riwayat",
    icon: <History size={16} />,
  },
  {
    href: "/pos/insights",
    label: "Insights",
    section: "insights",
    icon: <BarChart3 size={16} />,
    adminOnly: true,
  },
];

/**
 * Sticky top-nav for every POS sub-page so the cashier can hop
 * Stok → Riwayat → Insights in one tap instead of bouncing through
 * `/pos`. Replaces the inline header that used to live only in
 * `POSClient` plus the standalone "Kembali ke POS" links each
 * sub-page wrote individually.
 *
 * Active state highlights the current section. If `active` is not
 * passed we fall back to a pathname match — works for the simple
 * routes (`/pos/stok`) but won't catch nested routes like
 * `/pos/stok/opname/new`, so callers on those routes should pass
 * `active` explicitly.
 */
export function PosTopNav({ accountName, isAdmin, active }: Props) {
  const pathname = usePathname();
  const resolved: PosNavSection =
    active ?? inferSection(pathname) ?? "pos";

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          POS
        </p>
        <h1 className="font-semibold text-foreground text-sm truncate">
          {accountName}
        </h1>
      </div>
      <nav className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {ITEMS.filter((it) => !it.adminOnly || isAdmin).map((it) => {
          const isActive = it.section === resolved;
          return (
            <PosNavLink
              key={it.section}
              href={it.href}
              className={
                "inline-flex items-center gap-1 h-9 px-2 rounded-lg text-xs transition-colors " +
                (isActive
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted")
              }
              aria-current={isActive ? "page" : undefined}
            >
              {it.icon}
              <span className="hidden sm:inline">{it.label}</span>
            </PosNavLink>
          );
        })}
      </nav>
    </header>
  );
}

function inferSection(pathname: string | null): PosNavSection | null {
  if (!pathname) return null;
  if (pathname === "/pos") return "pos";
  if (pathname.startsWith("/pos/produk")) return "produk";
  if (pathname.startsWith("/pos/shift")) return "shift";
  if (pathname.startsWith("/pos/stok")) return "stok";
  if (pathname.startsWith("/pos/riwayat")) return "riwayat";
  if (pathname.startsWith("/pos/insights")) return "insights";
  return null;
}
