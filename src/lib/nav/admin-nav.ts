import {
  Brain,
  Cake,
  Calculator,
  Camera,
  ClipboardList,
  Coins,
  Database,
  FileSignature,
  Gauge,
  HandCoins,
  Home as HomeIcon,
  MapPin,
  PartyPopper,
  Radio,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionary";

/**
 * Single source of truth for the admin nav.
 *
 * Both chromes import from here — `AdminSidebar` (desktop) and
 * `AdminMobileNav` (mobile bottom tabs + menu sheet). Previously each
 * kept its own hand-maintained copy of the list, which had already
 * drifted ("Gate Absen Pulang" vs "Gate Pulang", "HPP / Costing" vs
 * "HPP") and silently skipped the `scope` filter on mobile.
 *
 * Only the *data* is shared — the two renderers keep their own styling
 * (sidebar is glass/teal-gradient, mobile is neo-brutalist borders), so
 * forcing a shared presentational component would fight both.
 */

export type AdminNavScope = "full" | "yeobo-booth";

export interface AdminNavChild {
  href: string;
  label: string;
}

export interface AdminNavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  /** Sub-pages revealed when the parent row is expanded. */
  children?: AdminNavChild[];
  /** `bg-*` token used as the active accent on mobile tiles. */
  color?: string;
  /** Scopes allowed to see this item. Defaults to `["full"]`. */
  scopes?: AdminNavScope[];
}

/** A group with `label: ""` renders without a section header. */
export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export interface BuildAdminNavArgs {
  pendingCount?: number;
  disputesCount?: number;
  cleaningCount?: number;
  scope?: AdminNavScope;
  /** Global admin Zota — gates the Yeobo Booth "Akses Admin" child. */
  isAdminZota?: boolean;
  t: Dictionary;
}

/**
 * Hrefs pinned as fixed tabs in the mobile bottom bar. Everything else
 * lives behind the "Menu" sheet. Re-pick the primaries by editing this
 * list — nothing else needs to change.
 */
export const MOBILE_PRIMARY_HREFS = [
  "/admin",
  "/admin/attendance",
  "/admin/payslips/variables",
  "/admin/finance",
] as const;

/** Primaries for a Yeobo Booth unit admin, who only has the one module. */
export const MOBILE_PRIMARY_HREFS_YEOBO = ["/admin/yeobo-booth"] as const;

/**
 * Build the nav for one viewer. This is a function rather than a const
 * because every input is per-request: badge counts are live, labels come
 * from the active dictionary, and `scope`/`isAdminZota` gate entries.
 */
export function buildAdminNav({
  pendingCount = 0,
  disputesCount = 0,
  cleaningCount = 0,
  scope = "full",
  isAdminZota = false,
  t,
}: BuildAdminNavArgs): AdminNavGroup[] {
  const allGroups: AdminNavGroup[] = [
    {
      label: "",
      items: [
        {
          href: "/admin",
          icon: HomeIcon,
          label: t.nav.home,
          color: "bg-primary",
        },
      ],
    },
    {
      label: "Operasional",
      items: [
        {
          href: "/admin/attendance",
          icon: ClipboardList,
          label: t.nav.attendance,
          badge: pendingCount || undefined,
          color: "bg-primary",
        },
        {
          href: "/admin/stock-gate",
          icon: ShieldCheck,
          label: "Gate Absen Pulang",
          color: "bg-tertiary",
        },
        {
          href: "/admin/cleaning",
          icon: Sparkles,
          label: "Kebersihan",
          badge: cleaningCount || undefined,
          color: "bg-quaternary",
        },
        {
          href: "/admin/tickets",
          icon: Ticket,
          label: "Tiket Studio",
          color: "bg-tertiary",
        },
        {
          href: "/admin/service-level",
          icon: Gauge,
          label: "Service Level",
          color: "bg-primary",
        },
      ],
    },
    {
      label: "Karyawan",
      items: [
        {
          href: "/admin/users",
          icon: Users,
          label: t.nav.users,
          color: "bg-pop-pink",
        },
        {
          href: "/admin/payslips/variables",
          icon: Receipt,
          label: t.nav.payslips,
          badge: disputesCount || undefined,
          color: "bg-tertiary",
        },
        {
          href: "/admin/employment-contracts",
          icon: FileSignature,
          label: "Kontrak Kerja",
          color: "bg-quaternary",
        },
        {
          href: "/admin/disc",
          icon: Brain,
          label: "Tes DISC",
          color: "bg-pop-pink",
        },
        {
          href: "/admin/celebrations",
          icon: PartyPopper,
          label: "Monitoring Karyawan",
          color: "bg-pop-pink",
        },
      ],
    },
    {
      label: "Keuangan",
      items: [
        {
          href: "/admin/finance",
          icon: Wallet,
          label: t.nav.finance,
          color: "bg-pop-emerald",
          children: [
            { href: "/admin/finance/pnl", label: "Profit & Loss" },
            { href: "/admin/finance/assignments", label: "Assignment Queue" },
            { href: "/admin/finance/employees", label: "Mapping Karyawan" },
          ],
        },
        {
          href: "/cash",
          icon: Coins,
          label: "Kas Cabang",
          color: "bg-pop-emerald",
        },
        {
          href: "/admin/costing",
          icon: Calculator,
          label: "HPP / Costing",
          color: "bg-pop-emerald",
          children: [
            { href: "/admin/costing/bahan", label: "Master Bahan" },
            { href: "/admin/costing/dashboard", label: "Dashboard Margin" },
            { href: "/admin/costing/pengadaan", label: "Pengadaan" },
          ],
        },
        // Sits at /admin/finance/dividen but stays top-level: it's a
        // high-traffic workflow of its own, and longest-href matching
        // keeps it from lighting up its URL parent.
        {
          href: "/admin/finance/dividen",
          icon: HandCoins,
          label: "Dividen",
          color: "bg-pop-emerald",
        },
        {
          href: "/admin/investors",
          icon: TrendingUp,
          label: "Investor",
          color: "bg-quaternary",
        },
      ],
    },
    {
      label: "Unit Bisnis",
      items: [
        {
          href: "/admin/cake-orders",
          icon: Cake,
          label: "Pesanan Cake",
          color: "bg-pop-pink",
          children: [
            { href: "/admin/cake-orders/options", label: "Opsi Form" },
            { href: "/admin/cake-orders/access", label: "Akses Karyawan" },
          ],
        },
        {
          href: "/admin/yeobo-booth",
          icon: Camera,
          label: "Yeobo Booth",
          color: "bg-pop-emerald",
          scopes: ["full", "yeobo-booth"],
          children: [
            { href: "/admin/yeobo-booth/calendar", label: "Kalender" },
            { href: "/admin/yeobo-booth/bookings", label: "Semua Booking" },
            { href: "/admin/yeobo-booth/laporan", label: "Laporan" },
            { href: "/admin/yeobo-booth/freelance", label: "Freelance" },
            { href: "/admin/yeobo-booth/settings", label: "Reminder WA" },
            ...(isAdminZota
              ? [{ href: "/admin/yeobo-booth/admins", label: "Akses Admin" }]
              : []),
          ],
        },
      ],
    },
    {
      label: "Sistem",
      items: [
        {
          href: "/admin/locations",
          icon: MapPin,
          label: t.nav.locations,
          color: "bg-quaternary",
        },
        {
          href: "/admin/sim-cards",
          icon: Smartphone,
          label: "Kartu SIM",
          color: "bg-quaternary",
        },
        {
          href: "/admin/intercom",
          icon: Radio,
          label: "Intercom",
          color: "bg-pop-emerald",
        },
        {
          href: "/admin/settings",
          icon: Settings,
          label: t.nav.settings,
          color: "bg-card",
        },
        {
          href: "/admin/backups",
          icon: Database,
          label: "Backups",
          color: "bg-card",
        },
      ],
    },
  ];

  // Scope filtering is per-item (not per-group) so a restricted admin
  // can be granted any subset without the taxonomy having to mirror it.
  // Groups left empty are dropped so no stray headers survive.
  if (scope === "full") return allGroups;

  return allGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => (it.scopes ?? ["full"]).includes(scope)),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * Resolve the single active href across items *and* children, by longest
 * match. Nested routes therefore light their own row rather than their
 * parent's — `/admin/costing/bahan` lights "Master Bahan", not "HPP /
 * Costing". `/admin` matches exactly or it would light on every page.
 */
export function resolveActiveHref(
  groups: AdminNavGroup[],
  pathname: string
): string | undefined {
  return groups
    .flatMap((g) =>
      g.items.flatMap((it) => [it.href, ...(it.children?.map((c) => c.href) ?? [])])
    )
    .filter((href) =>
      href === "/admin"
        ? pathname === "/admin"
        : pathname === href || pathname.startsWith(href + "/")
    )
    .sort((a, b) => b.length - a.length)[0];
}

/** True when this item, or any of its children, is the active row. */
export function isBranchActive(
  item: AdminNavItem,
  activeHref: string | undefined
): boolean {
  if (!activeHref) return false;
  return (
    item.href === activeHref ||
    (item.children?.some((c) => c.href === activeHref) ?? false)
  );
}
