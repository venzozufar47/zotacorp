/**
 * Alasan sebuah selfie "tidak diperiksa AI" (verdict `unchecked`), disimpan di `attendance_logs.selfie_ai_note`:
 *  - cap   : batas pemeriksaan harian tercapai (foto setelah batas diterima tanpa AI)
 *  - error : AI gagal atau lambat (foto gagal diunduh / layanan AI error)
 * Absen lama tanpa kode dianggap "tidak diketahui". Admin memakai ini untuk mengevaluasi: banyak "cap" berarti karyawan
 * terus ditolak sampai jatah habis, banyak "error" berarti layanan AI bermasalah.
 */
export type UncheckedReason = "cap" | "error" | "unknown";

export function uncheckedReason(note: string | null | undefined): UncheckedReason {
  return note === "cap" || note === "error" ? note : "unknown";
}

export const UNCHECKED_LABEL: Record<UncheckedReason, string> = {
  cap: "Batas harian",
  error: "AI gagal",
  unknown: "AI tidak sempat",
};

export const UNCHECKED_EXPLAIN: Record<UncheckedReason, string> = {
  cap: "Batas pemeriksaan AI harian sudah tercapai (foto sebelumnya ditolak berulang), jadi foto ini diterima tanpa pemeriksaan.",
  error: "AI gagal atau terlalu lambat memeriksa foto ini; absen lolos tanpa pemeriksaan.",
  unknown: "AI tidak sempat memeriksa foto ini; absen lolos tanpa pemeriksaan.",
};
