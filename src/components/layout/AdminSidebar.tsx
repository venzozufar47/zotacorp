"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LogOut,
  Users,
  Settings,
  Receipt,
  MapPin,
  Wallet,
  PartyPopper,
  Home as HomeIcon,
  Search,
  ChevronUp,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import type { Profile } from "@/lib/supabase/types";

/**
 * Admin sidebar — Shell A (Refined Sidebar) layout.
 *
 * Sections:
 *   1. Brand block (`z` mark + "zota." wordmark + "Admin" caption)
 *   2. Search slot (visual only for v1 — focuses on click; ⌘K wiring TBD)
 *   3. Grouped nav (Operations / Org / Money & Care / System) with
 *      optional badges per item.
 *   4. Footer user card with sign-out.
 *
 * Bell + pending list moved to the home dashboard Inbox + topbar.
 */
export function AdminSidebar({
  pendingCount = 0,
  disputesCount = 0,
  profile,
}: {
  pendingCount?: number;
  disputesCount?: number;
  profile?: Pick<
    Profile,
    "id" | "full_name" | "email" | "avatar_url" | "avatar_seed"
  > | null;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const groups: Array<{
    label: string;
    items: Array<{
      href: string;
      icon: typeof HomeIcon;
      label: string;
      badge?: number;
    }>;
  }> = [
    {
      label: "Operations",
      items: [
        { href: "/admin", icon: HomeIcon, label: t.nav.home },
        {
          href: "/admin/attendance",
          icon: ClipboardList,
          label: t.nav.attendance,
          badge: pendingCount || undefined,
        },
        {
          href: "/admin/payslips/variables",
          icon: Receipt,
          label: t.nav.payslips,
          badge: disputesCount || undefined,
        },
      ],
    },
    {
      label: "Org",
      items: [
        { href: "/admin/users", icon: Users, label: t.nav.users },
        { href: "/admin/locations", icon: MapPin, label: t.nav.locations },
      ],
    },
    {
      label: "Money & Care",
      items: [
        { href: "/admin/finance", icon: Wallet, label: t.nav.finance },
        {
          href: "/admin/celebrations",
          icon: PartyPopper,
          label: "Celebrations",
        },
      ],
    },
    {
      label: "Comms",
      items: [
        { href: "/admin/intercom", icon: Radio, label: "Intercom" },
      ],
    },
    {
      label: "System",
      items: [{ href: "/admin/settings", icon: Settings, label: t.nav.settings }],
    },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const displayName =
    profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Admin";
  const displayEmail = profile?.email ?? "";

  return (
    <aside
      className="hidden md:flex flex-col w-64 h-screen sticky top-0 border-r border-border/70"
      style={{
        background: "rgba(255,255,255,0.6)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Brand block */}
      <Link
        href="/admin"
        className="flex items-center gap-3 px-5 pt-5 pb-3 group"
      >
        <span
          className="grid place-items-center size-[38px] rounded-xl text-white font-display font-semibold text-[20px] tracking-tight shrink-0"
          style={{
            background: "var(--grad-teal)",
            boxShadow: "0 4px 12px rgba(17, 122, 140, 0.32)",
          }}
        >
          z
        </span>
        <span className="flex flex-col leading-none">
          <span className="font-display font-semibold text-[21px] tracking-tight text-foreground leading-none">
            zota<span style={{ color: "var(--teal-500)" }}>.</span>
          </span>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground mt-1">
            Admin
          </span>
        </span>
      </Link>

      {/* Search slot — placeholder; click does nothing (yet) */}
      <div className="px-3.5 pb-3.5">
        <button
          type="button"
          className="flex items-center gap-2 w-full h-9 px-3 rounded-full bg-muted/70 border border-border/70 text-[12.5px] text-muted-foreground hover:bg-card hover:border-border transition"
        >
          <Search size={13} className="opacity-70" />
          <span className="opacity-80">Search…</span>
          <span className="ml-auto font-mono text-[10px] px-1.5 py-0.5 bg-card border border-border/70 rounded text-muted-foreground/80">
            ⌘K
          </span>
        </button>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 pb-2">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 pt-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {g.label}
            </div>
            {g.items.map(({ href, icon: Icon, label, badge }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 my-0.5 rounded-[10px] text-[13px] font-medium tracking-[-0.005em] transition relative",
                    active
                      ? "text-white"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  )}
                  style={
                    active
                      ? {
                          background: "var(--grad-teal)",
                          boxShadow:
                            "0 4px 14px rgba(17, 122, 140, 0.28)",
                        }
                      : undefined
                  }
                >
                  <Icon size={16} strokeWidth={1.8} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge != null && (
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold px-2 rounded-full min-w-[22px] text-center",
                        active
                          ? "bg-white/20 text-white"
                          : "bg-destructive text-white"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer user card */}
      <div className="px-3.5 py-3 border-t border-border/70">
        <form action={signOut} className="contents">
          <button
            type="submit"
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl hover:bg-muted/70 transition text-left group/foot"
            title="Sign out"
          >
            <EmployeeAvatar
              size="sm"
              full_name={profile?.full_name ?? null}
              avatar_url={profile?.avatar_url ?? null}
              avatar_seed={profile?.avatar_seed ?? null}
            />
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-medium text-foreground leading-tight truncate">
                {displayName}
              </span>
              {displayEmail && (
                <span className="block text-[11px] text-muted-foreground truncate">
                  {displayEmail}
                </span>
              )}
            </span>
            <span
              className="text-muted-foreground/60 group-hover/foot:text-destructive transition"
              aria-hidden
            >
              <LogOut size={14} />
            </span>
            <ChevronUp size={14} className="text-muted-foreground/40" aria-hidden />
            <span className="sr-only">{t.nav.signOut}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
