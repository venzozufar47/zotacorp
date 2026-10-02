/**
 * Aturan "konfirmasi slip dikunci kalau ada hari lupa check-out", dipakai
 * sama persis oleh UI karyawan dan `submitPayslipResponse` (server) supaya
 * keduanya tidak bisa berbeda pendapat.
 *
 * Hanya basis gaji yang memakai kehadiran yang terpengaruh — pada basis
 * flat/deliverables hari tanpa check-out tidak mengubah nominal, jadi
 * mengunci konfirmasinya hanya menyandera slip yang sudah benar.
 * Basis tak dikenal dianggap terpengaruh (arah aman: lebih baik karyawan
 * diberi tahu daripada diam).
 */
const ATTENDANCE_BASES = new Set(["presence", "daily", "both"]);

export function attendanceAffectsPay(
  basis: string | null | undefined
): boolean {
  return !basis || ATTENDANCE_BASES.has(basis);
}

/** "2026-09-15" → "15 Sep". Tanggal-saja, diurai manual (hindari geser UTC). */
export function shortDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}
