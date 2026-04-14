"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ClipboardList, Users, Settings, LogOut, Receipt } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const navItems = [
    { href: "/admin/attendance", icon: ClipboardList, label: t.nav.attendance },
    { href: "/admin/payslips", icon: Receipt, label: t.nav.payslips },
    { href: "/admin/users", icon: Users, label: t.nav.users },
    { href: "/admin/settings", icon: Settings, label: t.nav.settings },
  ];

  // Auto-close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Fixed top bar — mobile only */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4 bg-white/95 backdrop-blur-md border-b border-border md:hidden">
        <div className="flex items-center gap-2">
          <img src="/zota-corp-logo-tosca.png" alt="Zota Corp" className="h-7" />
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Admin</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="w-10 h-10 flex items-center justify-center rounded-xl transition-colors hover:bg-muted"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Backdrop overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white z-50 transform transition-transform duration-200 ease-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-6 border-b border-border">
          <img src="/zota-corp-logo-tosca.png" alt="Zota Corp" className="h-10" />
          <p className="text-xs text-muted-foreground mt-2 font-medium uppercase tracking-wide">Admin</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--primary)" : "var(--muted-foreground)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all"
            >
              <LogOut size={18} strokeWidth={1.8} />
              {t.nav.signOut}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
