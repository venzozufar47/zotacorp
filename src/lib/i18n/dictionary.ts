/**
 * Translation dictionary. Keys are dot-free nested objects; add new
 * namespaces as separate top-level keys. Both languages must have the
 * same shape — TS enforces this via the `Dictionary` type.
 */
export const dictionary = {
  en: {
    nav: {
      home: "Home",
      attendance: "Attendance",
      payslips: "Payslips",
      profile: "Profile",
      settings: "Settings",
      signOut: "Sign out",
    },
    settings: {
      title: "Settings",
      subtitle: "Customize your experience",
      language: "Language",
      languageDescription: "Choose your preferred language for the app interface.",
      indonesian: "Indonesia",
      english: "English",
      saved: "Language preference saved",
    },
    payslipBreakdown: {
      overtimeTitle: "Overtime days",
      lateTitle: "Late days",
      noOvertime: "No approved overtime this month.",
      noLate: "No late days this month.",
      colDate: "Date",
      colDuration: "Duration",
      colPay: "Pay",
      colLate: "Late",
      colAfterGrace: "After grace",
      colPenalty: "Penalty",
      excused: "Excused",
      totals: "Total",
      graceExplainer: "Each late day's first {min} min is absorbed by the grace period and not penalized.",
      perDayExplainer: "Penalty applied as a flat amount for each unexcused late day.",
      perMinutesExplainer: "Per-day amounts are allocated proportionally from the monthly penalty so the total matches exactly.",
    },
  },
  id: {
    nav: {
      home: "Beranda",
      attendance: "Kehadiran",
      payslips: "Slip Gaji",
      profile: "Profil",
      settings: "Pengaturan",
      signOut: "Keluar",
    },
    settings: {
      title: "Pengaturan",
      subtitle: "Sesuaikan pengalaman Anda",
      language: "Bahasa",
      languageDescription: "Pilih bahasa yang Anda inginkan untuk tampilan aplikasi.",
      indonesian: "Indonesia",
      english: "English",
      saved: "Preferensi bahasa disimpan",
    },
    payslipBreakdown: {
      overtimeTitle: "Hari lembur",
      lateTitle: "Hari terlambat",
      noOvertime: "Tidak ada lembur yang disetujui bulan ini.",
      noLate: "Tidak ada keterlambatan bulan ini.",
      colDate: "Tanggal",
      colDuration: "Durasi",
      colPay: "Bayaran",
      colLate: "Terlambat",
      colAfterGrace: "Setelah toleransi",
      colPenalty: "Denda",
      excused: "Dimaafkan",
      totals: "Total",
      graceExplainer: "Setiap hari terlambat, {min} menit pertama masuk masa toleransi dan tidak didenda.",
      perDayExplainer: "Denda diterapkan sebagai jumlah tetap untuk setiap hari terlambat yang tidak dimaafkan.",
      perMinutesExplainer: "Jumlah harian dialokasikan proporsional dari denda bulanan agar totalnya pas.",
    },
  },
} as const;

export type Language = keyof typeof dictionary;
export type Dictionary = (typeof dictionary)[Language];
