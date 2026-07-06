/**
 * Karakteristik umum 4 dimensi DISC + tips komunikasi — digitisasi &
 * terjemahan Indonesia dari workbook internal (halaman General
 * Characteristics + Keys to Adapting Communication) untuk halaman
 * insight karyawan/admin.
 */

import type { DiscFactor } from "./questions";

export interface DiscDimensionInfo {
  factor: DiscFactor;
  nama: string;
  /** Apa yang diukur dimensi ini (dari teori Marston). */
  mengukur: string;
  emosi: string;
  deskriptor: string[];
  nilaiTim: string[];
  lingkunganIdeal: string[];
  saatTertekan: string[];
  keterbatasan: string[];
  /** Tips berkomunikasi DENGAN orang yang tinggi di dimensi ini. */
  tipsKomunikasi: string[];
}

export const DISC_DIMENSIONS: Record<DiscFactor, DiscDimensionInfo> = {
  D: {
    factor: "D",
    nama: "Dominance",
    mengukur: "Cara kamu merespons masalah dan tantangan.",
    emosi: "Kemarahan",
    deskriptor: [
      "Suka tantangan", "Kompetitif", "Berani", "Tegas", "Langsung",
      "Inovatif", "Persisten", "Pemecah masalah", "Berorientasi hasil", "Self-starter",
    ],
    nilaiTim: [
      "Pengorganisir yang fokus pada hasil akhir",
      "Berpandangan ke depan",
      "Berorientasi tantangan",
      "Menginisiasi aktivitas",
      "Inovatif",
    ],
    lingkunganIdeal: [
      "Bebas dari kontrol, supervisi, dan detail",
      "Lingkungan yang inovatif dan berorientasi masa depan",
      "Forum untuk menyampaikan ide dan pandangan",
      "Pekerjaan non-rutin dengan tantangan dan peluang",
    ],
    saatTertekan: ["Menuntut", "Nekat", "Agresif", "Egois"],
    keterbatasan: [
      "Melampaui wewenang",
      "Menetapkan standar terlalu tinggi",
      "Kurang bijak dan diplomatis",
      "Mengambil terlalu banyak, terlalu cepat",
    ],
    tipsKomunikasi: [
      "Jelas, spesifik, dan langsung ke inti — jangan bertele-tele",
      "Fokus ke urusan; datang dengan persiapan dan materi yang rapi",
      "Sajikan fakta secara logis; ajukan pertanyaan spesifik (\"apa\")",
      "Beri alternatif dan pilihan untuk ia putuskan sendiri",
      "Beri fakta soal peluang keberhasilan; jangan berspekulasi berlebihan",
      "Kalau tidak setuju, debat faktanya — jangan dibawa personal",
      "Sediakan situasi menang-menang",
    ],
  },
  I: {
    factor: "I",
    nama: "Influence",
    mengukur: "Cara kamu mempengaruhi orang lain terhadap sudut pandangmu.",
    emosi: "Optimisme",
    deskriptor: [
      "Memikat", "Percaya diri", "Meyakinkan", "Antusias", "Menginspirasi",
      "Optimis", "Persuasif", "Populer", "Mudah bergaul", "Mudah percaya",
    ],
    nilaiTim: [
      "Optimisme dan antusiasme",
      "Pemecahan masalah yang kreatif",
      "Memotivasi orang menuju tujuan",
      "Pemain tim",
      "Menegosiasikan konflik",
    ],
    lingkunganIdeal: [
      "Kontak dengan banyak orang",
      "Bebas dari kontrol dan detail",
      "Kebebasan bergerak",
      "Forum agar idenya didengar",
      "Atasan demokratis yang bisa diajak berteman",
    ],
    saatTertekan: ["Mempromosikan diri", "Terlalu optimis", "Banyak bicara", "Tidak realistis"],
    keterbatasan: [
      "Kurang perhatian pada detail",
      "Tidak realistis menilai orang",
      "Mudah percaya pada siapa saja",
      "Mendengar hanya saat situasi cocok",
    ],
    tipsKomunikasi: [
      "Rencanakan interaksi yang mendukung mimpi dan niatnya",
      "Sediakan waktu untuk relasi dan bersosialisasi",
      "Bicarakan tujuan mereka; jangan melulu fakta dan angka",
      "Fokus ke orang dan action item; tuliskan detailnya",
      "Minta pendapatnya; jangan impersonal atau kaku tugas",
      "Beri ide untuk mengeksekusi tindakan",
      "Gunakan waktu yang stimulatif, menyenangkan, dan cepat",
      "Beri apresiasi/insentif atas keberaniannya mengambil risiko",
    ],
  },
  S: {
    factor: "S",
    nama: "Steadiness",
    mengukur: "Cara kamu merespons ritme lingkungan sekitar.",
    emosi: "Non-emosional (tenang)",
    deskriptor: [
      "Ramah", "Bersahabat", "Pendengar yang baik", "Sabar", "Santai",
      "Tulus", "Stabil", "Konsisten", "Pemain tim", "Pengertian",
    ],
    nilaiTim: [
      "Pemain tim yang dapat diandalkan",
      "Bekerja untuk pemimpin dan tujuan bersama",
      "Sabar dan berempati",
      "Berpikir logis langkah demi langkah",
      "Berorientasi pelayanan",
    ],
    lingkunganIdeal: [
      "Lingkungan yang stabil dan bisa diprediksi",
      "Diberi waktu untuk berubah",
      "Hubungan kerja jangka panjang",
      "Sedikit konflik antar orang",
      "Bebas dari aturan yang mengekang",
    ],
    saatTertekan: ["Tidak menunjukkan reaksi", "Terkesan cuek", "Ragu-ragu", "Kaku"],
    keterbatasan: [
      "Mengalah demi menghindari kontroversi",
      "Kesulitan menentukan prioritas",
      "Tidak suka perubahan tanpa alasan",
      "Kesulitan menghadapi situasi yang terlalu beragam",
    ],
    tipsKomunikasi: [
      "Buka dengan obrolan personal — cairkan suasana dulu",
      "Tunjukkan ketertarikan tulus pada dirinya sebagai pribadi",
      "Gali tujuan pribadinya dengan sabar; dengarkan dan responsif",
      "Sajikan maksudmu dengan lembut, logis, tidak mengancam",
      "Ajukan pertanyaan spesifik (\"bagaimana\"); jangan menyela",
      "Jangan paksa respons cepat — beri waktu berpikir",
      "Beri jaminan personal; jangan janji yang tak bisa ditepati",
    ],
  },
  C: {
    factor: "C",
    nama: "Compliance",
    mengukur: "Cara kamu merespons aturan dan prosedur yang dibuat pihak lain.",
    emosi: "Kehati-hatian (takut salah)",
    deskriptor: [
      "Akurat", "Analitis", "Bersungguh-sungguh", "Sopan", "Diplomatis",
      "Pencari fakta", "Standar tinggi", "Dewasa", "Sabar", "Presisi",
    ],
    nilaiTim: [
      "Menjaga standar tinggi",
      "Teliti dan konsisten",
      "Mendefinisikan, memperjelas, mengumpulkan informasi, dan menguji",
      "Objektif — \"jangkar realitas\"",
      "Pemecah masalah yang menyeluruh",
    ],
    lingkunganIdeal: [
      "Tempat yang membutuhkan pemikiran kritis",
      "Pekerjaan teknis atau area spesialisasi",
      "Hubungan dekat dengan kelompok kecil",
      "Lingkungan kerja yang familiar",
      "Ruang kerja pribadi",
    ],
    saatTertekan: ["Pesimis", "Pemilih", "Rewel", "Terlalu kritis"],
    keterbatasan: [
      "Defensif saat dikritik",
      "Terjebak dalam detail",
      "Terlalu intens untuk situasi yang ada",
      "Terkesan dingin dan berjarak",
    ],
    tipsKomunikasi: [
      "Siapkan argumen sejak awal — jangan berantakan",
      "Dekati secara langsung dan lugas, jangan terlalu santai/personal",
      "Bangun kredibilitas dengan melihat isu dari semua sisi",
      "Tepati apa yang kamu ucapkan; jangan janji berlebihan",
      "Buat rencana aksi dengan jadwal dan milestone",
      "Sabar tapi persisten; jangan mendesak keputusan cepat",
      "Kalau tidak setuju, buktikan dengan data dan fakta — bukan opini",
      "Beri ruang dan waktu untuk ia mengambil keputusan",
    ],
  },
};

export const DISC_FACTOR_ORDER: DiscFactor[] = ["D", "I", "S", "C"];

export const DISC_FACTOR_COLOR: Record<DiscFactor, string> = {
  D: "#e11d48", // rose-600 — tegas/hasil
  I: "#f59e0b", // amber-500 — hangat/sosial
  S: "#10b981", // emerald-500 — stabil
  C: "#3b82f6", // blue-500 — presisi
};
