/**
 * `backlog` = cetakan tugas yang belum punya penerima & tanggal mulai (hanya
 * terlihat admin). Admin menyeretnya ke karyawan di matriks → salinan `open`.
 */
export type TaskStatus = "backlog" | "open" | "submitted" | "approved" | "cancelled";

/** Bucket privat bukti foto. Path: `${uid}/${taskId}/r${round}/${itemId}-${uuid}.${ext}` */
export const TASK_EVIDENCE_BUCKET = "task-evidence";

/** Bucket privat lampiran foto admin (contoh/feedback). Path: `${adminId}/${uuid}.${ext}` */
export const TASK_ATTACHMENT_BUCKET = "task-attachments";
export const TASK_REFERENCE_MAX = 6;
export const TASK_FEEDBACK_MAX = 4;
/** Foto tambahan karyawan (di luar foto wajib per item) per tugas per ronde. */
export const TASK_EXTRA_MAX = 10;

/** Awalan path foto yang sah untuk (karyawan, task, ronde). */
export function taskPhotoPrefix(userId: string, taskId: string, round: number): string {
  return `${userId}/${taskId}/r${round}/`;
}

export const TASK_DEFER_REASON_MIN = 5;
export const TASK_DEFER_REASON_MAX = 300;
export const TASK_REJECT_NOTE_MAX = 500;

export interface MyTaskItem {
  id: string;
  title: string;
  note: string | null;
  done: boolean;
  /** URL bertanda-tangan (30 menit) untuk thumbnail; null bila belum ada / sudah dipurge. */
  photoUrl: string | null;
}

export interface TaskPhotoRef {
  id: string;
  url: string;
}

export interface MyTask {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "submitted";
  round: number;
  /** Feedback penolakan ronde sebelumnya (hanya bermakna saat status open & round > 1). */
  reviewNote: string | null;
  items: MyTaskItem[];
  /** Sudah ditunda untuk hari ini (sign out tidak diblokir oleh task ini). */
  deferredToday: boolean;
  deferralReason: string | null;
  /** Foto contoh/instruksi dari admin. */
  referencePhotos: TaskPhotoRef[];
  /** Foto yang menyertai penolakan terakhir (hanya bermakna saat ronde ulang). */
  feedbackPhotos: TaskPhotoRef[];
  /** Foto tambahan dari karyawan sendiri pada ronde ini (di luar foto wajib). */
  extraPhotos: TaskPhotoRef[];
}

export interface BlockingTask {
  taskId: string;
  title: string;
  /** Judul item yang belum punya foto. Kosong = semua item sudah, tinggal kirim. */
  remaining: string[];
}

export interface AdminTaskRow {
  id: string;
  /** Tanggal mulai (YYYY-MM-DD, Jakarta): sebelum ini tugas belum tampil di karyawan. Null = backlog. */
  startDate: string | null;
  title: string;
  description: string | null;
  /** Null = belum ditugaskan (backlog). */
  assigneeId: string | null;
  assigneeName: string;
  /** Kategori (khusus admin — tidak pernah dikirim ke karyawan). */
  categoryId: string | null;
  categoryName: string | null;
  status: TaskStatus;
  round: number;
  itemCount: number;
  doneCount: number;
  submittedAt: string | null;
  createdAt: string;
  /** Penundaan terakhir (alasan terbaru) — null bila belum pernah ditunda. */
  lastDeferral: { forDate: string; reason: string } | null;
  deferralCount: number;
}

export interface AdminTaskDetailItem {
  id: string;
  title: string;
  note: string | null;
  done: boolean;
  photoUrl: string | null;
  photoPurged: boolean;
}

export interface AdminTaskAttachment {
  id: string;
  kind: "reference" | "feedback";
  /** Untuk feedback: ronde yang ditolak. */
  round: number;
  /** null bila fotonya sudah dihapus (lewat masa simpan). */
  url: string | null;
}

export interface AdminTaskExtraPhoto {
  id: string;
  /** null bila fotonya sudah dihapus (lewat masa simpan). */
  url: string | null;
}

export interface AdminTaskDetail extends AdminTaskRow {
  attachments: AdminTaskAttachment[];
  /** Foto tambahan dari karyawan pada ronde berjalan. */
  extraPhotos: AdminTaskExtraPhoto[];
  /** Pilihan kategori untuk form edit (khusus admin). */
  categoryOptions: { id: string; name: string }[];
  /** Salinan lain dari penugasan yang sama (satu batch) yang belum selesai/dibatalkan. */
  batchOthers: number;
  items: AdminTaskDetailItem[];
  reviewNote: string | null;
  reviews: { round: number; decision: "approved" | "rejected"; note: string | null; reviewedAt: string }[];
  deferrals: { forDate: string; reason: string }[];
}

// ── Team leader (migrasi 175): pantau-saja ────────────────────────────────

export interface TeamTaskItem {
  id: string;
  title: string;
  done: boolean;
  photoUrl: string | null;
}

export interface TeamTask {
  id: string;
  /** Tanggal mulai; `scheduled` = belum mulai (belum tampil di karyawan). */
  startDate: string;
  scheduled: boolean;
  title: string;
  status: "open" | "submitted" | "approved";
  round: number;
  items: TeamTaskItem[];
  doneCount: number;
  itemCount: number;
  deferredToday: boolean;
  deferralReason: string | null;
  /** Feedback penolakan terakhir (hanya bermakna saat ronde ulang). */
  reviewNote: string | null;
}

export interface TeamMemberTasks {
  memberId: string;
  name: string;
  tasks: TeamTask[];
}

export interface AdminTeam {
  leaderId: string;
  leaderName: string;
  members: { id: string; name: string }[];
}

// ── Kategori (khusus superadmin) ──────────────────────────────────────────

export interface TaskCategory {
  id: string;
  name: string;
  sortOrder: number;
  /** Jumlah tugas (semua status, kecuali dibatalkan) yang memakai kategori ini. */
  taskCount: number;
}
