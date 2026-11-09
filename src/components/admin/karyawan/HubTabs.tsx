import Link from "next/link";
import { cn } from "@/lib/utils";

export type HubTab = "daftar" | "tindakan";

/**
 * Tab hub Karyawan. Struktur dan Penggajian masih halaman sendiri; tautannya
 * ditaruh di sini supaya semua urusan karyawan berangkat dari satu tempat.
 */
export function HubTabs({ active, actionCount }: { active: HubTab; actionCount: number }) {
  const tabs: { key: string; label: string; href: string; count?: number }[] = [
    { key: "daftar", label: "Daftar", href: "/admin/karyawan" },
    { key: "tindakan", label: "Perlu tindakan", href: "/admin/karyawan?tab=tindakan", count: actionCount },
    { key: "struktur", label: "Struktur", href: "/admin/struktur" },
    { key: "gaji", label: "Penggajian", href: "/admin/payslips/variables" },
  ];
  return (
    <nav aria-label="Bagian Karyawan" className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {!!t.count && (
              <span className="rounded-full bg-destructive/10 px-1.5 text-xs tabular-nums text-destructive">
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
