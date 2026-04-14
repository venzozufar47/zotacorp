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
  },
} as const;

export type Language = keyof typeof dictionary;
export type Dictionary = (typeof dictionary)[Language];
