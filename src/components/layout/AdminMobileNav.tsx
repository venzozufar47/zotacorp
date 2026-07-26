"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { PendingConfirmationsBell } from "./PendingConfirmationsBell";
import {
  MOBILE_PRIMARY_HREFS,
  MOBILE_PRIMARY_HREFS_YEOBO,
  buildAdminNav,
  isBranchActive,
  resolveActiveHref,
  type AdminNavItem,
  type AdminNavScope,
} from "@/lib/nav/admin-nav";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

/**
 * Admin mobile chrome — same nav data as AdminSidebar (desktop).
 *  - Thin top bar (logo + admin badge + pending bell) for context.
 *  - Bottom nav: a few fixed primary tabs + a "Menu" tab that opens the
 *    full grouped tree as a bottom sheet.
 *
 * This replaced a single horizontally-scrolling strip that held all 23
 * items at 64px each — ~1470px of scroll on a 390px screen, where the
 * tail end was effectively undiscoverable.
 *
 * Nav items come from `@/lib/nav/admin-nav`, shared with AdminSidebar —
 * there is no second list to keep in sync any more.
 */
export function AdminMobileNav({
  pendingConfirmations = [],
  pendingCount = 0,
  disputesCount = 0,
  cleaningCount = 0,
  scope = "full",
  isAdminZota = false,
}: {
  pendingConfirmations?: PendingConfirmationItem[];
  pendingCount?: number;
  disputesCount?: number;
  cleaningCount?: number;
  scope?: AdminNavScope;
  isAdminZota?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<Record<string, boolean>>({});

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
  const allItems = groups.flatMap((g) => g.items);

  const primaryHrefs: readonly string[] =
    scope === "yeobo-booth" ? MOBILE_PRIMARY_HREFS_YEOBO : MOBILE_PRIMARY_HREFS;

  // Keep the order declared in the config, and skip any href the current
  // scope filtered out.
  const primaries = primaryHrefs
    .map((href) => allItems.find((it) => it.href === href))
    .filter((it): it is AdminNavItem => Boolean(it));

  // Anything actionable that isn't on a primary tab would otherwise be
  // invisible behind the sheet, so roll those badges up onto "Menu".
  const hiddenBadgeCount = allItems
    .filter((it) => !primaryHrefs.includes(it.href))
    .reduce((sum, it) => sum + (it.badge ?? 0), 0);

  const menuActive = !primaries.some((it) => isBranchActive(it, activeHref));

  // Close on route change. Adjusted during render rather than in an
  // effect: an effect would commit the open sheet first and then close
  // it in a second pass (cascading render), and it would also have to
  // re-run to handle navigating back to the route it was opened on.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  // Lock body scroll while the sheet is open. HamburgerMenu skips this
  // because its menu is five rows; this one is the full nav tree, so
  // scroll-chaining past its end moves the page behind the backdrop.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {/* Top bar — logo + admin badge + bell. Thin context strip. */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4 bg-background border-b-2 border-foreground md:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/zota-corp-logo-tosca.png"
            alt="Zota Corp"
            className="h-7 w-auto select-none"
          />
          <span className="px-2 py-0.5 rounded-full border-2 border-foreground bg-tertiary text-[0.625rem] font-display font-bold uppercase tracking-wider text-foreground">
            Admin
          </span>
        </div>
        <PendingConfirmationsBell items={pendingConfirmations} variant="compact" />
      </div>

      {/* Bottom nav — fixed primary tabs + Menu. No horizontal scroll. */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-background border-t-2 border-foreground z-50 md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-stretch gap-1 px-1 pt-1 sm:px-2">
          {primaries.map((item) => {
            const { href, icon: Icon, label, badge, color } = item;
            const active = isBranchActive(item, activeHref);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 flex-1 min-w-0 py-1 text-[11px] transition-colors"
              >
                <span className="relative">
                  <span
                    className={cn(
                      "flex items-center justify-center size-9 rounded-full border-2 border-foreground transition-transform duration-200",
                      active
                        ? (color ?? "bg-primary") + " text-foreground"
                        : "bg-card text-muted-foreground"
                    )}
                  >
                    <Icon size={18} strokeWidth={2.5} />
                  </span>
                  {badge != null && badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-destructive border-2 border-background text-[9px] font-bold text-white">
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

          {/* Menu tab — opens the full tree. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-haspopup="menu"
            className="flex flex-col items-center gap-1 flex-1 min-w-0 py-1 text-[11px] transition-colors"
          >
            <span className="relative">
              <span
                className={cn(
                  "flex items-center justify-center size-9 rounded-full border-2 border-foreground transition-transform duration-200",
                  menuActive
                    ? "bg-pop-pink text-foreground"
                    : "bg-card text-muted-foreground"
                )}
              >
                <Menu size={18} strokeWidth={2.5} />
              </span>
              {hiddenBadgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-destructive border-2 border-background text-[9px] font-bold text-white">
                  {hiddenBadgeCount}
                </span>
              )}
            </span>
            <span
              className={cn(
                "font-display font-bold uppercase tracking-wide text-[0.625rem]",
                menuActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {t.nav.menu}
            </span>
          </button>
        </div>
      </nav>

      {/* Menu sheet — mirrors the desktop sidebar tree. */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col max-h-[82vh] bg-background rounded-t-3xl border-t-2 border-foreground shadow-hard pb-[env(safe-area-inset-bottom,0px)] md:hidden animate-pop-in origin-bottom"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b-2 border-foreground/10 shrink-0">
              <span className="font-display text-base font-bold">
                {t.nav.menu}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="size-8 flex items-center justify-center rounded-full border-2 border-foreground bg-card hover:rotate-90 transition-transform"
                aria-label="Close"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
              {groups.map((g) => (
                <div key={g.label || "__root"}>
                  {g.label && (
                    <div className="px-3 pt-3 pb-1 font-display text-[0.625rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {g.label}
                    </div>
                  )}
                  {g.items.map((item) => {
                    const { href, icon: Icon, label, badge, color, children } =
                      item;
                    const active = href === activeHref;
                    const expanded =
                      manual[href] ?? isBranchActive(item, activeHref);

                    return (
                      <div key={href}>
                        <div className="flex items-center gap-1">
                          <Link
                            href={href}
                            role="menuitem"
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 my-0.5 rounded-full text-sm transition-colors",
                              active
                                ? "bg-foreground text-background font-bold"
                                : "text-foreground hover:bg-muted"
                            )}
                          >
                            <span
                              className={cn(
                                "flex items-center justify-center size-8 shrink-0 rounded-full border-2 border-foreground",
                                active
                                  ? (color ?? "bg-primary") + " text-foreground"
                                  : "bg-card text-muted-foreground"
                              )}
                            >
                              <Icon size={16} strokeWidth={2.5} />
                            </span>
                            <span className="flex-1 truncate">{label}</span>
                            {badge != null && badge > 0 && (
                              <span className="shrink-0 min-w-[22px] px-2 rounded-full bg-destructive text-[10.5px] font-bold text-white text-center">
                                {badge}
                              </span>
                            )}
                          </Link>

                          {children && children.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setManual((m) => ({ ...m, [href]: !expanded }))
                              }
                              aria-expanded={expanded}
                              aria-label={`${expanded ? "Tutup" : "Buka"} sub-menu ${label}`}
                              className="grid place-items-center size-9 shrink-0 rounded-full border-2 border-foreground bg-card text-muted-foreground transition"
                            >
                              <ChevronRight
                                size={15}
                                strokeWidth={2.5}
                                className={cn(
                                  "transition-transform duration-200",
                                  expanded && "rotate-90"
                                )}
                              />
                            </button>
                          )}
                        </div>

                        {children && children.length > 0 && expanded && (
                          <div className="ml-[26px] pl-3 border-l-2 border-foreground/15">
                            {children.map((c) => {
                              const childActive = c.href === activeHref;
                              return (
                                <Link
                                  key={c.href}
                                  href={c.href}
                                  role="menuitem"
                                  aria-current={childActive ? "page" : undefined}
                                  className={cn(
                                    "block px-3 py-2 my-0.5 rounded-full text-[13px] transition-colors truncate",
                                    childActive
                                      ? "bg-foreground text-background font-bold"
                                      : "text-foreground/70 hover:bg-muted"
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

              <div className="my-2 border-t-2 border-foreground/10" />
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="group/out flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-full text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <span className="flex items-center justify-center size-8 rounded-full border-2 border-foreground bg-card group-hover/out:bg-destructive group-hover/out:text-white">
                    <LogOut size={16} strokeWidth={2.5} />
                  </span>
                  {t.nav.signOut}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
