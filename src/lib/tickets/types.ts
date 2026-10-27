/**
 * Domain types Ticketing System (Yeobo Space dan Haengbocake).
 *
 * Hand-maintained (tidak ikut generated `supabase/types.ts`) — query pakai
 * `.from("tickets" as never)`, pola employment-contracts.
 *
 * Dua arah:
 *   up   : karyawan melapor; tiket mendarat di Tingkat 1 rantai cabangnya dan naik satu tingkat tiap eskalasi,
 *          sampai owner (handler_level = OWNER_LEVEL).
 *   down : owner menugaskan ke satu karyawan (assignee_id) atau ke seluruh cabang (assignee_id kosong, siapa pun di
 *          cabang itu bisa mengambil). Penerima mengerjakan + bukti foto; pembuat (owner) yang mengonfirmasi.
 *
 * Alur status (sama untuk kedua arah; "penanggung jawab" = anggota tingkat handler_level, atau penerima untuk 'down'):
 *   open → in_progress → resolved                (penanggung jawab)
 *   open | in_progress → escalated               (penanggung jawab → tingkat di atasnya; penerima 'down' → owner)
 *   escalated → owner_handling                   (tingkat atas ACC → ditangani di tingkat itu)
 *   escalated → in_progress                       (tingkat atas Tolak + catatan → kembali ke tingkat bawah / penerima)
 *   owner_handling → resolved                     (tingkat yang menangani)
 *   resolved → confirmed (pembuat) | in_progress  (pembuat menolak "belum beres")
 *   (open | in_progress) → cancelled              (pembuat / admin)
 */

export type TicketStatus =
  | "open"
  | "in_progress"
  | "escalated"
  | "owner_handling"
  | "resolved"
  | "cancelled";

/** Nama cabang (mis. "Tlogosari", "Pare"); daftar sah ada di tabel ticket_branches. */
export type TicketBranch = string;
export type TicketDirection = "up" | "down";
export type TicketCategory = "kebutuhan_barang" | "barang_rusak" | "lainnya";
export type TicketPriority = "normal" | "urgent";

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  kebutuhan_barang: "Kebutuhan barang",
  barang_rusak: "Barang rusak / perlu ganti",
  lainnya: "Lainnya",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Baru",
  in_progress: "Dikerjakan",
  escalated: "Menunggu keputusan atasan",
  owner_handling: "Ditangani atasan",
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
  /** ticket_branches.id */
  branchId: string;
  /** Label tampilan cabang, mis. "Yeobo Space · Tlogosari". */
  branchLabel?: string;
  direction: TicketDirection;
  /** Penerima tiket 'down' (kosong = ditujukan ke seluruh cabang, belum diambil). */
  assigneeId: string | null;
  assigneeName?: string | null;
  /** Orang yang terakhir meneruskan tiket 'down' ke penerima sekarang (null = belum pernah diteruskan). */
  delegatedFromId: string | null;
  delegatedFromName?: string | null;
  /** Tingkat yang sedang memegang tiket 'up' (OWNER_LEVEL = owner). */
  handlerLevel: number;
  /** Tingkat asal eskalasi (untuk mengembalikan bila ditolak); 0 = penerima tiket 'down'. */
  escalatedFromLevel: number | null;
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
  /** Pemegang tiket 'naik' saat handlerLevel = 1 (orang tertentu); null bila owner / tiket 'turun'. */
  handlerId: string | null;
  handlerName?: string | null;
  /** Orang yang mengeskalasi ke pemegang sekarang (tempat tiket kembali bila eskalasi ditolak). */
  escalatedFromId: string | null;
  /** Verifikator yang dipilih pembuat (>= 2, semua wajib). Kosong = tanpa verifikasi. */
  verifierIds: string[];
  /** Progres verifikasi putaran terakhir (diisi saat hydrate; kosong bila tidak ada). */
  verification?: { verifierId: string; name: string; status: "pending" | "verified" | "rejected" }[];
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

/** Label status yang peka pemegang: "Menunggu keputusan Owner", "Ditangani Boles", dst. */
export function ticketStatusLabel(t: Pick<Ticket, "status" | "handlerLevel" | "handlerName">): string {
  const lvl = t.handlerLevel >= 99 ? "Owner" : t.handlerName?.trim() || "atasan";
  if (t.status === "escalated") return `Menunggu keputusan ${lvl}`;
  if (t.status === "owner_handling") return `Ditangani ${lvl}`;
  return TICKET_STATUS_LABELS[t.status];
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
  direction: TicketDirection;
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

/** Tiket yang masih dikerjakan penanggung jawab tingkatnya (belum diteruskan ke atas). */
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
