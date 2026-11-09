import Link from "next/link";
import { cn } from "@/lib/utils";

export type HubTab = "daftar" | "tindakan" | "struktur" | "kontrak" | "gaji";

const TABS: { key: HubTab; label: string; href: string }[] = [
  { key: "daftar", label: "Daftar", href: "/admin/karyawan" },
  { key: "tindakan", label: "Perlu tindakan", href: "/admin/karyawan?tab=tindakan" },
  { key: "struktur", label: "Struktur", href: "/admin/struktur" },
  { key: "kontrak", label: "Kontrak", href: "/admin/employment-contracts" },
  { key: "gaji", label: "Penggajian", href: "/admin/payslips/variables" },
];

/**
 * Tab hub Karyawan. Struktur, Kontrak (template & terbit massal), dan
 * Penggajian tetap halaman sendiri karena kerjanya massal; tab ini dipasang
 * di atas halaman-halaman itu supaya terasa satu tempat.
 */
export function HubTabs({ active, actionCount }: { active?: HubTab; actionCount?: number }) {
  return (
    <div className="space-y-4">
      {active !== "daftar" && active !== "tindakan" && (
        <Link href="/admin/karyawan" className="font-display text-2xl font-bold text-foreground hover:text-primary">
          Karyawan
        </Link>
      )}
      <nav aria-label="Bagian Karyawan" className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const isActive = t.key === active;
          const count = t.key === "tindakan" ? actionCount : undefined;
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
              {!!count && (
                <span className="rounded-full bg-destructive/10 px-1.5 text-xs tabular-nums text-destructive">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
