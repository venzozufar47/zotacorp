import type { BlockingTask } from "./types";

export interface GateTaskInput {
  taskId: string;
  title: string;
  status: string;
  /** Item ronde berjalan, berurutan. */
  items: { id: string; title: string }[];
  /** id item yang sudah punya foto di ronde berjalan. */
  doneItemIds: ReadonlySet<string>;
  /** Sudah ditunda untuk hari ini (alasan tercatat). */
  deferredToday: boolean;
}

/**
 * Keputusan murni (tanpa I/O): task mana yang memblokir sign out hari ini.
 *
 * - Hanya `open` yang memblokir. `submitted` menunggu admin (bola bukan di
 *   karyawan), `approved`/`cancelled` sudah selesai.
 * - `deferredToday` melepas blokir HARI INI saja — besok kembali memblokir.
 * - Task `open` yang semua itemnya sudah berfoto tetap memblokir (belum
 *   dikirim ke verifikasi), dengan `remaining` kosong.
 */
export function decideBlockingTasks(tasks: GateTaskInput[]): BlockingTask[] {
  return tasks
    .filter((t) => t.status === "open" && !t.deferredToday)
    .map((t) => ({
      taskId: t.taskId,
      title: t.title,
      remaining: t.items.filter((i) => !t.doneItemIds.has(i.id)).map((i) => i.title),
    }));
}

/** Pesan error sign out — satu tempat supaya server & uji memakai kalimat sama. */
export function taskGateMessage(blocking: BlockingTask[]): string {
  const names = blocking.map((b) => `"${b.title}"`).join(", ");
  return `Selesaikan dan kirim tugas ${names} dulu sebelum sign out, atau pilih "Selesaikan besok" dengan alasan.`;
}
