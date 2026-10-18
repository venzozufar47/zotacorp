/**
 * Saklar kartu fitur baru di BERANDA karyawan (/dashboard). Semua dimatikan dulu: fitur dirilis satu per satu
 * setelah ditinjau — ubah `false` → `true` untuk menampilkan kartunya.
 *
 * Yang diatur di sini HANYA kartu/tautan di beranda. Halaman fiturnya sendiri tetap ada dan bisa dibuka lewat
 * URL (dan sisi admin tidak terpengaruh). Saat mati, query datanya untuk beranda juga dilewati.
 */
export const EMPLOYEE_HOME_FEATURES = {
  /** DIRILIS. Tombol "Ajukan izin" (pop-up) di bawah tombol absen untuk semua karyawan + banner "N pengajuan
   *  izin menunggu persetujuanmu" untuk atasan langsung → halaman Tim. */
  izin: true,
  /** Notulen briefing kilat & rapat → /notulen */
  notulen: false,
  /** Scorecard cabang → /scorecard */
  scorecard: false,
  /** Survei bulanan anonim → /survei */
  survei: false,
  /** Banner "N SOP belum kamu akui" → /pengakuan-sop */
  pengakuanSop: false,
  /** Kanal pengaduan HR → /pengaduan */
  pengaduan: false,
  /** Persetujuan ke Owner → /persetujuan */
  persetujuan: false,
  /** Bonus tim → /bonus */
  bonus: false,
  /** Riset produk → /riset-produk */
  risetProduk: false,
  /** Keluhan & insiden pelanggan → /keluhan */
  keluhan: false,
} as const;
