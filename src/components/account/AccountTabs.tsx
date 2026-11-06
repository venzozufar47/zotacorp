"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, FileSignature, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Baris tab bersama untuk empat halaman Akun (Profil, Kontrak, Tes DISC,
 * Pengaturan). Rute tetap terpisah supaya tautan dari notifikasi dan kartu
 * dashboard tetap jalan; tab hanya menyatukan navigasinya.
 */
export function AccountTabs() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const tabs = [
    { href: "/profile", icon: User, label: t.nav.profile },
    { href: "/kontrak", icon: FileSignature, label: "Kontrak" },
    { href: "/disc", icon: Brain, label: "Tes DISC" },
    { href: "/settings", icon: Settings, label: t.nav.settings },
  ];

  return (
    <nav aria-label="Akun">
      <ul className="flex gap-1 rounded-full bg-muted p-1">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="min-w-0 flex-auto">
              <Link
                prefetch={false}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors motion-reduce:transition-none sm:px-3 sm:text-sm",
                  active
                    ? "bg-foreground font-semibold text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {/* Ikon hanya di layar lebar; di HP label saja agar keempat tab muat. */}
                <Icon size={16} strokeWidth={1.75} aria-hidden className="hidden shrink-0 sm:block" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
