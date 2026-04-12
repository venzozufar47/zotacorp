"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LogOut, Users, Settings } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";

const navItems = [
  { href: "/admin/attendance", icon: ClipboardList, label: "Attendance" },
  { href: "/admin/users", icon: Users, label: "Users" },
  { href: "/admin/settings", icon: Settings, label: "Settings" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 bg-white border-r border-border min-h-screen sticky top-0">
      <div className="px-6 py-6 border-b border-border">
        <img
          src="/zota-corp-logo-tosca.png"
          alt="Zota Corp"
          className="h-7"
        />
        <p className="text-xs text-muted-foreground mt-1.5 font-medium uppercase tracking-wide">Admin</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all"
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
