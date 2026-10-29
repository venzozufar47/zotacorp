import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Kartu pemberitahuan/pintasan di beranda karyawan — satu bahasa visual untuk semuanya: gradasi halus menurut nada,
 * ikon berbingkai, judul + keterangan yang membungkus rapi, dan penanda panah. Seluruh kartu adalah tautan (area
 * ketuk ≥ 44 px) dengan umpan balik tekan. Nada: warn = butuh tindakan, success = selesai/menunggu konfirmasi,
 * info = ajakan ringan, neutral = pintasan biasa.
 */
const TONES = {
  warn: { card: "from-warning/40 via-warning/20 to-warning/10", icon: "bg-warning" },
  success: { card: "from-success/30 via-success/15 to-success/5", icon: "bg-success/60" },
  info: { card: "from-primary/20 via-primary/10 to-primary/5", icon: "bg-primary/25" },
  neutral: { card: "from-accent/70 to-card", icon: "bg-card" },
} as const;

export type NoticeTone = keyof typeof TONES;

export function NoticeCard({
  href,
  icon,
  title,
  body,
  tone = "neutral",
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body?: string;
  tone?: NoticeTone;
  /** Penanda kecil di samping judul (mis. "Boleh anonim"). */
  badge?: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border-2 border-foreground bg-gradient-to-br px-3.5 py-3 shadow-hard-sm transition duration-200",
        "hover:-translate-y-0.5 active:translate-y-0 active:shadow-none",
        t.card
      )}
    >
      <span aria-hidden className={cn("grid size-11 shrink-0 place-items-center rounded-xl border-2 border-foreground", t.icon)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-display text-sm font-bold leading-snug">{title}</span>
          {badge}
        </span>
        {body && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">{body}</span>}
      </span>
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition group-hover:translate-x-0.5">
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}
