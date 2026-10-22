import {
  ClipboardCheck,
  ClipboardList,
  FileClock,
  Hourglass,
  MessageSquareWarning,
  Repeat,
  ScanFace,
  Smartphone,
  Ticket,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

/**
 * Registri tunggal jenis notifikasi admin (Inbox beranda + lonceng topbar).
 * Jenis baru cukup ditambah di sini: ikon, warna, label, teks, dan tautan
 * ikut dipakai kedua permukaan, jadi tidak ada lagi rantai ternary ganda
 * yang bisa salah label (mis. jenis baru terbaca "Overtime").
 */
export type NotifKind = PendingConfirmationItem["kind"] | "dispute";
export type NotifTone = "warn" | "bad" | "info";

interface KindMeta {
  label: string;
  Icon: LucideIcon;
  tone: NotifTone;
}

export const NOTIF_KINDS: Record<NotifKind, KindMeta> = {
  late_proof: { label: "Late proof", Icon: FileClock, tone: "warn" },
  overtime: { label: "Overtime", Icon: Hourglass, tone: "info" },
  registration: { label: "Pendaftar", Icon: UserPlus, tone: "info" },
  ticket: { label: "Tiket", Icon: Ticket, tone: "bad" },
  sim_card: { label: "SIM", Icon: Smartphone, tone: "bad" },
  task_review: { label: "Tugas", Icon: ClipboardCheck, tone: "warn" },
  subscription: { label: "Langganan", Icon: Repeat, tone: "warn" },
  sop_review: { label: "SOP", Icon: ClipboardList, tone: "warn" },
  sop_issue: { label: "Masukan SOP", Icon: MessageSquareWarning, tone: "warn" },
  selfie_override: { label: "Absen ditolak AI", Icon: ScanFace, tone: "warn" },
  dispute: { label: "Dispute", Icon: MessageSquareWarning, tone: "bad" },
};

/** Urutan tampil: yang paling mendesak dulu (sort stabil, urutan asal terjaga). */
export const TONE_RANK: Record<NotifTone, number> = { bad: 0, warn: 1, info: 2 };

export const TONE_CLASSES: Record<
  NotifTone,
  { solid: string; soft: string; text: string }
> = {
  warn: { solid: "bg-warning text-white", soft: "bg-warning/15 text-warning", text: "text-warning" },
  bad: {
    solid: "bg-destructive text-white",
    soft: "bg-destructive/15 text-destructive",
    text: "text-destructive",
  },
  info: {
    solid: "bg-[var(--teal-700)] text-white",
    soft: "bg-accent text-[var(--teal-700)]",
    text: "text-[var(--teal-700)]",
  },
};

/** Langganan / tinjau SOP yang sudah lewat tenggat naik jadi merah; selebihnya ikut jenisnya. */
export function notifTone(item: { kind: NotifKind; shortLabel?: string }): NotifTone {
  if (
    (item.kind === "subscription" || item.kind === "sop_review") &&
    item.shortLabel?.startsWith("Telat")
  )
    return "bad";
  return NOTIF_KINDS[item.kind].tone;
}

export function sortByUrgency<T extends { kind: NotifKind; shortLabel?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => TONE_RANK[notifTone(a)] - TONE_RANK[notifTone(b)]);
}

/** Sama dengan format di drawer karyawan: "25m", "1j 10m", "2j". */
export function otDuration(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}j ${rem}m` : `${h}j`;
}

export function agoLabel(iso: string) {
  // Tanggal-saja ("2026-10-03") berarti hari WIB itu, bukan 00:00 UTC —
  // tanpa ini umur melenceng 7 jam.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00+07:00` : iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

export function notifDesc(p: PendingConfirmationItem): string {
  switch (p.kind) {
    case "task_review":
      return "Tugas menunggu verifikasi";
    case "subscription":
      return p.detail ?? "Langganan segera jatuh tempo";
    case "sop_review":
    case "sop_issue":
      return p.detail ?? "SOP perlu perhatian";
    case "selfie_override":
      return p.detail ?? "Karyawan tetap absen walau foto ditolak AI";
    case "sim_card":
      return p.detail ?? "Nomor SIM lewat tenggat — perlu isi pulsa";
    case "ticket":
      return p.detail ? `Eskalasi tiket: ${p.detail}` : "Tiket studio perlu ditangani";
    case "registration":
      return "Menunggu ACC akun";
    case "late_proof":
      return "Awaiting approval";
    case "overtime":
      return p.minutes ? `OT ${otDuration(p.minutes)} awaiting approval` : "OT awaiting approval";
  }
}

/** Langganan / tinjau SOP: tanggalnya jatuh tempo, jadi "umur" tak bermakna — pakai H-3 / Hari ini / Telat Nh. */
export function notifAgo(p: PendingConfirmationItem): string {
  return p.kind === "subscription" || p.kind === "sop_review"
    ? (p.shortLabel ?? "")
    : agoLabel(p.at ?? p.date);
}

/** Tujuan klik untuk jenis yang punya halaman sendiri; undefined = ditangani pemanggil. */
export function notifHref(p: PendingConfirmationItem): string | undefined {
  switch (p.kind) {
    case "task_review":
      return `/admin/tasks?focus=${p.rowId}`;
    case "subscription":
      return "/admin/subscriptions";
    case "sop_review":
      return "/admin/cleaning?setup=1";
    case "sop_issue":
      // Langsung ke masukan itu di tab Kepatuhan, bukan ke halaman SOP umum.
      return `/admin/cleaning?finding=issue:${p.rowId}`;
    case "sim_card":
      return "/admin/sim-cards";
    case "ticket":
      return "/admin/tickets";
    case "selfie_override":
      return `/admin/attendance?focus=${p.rowId}&selfie=1`;
    default:
      return undefined;
  }
}

/**
 * Elemen kiri satu baris notifikasi. Notifikasi yang menyangkut karyawan
 * menampilkan avatarnya + lencana ikon jenis; yang tidak menyangkut siapa
 * pun (mis. langganan) cukup ikon jenisnya — TIDAK memakai avatar, karena
 * avatar tanpa foto/seed dibuat acak dari nama dan terbaca seperti orang.
 */
export function NotifLeading({
  kind,
  tone,
  hasPerson,
  name,
  avatarUrl,
  avatarSeed,
  size = "md",
}: {
  kind: NotifKind;
  tone: NotifTone;
  hasPerson: boolean;
  name: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  size?: "md" | "sm";
}) {
  const { Icon } = NOTIF_KINDS[kind];
  const box = size === "sm" ? "size-7" : "size-9";
  if (!hasPerson) {
    return (
      <span
        aria-hidden
        className={`shrink-0 ${box} inline-flex items-center justify-center rounded-full ${TONE_CLASSES[tone].soft}`}
      >
        <Icon size={size === "sm" ? 14 : 17} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span className="relative shrink-0">
      <EmployeeAvatar
        size={size === "sm" ? "sm" : "default"}
        full_name={name}
        avatar_url={avatarUrl}
        avatar_seed={avatarSeed}
      />
      <span
        aria-hidden
        className={`absolute -bottom-1 -right-1 size-4 inline-flex items-center justify-center rounded-full ring-2 ring-card ${TONE_CLASSES[tone].solid}`}
      >
        <Icon size={9} strokeWidth={2.6} />
      </span>
    </span>
  );
}
