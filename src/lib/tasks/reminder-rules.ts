/**
 * Aturan murni pengingat tugas (tanpa I/O).
 *
 * Target: push tiap 2 jam selama karyawan sign in. Cron berjalan tiap jam
 * dengan jitter ±1–2 menit; kalau ambangnya persis 120 menit, pengingat yang
 * "jatuh tempo" 119 menit 50 detik akan menunggu satu jam penuh lagi.
 * 110 menit menjaga jarak nyata tetap 2 jam (jam berikutnya) tanpa melewatkan.
 */
export const REMINDER_GAP_MINUTES = 110;

/** Batas "masih sign in": log lebih tua dari ini dianggap lupa sign out, bukan sedang bekerja. */
export const REMINDER_MAX_SHIFT_HOURS = 16;

export function reminderCutoff(now: Date): Date {
  return new Date(now.getTime() - REMINDER_GAP_MINUTES * 60 * 1000);
}

/** Apakah pengingat berikutnya sudah jatuh tempo? `null` = belum pernah diingatkan. */
export function isReminderDue(lastRemindedAt: string | null, now: Date): boolean {
  if (!lastRemindedAt) return true;
  return new Date(lastRemindedAt).getTime() <= reminderCutoff(now).getTime();
}

export function reminderText(titles: string[]): { title: string; body: string } {
  if (titles.length === 1) {
    return {
      title: "Tugasmu belum selesai ⏰",
      body: `"${titles[0]}" belum dikirim. Selesaikan sebelum sign out.`,
    };
  }
  return {
    title: "Ada tugas yang belum selesai ⏰",
    body: `${titles.length} tugas belum dikirim. Selesaikan sebelum sign out.`,
  };
}
