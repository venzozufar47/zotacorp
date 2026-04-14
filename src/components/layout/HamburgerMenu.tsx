"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, User, Settings, LogOut, X } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

type Variant = "sidebar" | "bottom";

interface HamburgerMenuProps {
  variant: Variant;
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
export function HamburgerMenu({ variant }: HamburgerMenuProps) {
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
    { href: "/profile", icon: User, label: t.nav.profile },
    { href: "/settings", icon: Settings, label: t.nav.settings },
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full text-left transition-all"
          style={{
            background: open || anyChildActive ? "var(--accent)" : "transparent",
            color:
              open || anyChildActive ? "var(--primary)" : "var(--muted-foreground)",
            fontWeight: open || anyChildActive ? 600 : 400,
          }}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <Menu size={18} strokeWidth={open || anyChildActive ? 2.2 : 1.8} />
          {t.nav.menu}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-white shadow-lg py-1.5 animate-fade-up"
          >
            {items.map(({ href, icon: Icon, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--accent)]"
                  style={{
                    color: active ? "var(--primary)" : "var(--foreground)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                </Link>
              );
            })}
            <div className="my-1 border-t border-border" />
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="flex items-center gap-3 px-3 py-2.5 text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
              >
                <LogOut size={16} strokeWidth={1.8} />
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
        className="flex flex-col items-center gap-1 flex-1 py-3 text-[11px] transition-colors"
        style={{
          color: anyChildActive ? "var(--primary)" : "var(--muted-foreground)",
        }}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Menu size={22} strokeWidth={anyChildActive ? 2.2 : 1.8} />
        <span className={anyChildActive ? "font-semibold" : ""}>
          {t.nav.menu}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom,0px)] md:hidden animate-fade-up"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="text-sm font-semibold">{t.nav.menu}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="pb-2">
              {items.map(({ href, icon: Icon, label }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-[var(--accent)]"
                    style={{
                      color: active ? "var(--primary)" : "var(--foreground)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                    {label}
                  </Link>
                );
              })}
              <div className="my-1 border-t border-border" />
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex items-center gap-3 px-5 py-3 text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
                >
                  <LogOut size={20} strokeWidth={1.8} />
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
