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
  createdAt: string;
  updatedAt: string;
  attachments?: TicketAttachment[];
}

/** Peran penampil terhadap sistem tiket. */
export type TicketViewerRole = "owner" | "head" | "filer";

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
