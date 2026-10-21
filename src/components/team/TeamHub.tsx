import Link from "next/link";
import { ArrowLeft, CalendarClock, ChevronRight, ClipboardList, MessageSquarePlus, ShieldQuestion, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type TeamSection = "izin" | "briefing" | "catatan" | "tugas" | "pengaduan";

export const TEAM_SECTIONS: Record<
  TeamSection,
  { title: string; description: string; icon: typeof CalendarClock }
> = {
  izin: {
    title: "Perizinan",
    description: "Setujui pengajuan izin anggota atau catatkan izin atas nama mereka.",
    icon: CalendarClock,
  },
  briefing: {
    title: "Briefing kilat",
    description: "Catat target dan fokus harian, kendala kemarin, serta tanya jawab dan pembagian tugas.",
    icon: Zap,
  },
  catatan: {
    title: "Catatan pembinaan",
    description: "Tulis catatan atau teguran serius, dan lihat apakah sudah dibaca.",
    icon: MessageSquarePlus,
  },
  tugas: {
    title: "Penugasan",
    description: "Pantau checklist tugas anggota, progres, dan foto buktinya.",
    icon: ClipboardList,
  },
  pengaduan: {
    title: "Pengaduan",
    description: "Laporan pengaduan dari anggota timmu yang perlu kamu konfirmasi dan putuskan.",
    icon: ShieldQuestion,
  },
};

const ORDER: TeamSection[] = ["izin", "briefing", "catatan", "tugas", "pengaduan"];

/**
 * Pilihan awal halaman Tim: lima bagian dalam bentuk kartu besar, masing-masing
 * dengan satu angka yang menandakan ada yang perlu perhatian (mis. izin yang
 * menunggu). Memilih satu membuka bagiannya lewat `?bagian=` — alamatnya bisa
 * dibagikan/di-bookmark dan tombol kembali browser berfungsi.
 */
export function TeamHub({
  counts,
}: {
  counts: Record<TeamSection, { value: number; label: string; urgent?: boolean }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {ORDER.map((key) => {
        const meta = TEAM_SECTIONS[key];
        const Icon = meta.icon;
        const c = counts[key];
        return (
          <Link
            key={key}
            href={`/tim?bagian=${key}`}
            className="group flex flex-col gap-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm transition hover:-translate-y-0.5 hover:shadow-hard"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-full border-2 border-foreground bg-tertiary">
                <Icon size={20} />
              </span>
              <ChevronRight
                size={18}
                className="mt-1 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold leading-tight">{meta.title}</h2>
              <p className="text-xs leading-snug text-muted-foreground">{meta.description}</p>
            </div>
            <span
              className={cn(
                "mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                c.urgent && c.value > 0 ? "bg-destructive text-white" : "bg-muted text-muted-foreground"
              )}
            >
              <span className="tabular-nums">{c.value}</span> {c.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Kepala bagian + tautan kembali ke pilihan awal. */
export function TeamSectionHeader({ section }: { section: TeamSection }) {
  const meta = TEAM_SECTIONS[section];
  const Icon = meta.icon;
  return (
    <div className="space-y-3">
      <Link
        href="/tim"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Semua bagian
      </Link>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full border-2 border-foreground bg-tertiary">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold leading-tight">{meta.title}</h2>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>
    </div>
  );
}
