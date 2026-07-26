"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { LogOut, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import {
  buildAdminNav,
  isBranchActive,
  resolveActiveHref,
  type AdminNavScope,
} from "@/lib/nav/admin-nav";
import type { Profile } from "@/lib/supabase/types";

/**
 * Admin sidebar — Shell A (Refined Sidebar) layout.
 *
 * Sections:
 *   1. Brand block (`z` mark + "zota." wordmark + "Admin" caption)
 *   2. Grouped nav (Operasional / Karyawan / Keuangan / Unit Bisnis /
 *      Sistem) with optional badges, and collapsible parents for
 *      sections that have sub-pages.
 *   3. Footer user card with sign-out.
 *
 * The nav data itself lives in `@/lib/nav/admin-nav` and is shared with
 * AdminMobileNav — do not re-declare items here.
 *
 * Bell + pending list moved to the home dashboard Inbox + topbar.
 */
export function AdminSidebar({
  pendingCount = 0,
  disputesCount = 0,
  cleaningCount = 0,
  profile,
  scope = "full",
  isAdminZota = false,
}: {
  pendingCount?: number;
  disputesCount?: number;
  cleaningCount?: number;
  profile?: Pick<
    Profile,
    "id" | "full_name" | "email" | "avatar_url" | "avatar_seed"
  > | null;
  /** "full" = admin Zota (semua nav). "yeobo-booth" = admin unit Yeobo
   *  Booth (hanya nav Yeobo Booth, tanpa modul lain). */
  scope?: AdminNavScope;
  isAdminZota?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  // `t` is referentially stable (LanguageProvider memoizes it), so this
  // only rebuilds when a badge count or the scope actually changes.
  const groups = useMemo(
    () =>
      buildAdminNav({
        pendingCount,
        disputesCount,
        cleaningCount,
        scope,
        isAdminZota,
        t,
      }),
    [pendingCount, disputesCount, cleaningCount, scope, isAdminZota, t]
  );

  const activeHref = useMemo(
    () => resolveActiveHref(groups, pathname),
    [groups, pathname]
  );

  // Expansion is derived from the active route, so the section you're in
  // is always open. A manual toggle overrides that for the session.
  const [manual, setManual] = useState<Record<string, boolean>>({});

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
        className="flex items-center gap-3 px-5 pt-5 pb-4 group"
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

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 pb-2">
        {groups.map((g) => (
          <div key={g.label || "__root"}>
            {g.label && (
              <div className="px-3 pt-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {g.label}
              </div>
            )}
            {g.items.map((item) => {
              const { href, icon: Icon, label, badge, children } = item;
              const active = href === activeHref;
              const open = manual[href] ?? isBranchActive(item, activeHref);

              return (
                <div key={href}>
                  <div
                    className={cn(
                      "flex items-center my-0.5 rounded-[10px] transition",
                      active ? "text-white" : "hover:bg-muted"
                    )}
                    style={
                      active
                        ? {
                            background: "var(--grad-teal)",
                            boxShadow: "0 4px 14px rgba(17, 122, 140, 0.28)",
                          }
                        : undefined
                    }
                  >
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex flex-1 min-w-0 items-center gap-2.5 px-3 py-2 text-[13px] font-medium tracking-[-0.005em] transition",
                        active
                          ? "text-white"
                          : "text-foreground/70 hover:text-foreground"
                      )}
                    >
                      <Icon size={16} strokeWidth={1.8} className="shrink-0" />
                      <span className="flex-1 truncate">{label}</span>
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

                    {children && children.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setManual((m) => ({ ...m, [href]: !open }))
                        }
                        aria-expanded={open}
                        aria-label={`${open ? "Tutup" : "Buka"} sub-menu ${label}`}
                        className={cn(
                          "grid place-items-center size-7 mr-1 rounded-md shrink-0 transition",
                          active
                            ? "text-white/80 hover:bg-white/20"
                            : "text-muted-foreground hover:bg-border/60 hover:text-foreground"
                        )}
                      >
                        <ChevronRight
                          size={14}
                          strokeWidth={2}
                          className={cn(
                            "transition-transform duration-200",
                            open && "rotate-90"
                          )}
                        />
                      </button>
                    )}
                  </div>

                  {children && children.length > 0 && open && (
                    <div className="ml-[22px] pl-2.5 border-l border-border/70">
                      {children.map((c) => {
                        const childActive = c.href === activeHref;
                        return (
                          <Link
                            key={c.href}
                            href={c.href}
                            aria-current={childActive ? "page" : undefined}
                            className={cn(
                              "block px-2.5 py-1.5 my-0.5 rounded-lg text-[12.5px] font-medium tracking-[-0.005em] transition truncate",
                              childActive
                                ? "bg-muted text-foreground"
                                : "text-foreground/60 hover:bg-muted/70 hover:text-foreground"
                            )}
                          >
                            {c.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
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
            <span className="sr-only">{t.nav.signOut}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
