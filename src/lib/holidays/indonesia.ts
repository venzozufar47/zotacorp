/**
 * Hari libur NASIONAL (tanggal merah) Indonesia menurut SKB 3 Menteri. Cuti bersama SENGAJA tidak dimasukkan: itu bukan
 * tanggal merah (bagi swasta fakultatif). Perubahan data harus mengikuti SKB baru dan lolos `indonesia.test.ts`.
 * Modul murni (tanpa DB) agar bisa dipakai di perhitungan hari kerja scorecard dan diuji langsung.
 */

export interface NationalHoliday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

export interface HolidaySource {
  year: number;
  /** Nomor SKB (Menag, Menaker, MenPANRB). */
  skb: string;
  /** Tanggal penetapan. */
  signed: string;
  /** Jumlah HARI libur nasional menurut pengumuman resmi (bukan jumlah baris: Idulfitri dua hari). */
  expectedDays: number;
  url: string;
}

export const HOLIDAY_SOURCES: HolidaySource[] = [
  {
    year: 2026,
    skb: "SKB No. 1497 Tahun 2025, No. 2 Tahun 2025, dan No. 5 Tahun 2025",
    signed: "2025-09-19",
    expectedDays: 17,
    url: "https://www.setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026",
  },
  {
    year: 2027,
    skb: "SKB No. 1205 Tahun 2026, No. 3 Tahun 2026, dan No. 2 Tahun 2026",
    signed: "2026-09-15",
    expectedDays: 18,
    url: "https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027",
  },
];

export const NATIONAL_HOLIDAYS: NationalHoliday[] = [
  // 2026
  { date: "2026-01-01", name: "Tahun Baru Masehi" },
  { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad saw." },
  { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili" },
  { date: "2026-03-19", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
  { date: "2026-03-21", name: "Idulfitri 1447 H" },
  { date: "2026-03-22", name: "Idulfitri 1447 H" },
  { date: "2026-04-03", name: "Wafat Yesus Kristus" },
  { date: "2026-04-05", name: "Kebangkitan Yesus Kristus (Paskah)" },
  { date: "2026-05-01", name: "Hari Buruh Internasional" },
  { date: "2026-05-14", name: "Kenaikan Yesus Kristus" },
  { date: "2026-05-27", name: "Iduladha 1447 H" },
  { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE" },
  { date: "2026-06-01", name: "Hari Lahir Pancasila" },
  { date: "2026-06-16", name: "Tahun Baru Islam 1448 H" },
  { date: "2026-08-17", name: "Proklamasi Kemerdekaan" },
  { date: "2026-08-25", name: "Maulid Nabi Muhammad saw." },
  { date: "2026-12-25", name: "Kelahiran Yesus Kristus" },
  // 2027
  { date: "2027-01-01", name: "Tahun Baru Masehi" },
  { date: "2027-01-05", name: "Isra Mikraj Nabi Muhammad saw." },
  { date: "2027-02-06", name: "Tahun Baru Imlek 2578 Kongzili" },
  { date: "2027-03-08", name: "Hari Suci Nyepi (Tahun Baru Saka 1949)" },
  { date: "2027-03-10", name: "Idulfitri 1448 H" },
  { date: "2027-03-11", name: "Idulfitri 1448 H" },
  { date: "2027-03-26", name: "Wafat Yesus Kristus" },
  { date: "2027-03-28", name: "Kebangkitan Yesus Kristus (Paskah)" },
  { date: "2027-05-01", name: "Hari Buruh Internasional" },
  { date: "2027-05-06", name: "Kenaikan Yesus Kristus" },
  { date: "2027-05-17", name: "Iduladha 1448 H" },
  { date: "2027-05-20", name: "Hari Raya Waisak 2571 BE" },
  { date: "2027-06-01", name: "Hari Lahir Pancasila" },
  { date: "2027-06-06", name: "Tahun Baru Islam 1449 H" },
  { date: "2027-08-15", name: "Maulid Nabi Muhammad saw." },
  { date: "2027-08-17", name: "Proklamasi Kemerdekaan" },
  { date: "2027-12-25", name: "Kelahiran Yesus Kristus" },
  { date: "2027-12-26", name: "Isra Mikraj Nabi Muhammad saw." },
];

const HOLIDAY_DATES = new Set(NATIONAL_HOLIDAYS.map((h) => h.date));

/** Apakah tanggal "YYYY-MM-DD" tanggal merah nasional (bukan cuti bersama). */
export function isNationalHoliday(dateIso: string): boolean {
  return HOLIDAY_DATES.has(dateIso);
}

export function holidaysOfYear(year: number): NationalHoliday[] {
  return NATIONAL_HOLIDAYS.filter((h) => h.date.startsWith(`${year}-`));
}
