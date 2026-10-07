export type TaskStatus = "open" | "submitted" | "approved" | "cancelled";

/** Bucket privat bukti foto. Path: `${uid}/${taskId}/r${round}/${itemId}-${uuid}.${ext}` */
export const TASK_EVIDENCE_BUCKET = "task-evidence";

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
}

export interface BlockingTask {
  taskId: string;
  title: string;
  /** Judul item yang belum punya foto. Kosong = semua item sudah, tinggal kirim. */
  remaining: string[];
}

export interface AdminTaskRow {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string;
  assigneeName: string;
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

export interface AdminTaskDetail extends AdminTaskRow {
  /** Salinan lain dari penugasan yang sama (satu batch) yang belum selesai/dibatalkan. */
  batchOthers: number;
  items: AdminTaskDetailItem[];
  reviewNote: string | null;
  reviews: { round: number; decision: "approved" | "rejected"; note: string | null; reviewedAt: string }[];
  deferrals: { forDate: string; reason: string }[];
}
