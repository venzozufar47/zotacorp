import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, LineChart, UserCircle2, LogOut } from "lucide-react";
import { getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { signOut } from "@/lib/actions/auth.actions";

/**
 * Layout investor portal. Theme Oceanic Editorial — premium, kalem,
 * profesional. Sidebar di desktop, bottom-nav di mobile. Investor cuma
 * boleh akses /investor/*; redirect ke role-home kalau bukan investor.
 */
export default async function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getCurrentRole();
  if (!role) redirect("/");
  if (role === "admin") redirect("/admin");
  if (role === "employee") redirect("/dashboard");

  const profile = await getCurrentProfile();
  const firstName = profile?.full_name?.split(/\s+/)[0] ?? "Investor";

  const NAV = [
    { href: "/investor", label: "Beranda", icon: LayoutDashboard },
    { href: "/investor/finance", label: "Keuangan", icon: LineChart },
    { href: "/investor/profile", label: "Profil", icon: UserCircle2 },
  ];

  return (
    <div data-theme="oceanic" className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card sticky top-0 h-screen">
          <div className="px-6 py-6 border-b border-border">
            <Link href="/investor" className="inline-flex items-center gap-2">
              <img
                src="/zota-corp-logo-tosca.png"
                alt="Zota Corp"
                className="h-10 w-auto select-none"
              />
            </Link>
            <p className="eyebrow mt-2 text-muted-foreground">Investor portal</p>
            <p className="mt-1 text-sm font-medium text-foreground truncate">
              {firstName}
            </p>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV.map((it) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Icon size={16} strokeWidth={2} />
                  {it.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-3 py-4 border-t border-border">
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut size={16} strokeWidth={2} />
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 pt-6 pb-24 md:px-6 md:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom-nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch max-w-lg mx-auto">
          {NAV.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground"
              >
                <Icon size={18} strokeWidth={2} />
                {it.label}
              </Link>
            );
          })}
          <form action={signOut} className="flex-1 flex items-center justify-center">
            <button
              type="submit"
              className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-destructive"
              aria-label="Sign out"
            >
              <LogOut size={18} strokeWidth={2} />
              Keluar
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}
