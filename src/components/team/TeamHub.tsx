import Link from "next/link";
import { ArrowLeft, CalendarClock, ChevronRight, ClipboardList, MessageSquarePlus, ShieldQuestion, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type TeamSection = "izin" | "briefing" | "catatan" | "tugas" | "pengaduan";

export const TEAM_SECTIONS: Record<
  TeamSection,
  { title: string; hint: string; icon: typeof CalendarClock }
> = {
  izin: { title: "Perizinan", hint: "Setujui atau catatkan izin anggota", icon: CalendarClock },
  briefing: { title: "Briefing kilat", hint: "Target dan fokus harian cabang", icon: Zap },
  catatan: { title: "Catatan pembinaan", hint: "Catatan dan teguran", icon: MessageSquarePlus },
  tugas: { title: "Penugasan", hint: "Progres tugas anggota", icon: ClipboardList },
  pengaduan: { title: "Pengaduan", hint: "Laporan dan penanganannya", icon: ShieldQuestion },
};

export interface TeamRowData {
  key: TeamSection;
  /** Angka kecil di kanan baris; 0 = tidak ditampilkan. */
  value: number;
  /** Teks di kanan bila angka tidak cocok (mis. "Aman"). */
  label?: string;
  /** Angka > 0 berwarna merah. */
  urgent?: boolean;
  /** Menimpa keterangan bawaan baris. */
  hint?: string;
}

function TeamRow({ row }: { row: TeamRowData }) {
  const meta = TEAM_SECTIONS[row.key];
  const Icon = meta.icon;
  return (
    <Link
      href={`/tim?bagian=${row.key}`}
      className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <Icon size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{meta.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{row.hint ?? meta.hint}</span>
      </span>
      {row.value > 0 ? (
        <span
          className={cn(
            "min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums",
            row.urgent ? "bg-destructive text-white" : "bg-muted text-foreground"
          )}
        >
          {row.value}
        </span>
      ) : (
        row.label && <span className="text-xs text-muted-foreground">{row.label}</span>
      )}
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Daftar baris ringkas bergaris pemisah: satu kartu, bukan kartu per bagian. */
export function TeamRowList({ rows }: { rows: TeamRowData[] }) {
  return (
    <nav aria-label="Bagian tim" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {rows.map((r) => (
        <TeamRow key={r.key} row={r} />
      ))}
    </nav>
  );
}

/**
 * Kartu aksi utama kepala toko: briefing kilat. Bila hari ini belum dicatat,
 * tombol Catat langsung terlihat; bila sudah, tampil siapa dan jam berapa.
 */
export function TeamBriefingCard({
  branches,
  postedBy,
  time,
}: {
  branches: string;
  postedBy: string | null;
  time: string | null;
}) {
  const done = time !== null;
  return (
    <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          done ? "bg-success/20 text-success" : "bg-warning/30 text-foreground"
        )}
        aria-hidden
      >
        <Zap size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold leading-tight">Briefing kilat hari ini</h2>
        <p className="truncate text-xs text-muted-foreground">
          {done ? `${branches} · ${time} · ${postedBy ?? "—"}` : `${branches} · belum dicatat`}
        </p>
      </div>
      <Link
        href="/tim?bagian=briefing"
        className={cn(
          "inline-flex h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold transition-colors",
          done
            ? "border border-border bg-card hover:bg-muted"
            : "bg-primary text-primary-foreground hover:bg-primary-dark"
        )}
      >
        {done ? "Buka" : "Catat"}
      </Link>
    </section>
  );
}

/** Peringatan satu baris, mis. catatan pembinaan yang belum dibaca. */
export function TeamAlertLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-2 rounded-xl border border-warning/60 bg-warning/15 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-warning/25"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight size={16} className="shrink-0" aria-hidden />
    </Link>
  );
}

/** Kembali ke /tim + judul bagian. Satu baris, tanpa deskripsi. */
export function TeamSectionHeader({ section }: { section: TeamSection }) {
  const meta = TEAM_SECTIONS[section];
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/tim"
        aria-label="Kembali ke Tim"
        className="-ml-2 grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft size={20} />
      </Link>
      <h2 className="font-display text-lg font-bold leading-tight">{meta.title}</h2>
    </div>
  );
}
