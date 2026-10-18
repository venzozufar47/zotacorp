/**
 * Dipisah dari `pulse-survey.actions.ts` karena file `"use server"` hanya
 * boleh mengekspor async function — sama alasan dengan modul PRD lain
 * sesi ini.
 */
export const MONTHLY_QUESTIONS = [
  "Saya berani menyampaikan masalah tanpa takut",
  "Saya tahu apa yang diharapkan dari saya minggu ini",
  "Beban kerja shift saya wajar",
] as const;

export const QUARTERLY_QUESTIONS: { text: string; reverse: boolean }[] = [
  { text: "Kesalahan yang saya buat di tim ini sering diingat-ingat untuk menyudutkan saya", reverse: true },
  { text: "Anggota tim ini bisa mengangkat masalah dan isu sulit", reverse: false },
  { text: "Di tim ini, orang kadang menolak rekan yang dianggap berbeda", reverse: true },
  { text: "Aman untuk mengambil risiko di tim ini", reverse: false },
  { text: "Sulit untuk meminta bantuan anggota tim lain di sini", reverse: true },
  { text: "Tidak ada anggota tim ini yang akan sengaja bertindak merugikan usaha saya", reverse: false },
  { text: "Bekerja dengan tim ini, kemampuan unik saya dihargai dan dimanfaatkan", reverse: false },
];
