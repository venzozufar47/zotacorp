import type { TaskStatus } from "./types";

/** Satu salinan tugas milik satu karyawan, ditempatkan di kolom tanggal mulainya. */
export interface MatrixCopy {
  taskId: string;
  assigneeId: string;
  assigneeName: string;
  status: Exclude<TaskStatus, "cancelled">;
  /** Tanggal mulai asli (bisa sebelum jendela tampilan). */
  startDate: string;
  round: number;
  doneCount: number;
  itemCount: number;
  deferredToday: boolean;
}

/**
 * Satu baris matriks = satu "penugasan" (kumpulan salinan dari tugas yang sama,
 * lihat batch_id). Tugas lama tanpa batch menjadi baris sendiri.
 */
export interface MatrixRow {
  /** "b:<batchId>" atau "t:<taskId>" (tugas lama tanpa batch). */
  rowId: string;
  title: string;
  itemCount: number;
  copies: MatrixCopy[];
  /**
   * Cetakan tugas yang belum ditugaskan ke siapa pun (status backlog) — baris
   * ini belum punya salinan; menyeret karyawan ke sel membuat salinan pertama.
   * Null untuk baris biasa.
   */
  backlogTaskId: string | null;
  /** Kategori (khusus admin). */
  categoryId: string | null;
  categoryName: string | null;
}

export interface MatrixEmployee {
  id: string;
  name: string;
  businessUnit: string | null;
  /** Tugas berstatus dikerjakan (termasuk terjadwal) — beban kerja saat ini. */
  openCount: number;
}

export interface TaskMatrixData {
  from: string;
  days: number;
  today: string;
  rows: MatrixRow[];
  employees: MatrixEmployee[];
  categories: { id: string; name: string }[];
}

export const MATRIX_DAY_OPTIONS = [7, 14, 21, 31] as const;
