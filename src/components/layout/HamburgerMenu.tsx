"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, User, Settings, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";

type Variant = "sidebar" | "bottom";

export interface MenuViewer {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
}

interface HamburgerMenuProps {
  variant: Variant;
  me?: MenuViewer | null;
}

/**
 * Shared Profile / Settings / Sign-out menu used by both the desktop
 * sidebar and the mobile bottom nav. Consolidating these three destinations
 * into a single menu trims three tabs off the primary nav and matches the
 * hamburger-style UX the product spec calls for.
 *
 *  - sidebar variant: compact button in the sidebar; menu pops *up* from
 *    the bottom so it stays anchored to its trigger when open.
 *  - bottom variant: nav-style tab in the bottom bar; menu opens as a
 *    bottom sheet with a backdrop so it reads as a distinct surface on
 *    mobile.
 */
export function HamburgerMenu({ variant, me = null }: HamburgerMenuProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  // Close on outside click (desktop popover only — mobile uses its
  // backdrop for the same purpose).
  useEffect(() => {
    if (!open || variant !== "sidebar") return;
    function handleClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, variant]);

  const items = [
    { href: "/profile", icon: User, label: t.nav.profile, color: "bg-quaternary" },
    { href: "/settings", icon: Settings, label: t.nav.settings, color: "bg-card" },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const anyChildActive = items.some((i) => isActive(i.href));

  if (variant === "sidebar") {
    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "group/btn flex items-center gap-3 px-3 py-2.5 rounded-full text-sm w-full text-left transition-all duration-200",
            open || anyChildActive
              ? "bg-foreground text-background font-bold"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          {me ? (
            <EmployeeAvatar
              size="sm"
              id={me.id}
              full_name={me.full_name}
              avatar_url={me.avatar_url}
              avatar_seed={me.avatar_seed}
              className={cn(
                "transition-transform duration-200",
                open || anyChildActive
                  ? ""
                  : "group-hover/btn:rotate-[-6deg]"
              )}
            />
          ) : (
            <span
              className={cn(
                "flex items-center justify-center size-7 rounded-full border-2 border-foreground transition-transform duration-200",
                open || anyChildActive
                  ? "bg-pop-pink text-foreground"
                  : "bg-card text-muted-foreground group-hover/btn:rotate-[-6deg]"
              )}
            >
              <Menu size={14} strokeWidth={2.5} />
            </span>
          )}
          {me?.full_name?.split(" ")[0] || t.nav.menu}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border-2 border-foreground bg-popover shadow-hard py-1.5 animate-pop-in origin-bottom"
          >
            {items.map(({ href, icon: Icon, label, color }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 mx-1 my-0.5 rounded-full text-sm transition-colors",
                    active
                      ? "bg-foreground text-background font-bold"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className={cn("flex items-center justify-center size-6 rounded-full border-2 border-foreground", active ? color + " text-foreground" : "bg-card text-muted-foreground")}>
                    <Icon size={12} strokeWidth={2.5} />
                  </span>
                  {label}
                </Link>
              );
            })}
            <div className="my-1.5 border-t-2 border-foreground/20 mx-2" />
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="group/out flex items-center gap-3 px-3 py-2.5 mx-1 my-0.5 rounded-full text-sm w-[calc(100%-0.5rem)] text-left text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <span className="flex items-center justify-center size-6 rounded-full border-2 border-foreground bg-card group-hover/out:bg-destructive group-hover/out:text-white">
                  <LogOut size={12} strokeWidth={2.5} />
                </span>
                {t.nav.signOut}
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // bottom variant
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 flex-1 py-2 text-[11px] transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {me ? (
          <EmployeeAvatar
            id={me.id}
            full_name={me.full_name}
            avatar_url={me.avatar_url}
            avatar_seed={me.avatar_seed}
          />
        ) : (
          <span
            className={cn(
              "flex items-center justify-center size-9 rounded-full border-2 border-foreground transition-transform duration-200",
              anyChildActive
                ? "bg-pop-pink text-foreground"
                : "bg-card text-muted-foreground"
            )}
          >
            <Menu size={18} strokeWidth={2.5} />
          </span>
        )}
        <span
          className={cn(
            "font-display font-bold uppercase tracking-wide text-[0.625rem]",
            anyChildActive ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {me?.full_name?.split(" ")[0] || t.nav.menu}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl border-t-2 border-foreground shadow-hard pb-[env(safe-area-inset-bottom,0px)] md:hidden animate-pop-in origin-bottom"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b-2 border-foreground/10">
              <span className="font-display text-base font-bold">{t.nav.menu}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="size-8 flex items-center justify-center rounded-full border-2 border-foreground bg-card hover:rotate-90 transition-transform"
                aria-label="Close"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="py-2 px-2">
              {items.map(({ href, icon: Icon, label, color }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 my-0.5 rounded-full text-sm transition-colors",
                      active
                        ? "bg-foreground text-background font-bold"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span className={cn("flex items-center justify-center size-8 rounded-full border-2 border-foreground", active ? color + " text-foreground" : "bg-card text-muted-foreground")}>
                      <Icon size={16} strokeWidth={2.5} />
                    </span>
                    {label}
                  </Link>
                );
              })}
              <div className="my-1.5 border-t-2 border-foreground/10" />
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="group/out flex items-center gap-3 px-3 py-3 my-0.5 rounded-full text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
