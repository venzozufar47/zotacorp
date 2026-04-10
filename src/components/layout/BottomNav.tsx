"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, User, LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/attendance", icon: Clock, label: "Attendance" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-border z-50 pb-safe">
      <div className="flex items-center max-w-lg mx-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 flex-1 py-3 text-xs transition-colors"
              style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span className={active ? "font-semibold" : ""}>{label}</span>
            </Link>
          );
        })}
        <form action={signOut} className="flex-1">
          <button
            type="submit"
            className="flex flex-col items-center gap-1 w-full py-3 text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            <LogOut size={22} strokeWidth={1.8} />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </nav>
  );
}
