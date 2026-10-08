/**
 * Domain types Ticketing System (Yeobo Space Studio).
 *
 * Hand-maintained (tidak ikut generated `supabase/types.ts`) — query pakai
 * `.from("tickets" as never)`, pola employment-contracts.
 *
 * Alur status:
 *   open → in_progress → resolved                (Kepala Studio)
 *   open | in_progress → escalated               (Kepala Studio → owner)
 *   escalated → owner_handling                   (owner ACC)
 *   escalated → in_progress                       (owner Tolak + owner_note)
 *   owner_handling → resolved                     (owner)
 *   (open | in_progress) → cancelled              (pembuat / admin)
 */

export type TicketStatus =
  | "open"
  | "in_progress"
  | "escalated"
  | "owner_handling"
  | "resolved"
  | "cancelled";

export type TicketBranch = "Tlogosari" | "Tembalang" | "Jebres";
export type TicketCategory = "kebutuhan_barang" | "barang_rusak" | "lainnya";
export type TicketPriority = "normal" | "urgent";

export const TICKET_BRANCHES: TicketBranch[] = ["Tlogosari", "Tembalang", "Jebres"];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  kebutuhan_barang: "Kebutuhan barang",
  barang_rusak: "Barang rusak / perlu ganti",
  lainnya: "Lainnya",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Baru",
  in_progress: "Dikerjakan",
  escalated: "Eskalasi ke owner",
  owner_handling: "Ditangani owner",
  resolved: "Selesai",
  cancelled: "Dibatalkan",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  normal: "Normal",
  urgent: "Mendesak",
};

export interface TicketAttachment {
  id: string;
  ticketId: string;
  path: string;
  contentType: string | null;
  uploadedBy: string | null;
  /** report = lampiran pelapor; resolution = bukti selesai aktif; superseded = bukti putaran lama yang ditolak pelapor. */
  kind: "report" | "resolution" | "superseded";
  sortOrder: number;
  createdAt: string;
}

export interface Ticket {
  id: string;
  createdBy: string;
  createdByName?: string | null;
  createdByAvatarUrl?: string | null;
  createdByAvatarSeed?: string | null;
  businessUnit: string;
  branch: TicketBranch;
  category: TicketCategory;
  priority: TicketPriority;
  title: string;
  description: string;
  status: TicketStatus;
  inProgressAt: string | null;
  inProgressBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  escalatedAt: string | null;
  escalatedBy: string | null;
  escalationNote: string | null;
  ownerDecision: "accepted" | "rejected" | null;
  ownerDecidedAt: string | null;
  ownerDecidedBy: string | null;
  ownerNote: string | null;
  /** Konfirmasi pembuat atas penyelesaian (cross-check). */
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** Catatan "belum beres" saat pembuat menolak penyelesaian. */
  disputeNote: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: TicketAttachment[];
}

/** Tiket sudah diselesaikan tapi belum dikonfirmasi pembuat. */
export function needsFilerConfirmation(
  t: Pick<Ticket, "status" | "confirmedAt">
): boolean {
  return t.status === "resolved" && !t.confirmedAt;
}

/** Peran penampil terhadap sistem tiket. */
export type TicketViewerRole = "owner" | "head" | "filer";

/**
 * Baris ringkas "antrian sesama cabang" — karyawan Yeobo Space melihat tiket
 * AKTIF rekan sekantor (termasuk yang dibuat admin/owner utk cabang itu),
 * TANPA deskripsi/catatan/foto (lihat getBranchQueue di tickets.actions.ts
 * dan migration 150_ticket_branch_queue.sql). Tipe terpisah dari `Ticket`
 * secara sengaja — bukan cuma `Omit<Ticket, ...>` — supaya UI yang memakai
 * tipe ini tidak bisa "kelupaan" merender field detail yang memang tidak
 * pernah di-fetch untuk baris ini.
 */
export interface TicketQueueSummary {
  id: string;
  branch: TicketBranch;
  category: TicketCategory;
  priority: TicketPriority;
  title: string;
  status: TicketStatus;
  createdByName: string;
  createdByAvatarUrl: string | null;
  createdByAvatarSeed: string | null;
  createdAt: string;
}

/** Status yang dianggap "belum selesai" (butuh perhatian / masih di antrian). */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "escalated",
  "owner_handling",
];

export const TERMINAL_TICKET_STATUSES: TicketStatus[] = ["resolved", "cancelled"];

export function isTicketOpen(status: TicketStatus): boolean {
  return OPEN_TICKET_STATUSES.includes(status);
}

/** Antrian yang jadi tanggung jawab Kepala Studio (belum di tangan owner). */
export function isStudioQueueStatus(status: TicketStatus): boolean {
  return status === "open" || status === "in_progress";
}

/**
 * Durasi pengerjaan (ms) dari dibuat s/d selesai — dasar KPI Kepala Studio.
 * null bila belum selesai.
 */
export function ticketResolutionMs(t: Pick<Ticket, "createdAt" | "resolvedAt">): number | null {
  if (!t.resolvedAt) return null;
  return new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime();
}

/** Format durasi ms → "2 hari 3 jam" / "5 jam" / "12 mnt". */
export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} mnt`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem > 0 ? `${hours} jam ${rem} mnt` : `${hours} jam`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days} hari ${remH} jam` : `${days} hari`;
}

/**
 * Warna badge status tiket. Sengaja di modul netral (bukan di TicketCard
 * yang "use client"): server component mengimpornya, dan ekspor dari modul
 * client hanya berupa referensi — memanggil/mengindeksnya di server error.
 */
export const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-warning/20 text-warning border-warning",
  in_progress: "bg-accent text-[var(--teal-700)] border-[var(--teal-500)]",
  escalated: "bg-pop-pink/30 text-foreground border-foreground",
  owner_handling: "bg-primary/15 text-primary border-primary",
  resolved: "bg-success/15 text-success border-success",
  cancelled: "bg-muted text-muted-foreground border-border",
};

/** "baru saja" / "5 mnt lalu" / "3 jam lalu" / "2 hari lalu". */
export function agoLabel(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
}

/** Ukuran sampel & target KPI "Kecepatan Tiket Studio" di home dashboard Kepala Studio. */
export const RECENT_RESOLUTION_SAMPLE_SIZE = 10;
export const RECENT_RESOLUTION_TARGET_MS = 7 * 24 * 60 * 60 * 1000; // target: 7 hari
