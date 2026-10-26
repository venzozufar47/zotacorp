import {
  Award,
  Cake,
  Calculator,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FlaskConical,
  Gauge,
  Home as HomeIcon,
  Inbox,
  MapPin,
  Megaphone,
  Percent,
  Receipt,
  Settings,
  ShieldAlert,
  ShieldQuestion,
  Smartphone,
  Sparkles,
  Ticket,
  Trophy,
  TrendingUp,
  Users,
  Wallet,
  Zap,
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
  /**
   * Sub-pages. Item dengan sub-menu hanyalah INDUK (penanda grup): tidak pernah aktif sendiri, klik membuka
   * grup dan membawa ke sub-menu pertama. Halaman `href` induk sendiri otomatis jadi sub-menu pertama.
   */
  children?: AdminNavChild[];
  /** Nama sub-menu pertama (halaman `href` induk). Bawaan: label induk. */
  homeLabel?: string;
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
  const baseGroups: AdminNavGroup[] = [
    {
      label: "",
      items: [
        {
          href: "/admin",
          icon: HomeIcon,
          label: t.nav.home,
          color: "bg-primary",
        },
        {
          href: "/persetujuan",
          icon: Inbox,
          label: "Persetujuan",
          color: "bg-tertiary",
        },
      ],
    },
    {
      label: "Kinerja Harian",
      items: [
        {
          href: "/admin/attendance",
          icon: ClipboardList,
          label: t.nav.attendance,
          badge: pendingCount || undefined,
          color: "bg-primary",
          homeLabel: "Rekap Kehadiran",
          children: [{ href: "/admin/stock-gate", label: "Gate Absen Pulang" }],
        },
        {
          href: "/admin/tasks",
          icon: ClipboardCheck,
          label: "Tugas",
          color: "bg-primary",
        },
        {
          href: "/admin/cleaning",
          icon: Sparkles,
          label: "SOP",
          badge: cleaningCount || undefined,
          color: "bg-quaternary",
        },
        {
          href: "/admin/briefing",
          icon: Zap,
          label: "Briefing Kilat",
          color: "bg-quaternary",
        },
        {
          href: "/admin/scorecard",
          icon: Trophy,
          label: "Kinerja Cabang",
          color: "bg-tertiary",
          homeLabel: "Scorecard Cabang",
          children: [{ href: "/admin/service-level", label: "Service Level" }],
        },
      ],
    },
    {
      label: "Orang & HR",
      items: [
        {
          href: "/admin/users",
          icon: Users,
          label: t.nav.users,
          color: "bg-pop-pink",
          homeLabel: "Daftar Karyawan",
          children: [
            { href: "/admin/struktur", label: "Struktur Organisasi" },
            { href: "/admin/employment-contracts", label: "Kontrak Kerja" },
            { href: "/admin/celebrations", label: "Monitoring Karyawan" },
            { href: "/admin/offboarding", label: "Checklist Offboarding" },
          ],
        },
        {
          href: "/admin/payslips/variables",
          icon: Receipt,
          label: "Penggajian",
          badge: disputesCount || undefined,
          color: "bg-tertiary",
          homeLabel: "Slip Gaji",
          children: [{ href: "/admin/bonus", label: "Kalkulator Bonus" }],
        },
        {
          href: "/admin/evaluasi-360",
          icon: Award,
          label: "Penilaian",
          color: "bg-pop-pink",
          homeLabel: "Evaluasi 360°",
          children: [
            { href: "/admin/disc", label: "Tes DISC" },
            { href: "/admin/survei", label: "Survei Bulanan" },
          ],
        },
        {
          href: "/admin/sp",
          icon: ShieldAlert,
          label: "Sistem SP",
          color: "bg-destructive",
        },
        {
          href: "/admin/pengaduan",
          icon: ShieldQuestion,
          label: "Pengaduan",
          color: "bg-destructive",
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
          homeLabel: "Rekening & Cashflow",
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
          homeLabel: "Kalkulator HPP",
          children: [
            { href: "/admin/costing/bahan", label: "Master Bahan" },
            { href: "/admin/costing/dashboard", label: "Dashboard Margin" },
            { href: "/admin/costing/pengadaan", label: "Pengadaan" },
            { href: "/admin/costing/pengadaan/nota", label: "Nota Belanja" },
          ],
        },
        // "Dividen" DIHAPUS dari sini: konsolnya melebur jadi tab
        // "Distribusi Bulanan" di halaman Investor, karena orang, kontrak,
        // dan bagi hasil adalah satu alur kerja — bukan dua menu di grup
        // yang berbeda. /admin/finance/dividen kini redirect ke tab itu.
        {
          href: "/admin/investors",
          icon: TrendingUp,
          label: "Investor",
          color: "bg-quaternary",
          homeLabel: "Orang & Kontrak",
          children: [
            { href: "/admin/investors?tab=distribusi", label: "Distribusi Bulanan" },
            { href: "/admin/investors/mom", label: "Notulen Rapat" },
            { href: "/admin/investors/buyback", label: "Buyback Aset" },
          ],
        },
      ],
    },
    {
      label: "Bisnis & Marketing",
      items: [
        {
          href: "/admin/cake-orders",
          icon: Cake,
          label: "Pesanan Cake",
          color: "bg-pop-pink",
          homeLabel: "Antrean Pesanan",
          children: [
            { href: "/admin/cake-orders/options", label: "Opsi Form" },
            { href: "/admin/cake-orders/access", label: "Akses Karyawan" },
          ],
        },
        {
          href: "/admin/pos/diskon",
          icon: Percent,
          label: "Diskon POS",
          color: "bg-pop-amber",
        },
        {
          href: "/admin/scorecard-unit",
          icon: Gauge,
          label: "Scorecard Unit",
          color: "bg-pop-amber",
        },
        {
          href: "/riset-produk",
          icon: FlaskConical,
          label: "Riset Produk",
          color: "bg-quaternary",
        },
        {
          href: "/admin/yeobo-booth",
          icon: Camera,
          label: "Yeobo Booth",
          color: "bg-pop-emerald",
          scopes: ["full", "yeobo-booth"],
          homeLabel: "Hub Booth",
          // Subnav sengaja ringkas: hanya halaman yang TIDAK punya tombol di hub
          // (/admin/yeobo-booth). Kalender, Semua Booking, Laporan, Freelance,
          // Reminder, dan Akses Admin dibuka dari tombol-tombol di halaman hub.
          children: [
            // Dashboard Zota Booth: sementara khusus admin Zota (lihat booth.actions.ts).
            ...(isAdminZota
              ? [
                  { href: "/admin/yeobo-booth/photobooth", label: "Perangkat Photobooth" },
                  { href: "/admin/yeobo-booth/photobooth/sesi", label: "Sesi Foto" },
                ]
              : []),
          ],
        },
        {
          href: "/admin/tickets",
          icon: Ticket,
          label: "Tiket Studio",
          color: "bg-tertiary",
        },
        {
          href: "/admin/social",
          icon: Megaphone,
          label: "Sosmed & Ads",
          color: "bg-pop-pink",
          homeLabel: "Sosmed & KPI",
          children: [
            { href: "/admin/social/scorecard", label: "Scorecard Sosmed" },
            { href: "/admin/social/akun", label: "Akun Sosmed" },
            { href: "/admin/ads", label: "Meta Ads" },
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
          label: "SIM & Langganan",
          color: "bg-quaternary",
          homeLabel: "Kartu SIM",
          children: [{ href: "/admin/subscriptions", label: "Subscription" }],
        },
        {
          href: "/admin/settings",
          icon: Settings,
          label: t.nav.settings,
          color: "bg-card",
          homeLabel: "Umum",
          children: [
            { href: "/admin/accounts", label: "Akun & Password" },
            { href: "/admin/backups", label: "Backups" },
          ],
        },
      ],
    },
  ];

  // Induk dengan sub-menu hanya penanda grup: halamannya sendiri dijadikan sub-menu pertama, sehingga
  // mengklik induk membuka grup dan langsung membawa ke sana.
  const allGroups: AdminNavGroup[] = baseGroups.map((g) => ({
    ...g,
    items: g.items.map((it) =>
      it.children && it.children.length > 0
        ? { ...it, children: [{ href: it.href, label: it.homeLabel ?? it.label }, ...it.children] }
        : it
    ),
  }));

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
