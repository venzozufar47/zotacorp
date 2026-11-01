import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface ShortcutItem {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Penanda kecil di samping judul (mis. "Boleh anonim"). */
  badge?: React.ReactNode;
}

/**
 * Pintasan tetap (pengaduan, persetujuan, bonus, dst.) dalam satu kartu bergaya tipis dengan baris bersekat, supaya
 * tidak menjadi tumpukan kartu tebal. Kartu bernada (perlu tindakan) tetap memakai NoticeCard.
 */
export function ShortcutsCard({ items }: { items: ShortcutItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Pintasan" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="flex min-h-12 items-center gap-2.5 px-3.5 py-2.5 transition active:bg-muted/50 [&+&]:border-t [&+&]:border-border/60"
        >
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted/60 text-foreground [&_svg]:size-4">
            {it.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 text-[13.5px] font-semibold leading-snug">
              {it.title}
              {it.badge}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{it.body}</span>
          </span>
          <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </section>
  );
}
