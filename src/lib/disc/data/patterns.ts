/**
 * Library pattern DISC — 24 pattern bernomor, digitisasi & terjemahan
 * Indonesia dari workbook "Personal Insights Profile" (halaman pattern
 * High C/D/S/I) untuk pemakaian internal Zota Corp. Terjemahan pattern
 * #27 & #47 mengikuti persis frasa Indonesia pada laporan hasil Frexor
 * yang sudah dimiliki perusahaan, sisanya diterjemahkan dengan register
 * yang sama.
 *
 * `ref` = bentuk grafik referensi (nilai plot D,I,S,C 0–100) hasil
 * pembacaan grafik mini halaman identifikasi pattern; dipakai matcher
 * `scoring.ts` untuk mencari "grafik yang paling mirip" secara
 * deterministik (kelompok huruf tertinggi dulu, lalu jarak terdekat).
 */

import type { DiscFactor } from "./questions";

export interface DiscTendencies {
  tujuan: string;
  menilaiOrang: string;
  mempengaruhi: string;
  nilaiOrganisasi: string;
  berlebihan: string;
  tekanan: string;
  ketakutan: string;
}

export interface DiscPattern {
  num: number;
  /** Nama pattern (tetap Inggris, sesuai laporan Frexor: Conductor, Promoter, dst). */
  name: string;
  /** Faktor tertinggi ("kelompok" pattern di workbook). */
  high: DiscFactor;
  /** Bentuk grafik referensi [D, I, S, C] 0–100. */
  ref: [number, number, number, number];
  kekuatan: string[];
  perbaikan: string[];
  kecenderungan: DiscTendencies;
}

export const DISC_PATTERNS: DiscPattern[] = [
  // ─── Kelompok C Tinggi ────────────────────────────────────────────────
  {
    num: 7,
    name: "Analyzer",
    high: "C",
    ref: [38, 38, 22, 88],
    kekuatan: [
      "Mampu menyelesaikan tugas sulit dengan benar sejak percobaan pertama",
      "Peka dan waspada terhadap kesalahan ketika presisi dan akurasi dibutuhkan",
      "Profesional dan disiplin dalam bidang keahliannya",
      "Terampil mengorganisir dan bijak memakai waktu",
    ],
    perbaikan: [
      "Mengurangi sikap perfeksionis",
      "Tidak selalu bekerja \"sesuai buku\"",
      "Lebih antusias dan tidak terlalu bergantung pada data",
    ],
    kecenderungan: {
      tujuan: "Akurasi dan kualitas",
      menilaiOrang: "Hasil yang benar, bukti dan fakta yang disajikan",
      mempengaruhi: "Penggunaan data dan ketepatan",
      nilaiOrganisasi: "Standar tinggi untuk diri sendiri dan bawahan, sangat disiplin",
      berlebihan: "Aturan dan regulasi",
      tekanan: "Menjadi terlalu kritis pada diri sendiri dan orang lain",
      ketakutan: "Keputusan berisiko tinggi",
    },
  },
  {
    num: 21,
    name: "Coordinator",
    high: "C",
    ref: [20, 20, 75, 88],
    kekuatan: [
      "Mampu menetapkan dan mencapai standar kerja serta perilaku yang tinggi",
      "Peka terhadap masalah, aturan, kesalahan, dan prosedur",
      "Mampu mengambil keputusan sulit tanpa terbawa emosi",
      "Memahami dan menjaga kebutuhan akan sistem yang berkualitas",
    ],
    perbaikan: [
      "Menyampaikan perasaan yang sebenarnya atas suatu isu",
      "Tidak terlalu khawatir perubahan akan merusak hubungan atau kualitas",
      "Lebih percaya diri dan saling bergantung dengan tim",
    ],
    kecenderungan: {
      tujuan: "Keamanan dan kerapian",
      menilaiOrang: "Standar yang presisi",
      mempengaruhi: "Dapat diandalkan, perhatian pada detail",
      nilaiOrganisasi: "Kesungguhan hati, menjaga standar",
      berlebihan: "Ketergantungan pada prosedur baku",
      tekanan: "Menjadi tertutup dan keras kepala",
      ketakutan: "Pertentangan",
    },
  },
  {
    num: 24,
    name: "Implementor",
    high: "C",
    ref: [68, 22, 22, 82],
    kekuatan: [
      "Mampu menghasilkan kerja berkualitas sambil mencari cara baru menambah kuantitas",
      "Mampu mengambil keputusan sulit memakai insight dan fakta tanpa terbawa emosi",
      "Mampu mendorong keras untuk menemukan solusi yang tepat dan dapat diterima",
      "Menantang tim menuju standar performa yang lebih tinggi",
    ],
    perbaikan: [
      "Lebih peka terhadap perasaan orang lain",
      "Tidak terlalu blak-blakan dan langsung",
      "Menunjukkan ketulusan yang lebih besar",
    ],
    kecenderungan: {
      tujuan: "Merancang sistem",
      menilaiOrang: "Standar tinggi milik mereka sendiri",
      mempengaruhi: "Menetapkan kecepatan dalam mengembangkan sistem",
      nilaiOrganisasi: "Pekerja yang presisi dan bersungguh-sungguh",
      berlebihan: "Fakta dan angka",
      tekanan: "Mengambil terlalu banyak beban",
      ketakutan: "Kekacauan dan ketidakteraturan",
    },
  },
  {
    num: 60,
    name: "Analyzer",
    high: "C",
    ref: [12, 65, 12, 80],
    kekuatan: [
      "Pendorong sistem yang berkualitas",
      "Rasa urgensi yang baik, seimbang dengan menjaga standar tinggi",
      "Terorganisir bahkan dalam hubungan; menghargai kolega yang punya ide serupa dan sadar kualitas",
      "Peka terhadap perubahan di lingkungan sosial dan pekerjaan",
    ],
    perbaikan: [
      "Lebih menerima ide dan keyakinan orang lain",
      "Menetapkan tujuan yang realistis",
      "Tidak terlalu sensitif terhadap komentar orang lain",
    ],
    kecenderungan: {
      tujuan: "Diplomatis",
      menilaiOrang: "Siapa yang mereka kenal, prestise dan pencapaian",
      mempengaruhi: "Strategi dalam hubungan baik",
      nilaiOrganisasi: "Menciptakan lingkungan kerja yang baik",
      berlebihan: "Kebijaksanaan bersikap",
      tekanan: "Menjadi terlalu halus",
      ketakutan: "Harus menukar kualitas demi hubungan baik",
    },
  },
  {
    num: 55,
    name: "Analyzer",
    high: "C",
    ref: [58, 68, 10, 82],
    kekuatan: [
      "Mampu menyelesaikan banyak proyek dengan standar tinggi",
      "Mampu mempertahankan pendapat yang diyakini kuat pada isu tertentu",
      "Mampu mencapai hasil melalui orang lain",
      "Menjaga standar dengan mengikuti prosedur yang sudah terbukti",
    ],
    perbaikan: [
      "Tidak terlalu mengontrol situasi",
      "Realistis saat menilai orang",
      "Lebih adaptif saat berada di bawah tekanan",
    ],
    kecenderungan: {
      tujuan: "Banyak tantangan",
      menilaiOrang: "Keterampilan dan komitmen mereka",
      mempengaruhi: "Sikap optimis",
      nilaiOrganisasi: "Kombinasi keterampilan tugas dan keterampilan orang",
      berlebihan: "Prosedur baku",
      tekanan: "Menjadi mengontrol",
      ketakutan: "Melewatkan tenggat waktu",
    },
  },
  {
    num: 38,
    name: "Analyzer",
    high: "C",
    ref: [55, 35, 62, 82],
    kekuatan: [
      "Mampu berjuang keras demi hasil dan/atau prosedur untuk memastikan kualitas dan kebenaran",
      "Mampu mengajukan pertanyaan yang tepat untuk mengungkap fakta tersembunyi",
      "Menghindari favoritisme saat menilai personel",
      "Menggabungkan kemampuan analitis dan intuitif saat menghadapi isu kompleks",
    ],
    perbaikan: [
      "Tidak terlalu analitis dalam mengejar kebenaran",
      "Tidak menyembunyikan emosi; lebih banyak menyampaikan pikiran ke orang lain",
      "Berbagi informasi dan kerja sama tim",
    ],
    kecenderungan: {
      tujuan: "Pemecah masalah",
      menilaiOrang: "Cara mereka menggunakan data",
      mempengaruhi: "Fakta dan angka",
      nilaiOrganisasi: "Mandiri menerima tugas analitis yang menantang",
      berlebihan: "Perfeksionisme",
      tekanan: "Menjadi blak-blakan",
      ketakutan: "Kontak orang banyak, risiko tinggi, dan kurangnya privasi",
    },
  },

  // ─── Kelompok D Tinggi ────────────────────────────────────────────────
  {
    num: 1,
    name: "Conductor",
    high: "D",
    ref: [88, 40, 28, 42],
    kekuatan: [
      "Mampu menangani masalah sulit yang melibatkan banyak isu",
      "Berpandangan ke depan, agresif, dan kompetitif",
      "Mampu bekerja di lingkungan yang penuh variasi dan perubahan",
      "Menginisiasi aktivitas dan menetapkan kecepatan untuk mencapai hasil",
    ],
    perbaikan: [
      "Tidak terlalu intens, keras pendapat, dan blak-blakan",
      "Tidak memaksa orang lain yang komitmennya berbeda pada sebuah proyek",
      "Kesabaran, kepedulian pada orang, dan kerendahan hati",
    ],
    kecenderungan: {
      tujuan: "Dominasi dan kemandirian",
      menilaiOrang: "Kemampuan menyelesaikan tugas dengan cepat",
      mempengaruhi: "Kekuatan karakter, kegigihan",
      nilaiOrganisasi: "Sikap \"buktikan pada mereka\"",
      berlebihan: "Tantangan dan kompetisi",
      tekanan: "Menjadi pendiam dan analitis",
      ketakutan: "Kehilangan kendali",
    },
  },
  {
    num: 12,
    name: "Persuader",
    high: "D",
    ref: [90, 78, 25, 25],
    kekuatan: [
      "Berorientasi hasil dengan rasa urgensi untuk mencapai tujuan dan tenggat",
      "Tegas dan agresif saat menghadapi tantangan",
      "Menginisiasi aktivitas melalui orang lain untuk mencapai hasil",
      "Ekstrovert dan aktif membangun relasi dengan beragam orang",
    ],
    perbaikan: [
      "Tidak mudah kesal bila tenggat mundur atau terlewat",
      "Tidak mengambil terlalu banyak tanggung jawab sekaligus; lebih konsisten",
      "Lebih banyak follow-through, keterusterangan, dan ekspektasi yang realistis",
    ],
    kecenderungan: {
      tujuan: "Agresif dan percaya diri untuk menang",
      menilaiOrang: "Kemampuan berkomunikasi dan berpikir",
      mempengaruhi: "Keramahan dan hasrat akan hasil",
      nilaiOrganisasi: "Perencana yang baik, pemecah masalah, dan banyak akal",
      berlebihan: "Posisi dan cara mereka sendiri",
      tekanan: "Menjadi gelisah, tidak sabar, dan kurang peka",
      ketakutan: "Kalah dan gagal",
    },
  },
  {
    num: 9,
    name: "Implementor",
    high: "D",
    ref: [88, 25, 28, 62],
    kekuatan: [
      "Menetapkan standar tinggi untuk diri sendiri dan orang lain, menuntut performa dan kerja tim",
      "Sadar dan peka terhadap biaya dari kesalahan",
      "Terstruktur dalam penggunaan waktu",
      "Memecahkan masalah secara sistematis tanpa membiarkan emosi mempengaruhi keputusan",
    ],
    perbaikan: [
      "Lebih hangat dan menunjukkan apresiasi pada anggota tim lain",
      "Lebih konsisten dengan keputusan — isu kuantitas vs kualitas",
      "Tidak terlalu blak-blakan dan kritis pada orang yang tidak memenuhi standar",
    ],
    kecenderungan: {
      tujuan: "Dominasi dan menjadi perintis",
      menilaiOrang: "Standar mereka sendiri, ide-ide progresif",
      mempengaruhi: "Kompetisi dan tantangan yang unik",
      nilaiOrganisasi: "Menginisiasi perubahan secara mandiri",
      berlebihan: "Keterusterangan, terlalu kritis",
      tekanan: "Mendorong dan menuntut",
      ketakutan: "Tidak menjadi berpengaruh",
    },
  },
  {
    num: 57,
    name: "Conductor",
    high: "D",
    ref: [82, 15, 62, 15],
    kekuatan: [
      "Mampu memunculkan ide baru dan mengawalnya sampai selesai",
      "Menghargai orang lain yang merupakan pemain tim",
      "Mampu melihat \"gambaran besar\" sekaligus detail kecil",
      "Tekad dan kegigihan",
    ],
    perbaikan: [
      "Tidak terlalu terpaku pada satu isu hingga melewatkan peluang lain",
      "Tidak terlalu terikat standar pribadi",
      "Memeriksa prioritas bersama orang lain",
    ],
    kecenderungan: {
      tujuan: "Penuh tekad",
      menilaiOrang: "Jumlah pekerjaan yang diselesaikan",
      mempengaruhi: "Keuletan dan kegigihan",
      nilaiOrganisasi: "Berorientasi hasil dengan konsistensi",
      berlebihan: "Mengandalkan diri sendiri",
      tekanan: "Keras kepala, pendiam, dan tidak menunjukkan reaksi",
      ketakutan: "Terlibat dengan terlalu banyak orang",
    },
  },
  {
    num: 27,
    name: "Conductor",
    high: "D",
    ref: [82, 58, 25, 58],
    kekuatan: [
      "Mencapai hasil melalui orang",
      "Menghadapi hambatan dan tantangan dengan optimis",
      "Tujuan pribadi yang tinggi",
      "Rasa urgensi untuk membuat sesuatu terjadi",
    ],
    perbaikan: [
      "Menjadi lebih berhati-hati dengan detail",
      "Mengurangi kecepatan ketika mendelegasikan seluruh proyek",
      "Mengembangkan konsistensi ketika mendisiplinkan orang lain",
    ],
    kecenderungan: {
      tujuan: "Agresif bekerja melalui orang-orang untuk mencapai hasil",
      menilaiOrang: "Partisipasi dalam team",
      mempengaruhi: "Bujukan",
      nilaiOrganisasi: "Inovasi dan futuristik",
      berlebihan: "Kemauan yang kuat",
      tekanan: "Tidak sabar dan mengendalikan",
      ketakutan: "Tidak mencapai tujuan yang diinginkan",
    },
  },
  {
    num: 42,
    name: "Conductor",
    high: "D",
    ref: [80, 12, 60, 52],
    kekuatan: [
      "Mampu menyampaikan ide tanpa terikat secara emosional",
      "Konsentrasi penuh pada tujuan dan isu-isu penting",
      "Cermat mengamati pihak yang dapat mempengaruhi performa",
      "Mampu menjelaskan data teknis dengan jelas dan mengubah teori menjadi solusi yang bisa dijalankan",
    ],
    perbaikan: [
      "Berbagi pengetahuan, pikiran, dan emosi dengan orang lain",
      "Tidak ragu bertindak di bawah tekanan berat",
      "Mengembangkan keterampilan interpersonal dan verbalisasi",
    ],
    kecenderungan: {
      tujuan: "Mandiri dan berkecukupan",
      menilaiOrang: "Pemahaman dan daya nalar",
      mempengaruhi: "Cara yang rasional dan tidak langsung",
      nilaiOrganisasi: "Self-starter, berorientasi tujuan",
      berlebihan: "Mengandalkan diri sendiri",
      tekanan: "Ragu-ragu dan pesimis",
      ketakutan: "Tenggat tanpa waktu untuk memastikan kualitas",
    },
  },

  // ─── Kelompok S Tinggi ────────────────────────────────────────────────
  {
    num: 5,
    name: "Supporter",
    high: "S",
    ref: [30, 30, 85, 30],
    kekuatan: [
      "Mampu membawa diri dengan tenang dan terkontrol, memakai konsentrasi untuk mendengar dan belajar",
      "Mampu bertahan pada tugas yang memberi kontribusi bermakna bagi organisasi",
      "Anggota tim yang terbuka, sabar, dan toleran terhadap perbedaan",
      "Senang memberi pujian pada orang lain",
    ],
    perbaikan: [
      "Menunjukkan rasa urgensi saat dibutuhkan",
      "Tidak terlalu bergantung pada rutinitas",
      "Lebih banyak inisiatif dan adaptif terhadap perubahan",
    ],
    kecenderungan: {
      tujuan: "Dapat diandalkan dan stabilitas",
      menilaiOrang: "Konsistensi mereka",
      mempengaruhi: "Pembawaan yang ramah, melayani orang lain",
      nilaiOrganisasi: "Menstabilkan lingkungan dengan cara yang bersahabat",
      berlebihan: "Ketenangan diri",
      tekanan: "Tidak menunjukkan ekspresi",
      ketakutan: "Tidak dihargai, dan hal yang tidak diketahui",
    },
  },
  {
    num: 20,
    name: "Coordinator",
    high: "S",
    ref: [22, 22, 85, 68],
    kekuatan: [
      "Mampu memulai proyek dan mengawalnya sampai selesai",
      "Bersedia bekerja untuk seorang pemimpin dan sebuah tujuan",
      "Unggul mencari solusi masalah lewat logika yang menyeluruh dan menyenangkan semua pihak",
      "Menunjukkan kepemimpinan positif melalui perhatian pada perasaan anggota tim",
    ],
    perbaikan: [
      "Belajar mempromosikan diri",
      "Menggunakan pendekatan yang langsung",
      "Menunjukkan kepedulian dan perasaan",
    ],
    kecenderungan: {
      tujuan: "Mencapai standar tinggi yang ditetapkan untuk diri sendiri",
      menilaiOrang: "Penggunaan pengetahuan",
      mempengaruhi: "Kemampuan menuntaskan sesuatu",
      nilaiOrganisasi: "Menambah fokus dan logika pada kebutuhan yang ada",
      berlebihan: "Penolakan terhadap perubahan",
      tekanan: "Menjadi keras hati dan keras kepala",
      ketakutan: "Tidak memenuhi persyaratan yang spesifik",
    },
  },
  {
    num: 17,
    name: "Relater",
    high: "S",
    ref: [20, 78, 82, 20],
    kekuatan: [
      "Keterampilan mendengar yang baik disertai empati pada orang lain",
      "Terampil membantu dan mendukung orang lain mencapai tujuan dan aspirasi",
      "Berbakat menerima perasaan, keyakinan, dan nilai orang lain",
      "Mampu menciptakan lingkungan di mana orang merasa berarti",
    ],
    perbaikan: [
      "Bersikap asertif dan tegas dalam situasi tertentu",
      "Tidak selalu menerima status quo",
      "Lebih kuat, teguh, dan berani menegaskan diri",
    ],
    kecenderungan: {
      tujuan: "Penerimaan",
      menilaiOrang: "Loyalitas, ketulusan, dapat diandalkan",
      mempengaruhi: "Menawarkan pengertian dan persahabatan",
      nilaiOrganisasi: "Mendukung, mengharmoniskan, memberi stabilitas di bawah tekanan",
      berlebihan: "Kebaikan hati dan belas kasih",
      tekanan: "Menarik diri",
      ketakutan: "Perpecahan, konflik, tidak disukai",
    },
  },
  {
    num: 59,
    name: "Supporter",
    high: "S",
    ref: [68, 15, 80, 15],
    kekuatan: [
      "Mampu mengambil sebuah masalah dan mengawalnya hingga tuntas",
      "Persisten, bertekad kuat, ulet, dan logis dalam mengejar hasil",
      "Unggul menjaga hubungan baik di dalam maupun di luar pekerjaan",
      "Pemain tim yang menunjukkan kepemimpinan dan berani membela apa yang diyakini",
    ],
    perbaikan: [
      "Mengurangi perilaku pasif meski mempengaruhi rasa aman",
      "Menggunakan cara berpikir baru dan kreatif saat memecahkan masalah",
      "Tidak menolak situasi baru di luar zona nyaman",
    ],
    kecenderungan: {
      tujuan: "Pencapaian pribadi",
      menilaiOrang: "Pencapaian dan kesuksesan mereka",
      mempengaruhi: "Ketekunan",
      nilaiOrganisasi: "Bekerja mandiri dan menyukai tantangan",
      berlebihan: "Keterusterangan",
      tekanan: "Keras kepala, kaku, tanpa henti",
      ketakutan: "Tidak mencapai hasil yang diinginkan",
    },
  },
  {
    num: 35,
    name: "Supporter",
    high: "S",
    ref: [22, 55, 82, 62],
    kekuatan: [
      "Mampu bersikap suportif, ramah, dan optimis dalam hubungan apa pun",
      "Mudah bergaul dan mampu menikmati keunikan setiap manusia",
      "Mampu menggunakan penilaian yang seimbang, membawa stabilitas bagi seluruh tim",
      "Baik dalam menganalisis situasi yang bisa dirasakan, dilihat, didengar, atau dialami langsung",
    ],
    perbaikan: [
      "Tetap fokus pada peran dan ekspektasi agar efektif",
      "Memiliki rasa urgensi",
      "Menghargai cara-cara pintas yang tulus",
    ],
    kecenderungan: {
      tujuan: "Status quo",
      menilaiOrang: "Persahabatan",
      mempengaruhi: "Konsistensi performa, sikap akomodatif",
      nilaiOrganisasi: "Perencana, konsisten, menjaga ritme",
      berlebihan: "Kerendahan hati dan sikap konservatif",
      tekanan: "Menyimpan dendam",
      ketakutan: "Konflik, kehilangan muka",
    },
  },
  {
    num: 50,
    name: "Supporter",
    high: "S",
    ref: [65, 55, 72, 22],
    kekuatan: [
      "Mampu berempati pada perasaan orang lain sambil menjaga kemandirian",
      "Unggul pada proyek yang menuntut tekad dan kegigihan untuk menang",
      "Pengaruh positif bagi anggota tim yang tidak kooperatif atau negatif",
      "Baik dalam membawa orang ke meja negosiasi dan mendengarkan pandangan yang berlawanan",
    ],
    perbaikan: [
      "Memprioritaskan aktivitas harian",
      "Lebih banyak menimbang untung-rugi",
      "Lebih teguh dan konsisten dengan keyakinan sendiri",
    ],
    kecenderungan: {
      tujuan: "Sukses melalui konsistensi",
      menilaiOrang: "Persahabatan yang loyal",
      mempengaruhi: "Keterampilan persuasi antar orang",
      nilaiOrganisasi: "Memecahkan masalah secara kreatif dan berinovasi melalui orang",
      berlebihan: "Intensitas",
      tekanan: "Menggebu-gebu dan memaksa",
      ketakutan: "Tidak didukung tim, dan perubahan",
    },
  },

  // ─── Kelompok I Tinggi ────────────────────────────────────────────────
  {
    num: 3,
    name: "Promoter",
    high: "I",
    ref: [35, 85, 20, 30],
    kekuatan: [
      "Sangat optimis dengan selera humor yang positif",
      "Fokus pada orang dan kepercayaan tinggi dalam hubungan",
      "Cepat membangun pertemanan, senang membangun jejaring",
      "Menggunakan pendekatan konsensus dalam mengambil keputusan",
    ],
    perbaikan: [
      "Tetap memandang tujuan karier jangka panjang",
      "Tidak terlalu memikirkan perasaan orang lain",
      "Lebih terorganisir dan bersikap realistis",
    ],
    kecenderungan: {
      tujuan: "Membantu dan mengakomodasi",
      menilaiOrang: "Kehangatan mereka",
      mempengaruhi: "Keramahan dan keterampilan interpersonal",
      nilaiOrganisasi: "Mengkomunikasikan \"mimpi besar\", mampu menyatukan tim",
      berlebihan: "Ketergantungan pada orang lain dan optimisme",
      tekanan: "Emosional, terlalu percaya",
      ketakutan: "Tidak cukup disukai",
    },
  },
  {
    num: 13,
    name: "Persuader",
    high: "I",
    ref: [65, 88, 18, 20],
    kekuatan: [
      "Mampu mempengaruhi orang mengikuti cara berpikirnya",
      "Berkomunikasi dengan sangat terbuka",
      "Mampu meredakan situasi konflik",
      "Mampu mempromosikan ide dan produk baru",
    ],
    perbaikan: [
      "Mengambil keputusan dengan lebih sedikit emosi",
      "Bersedia berkonfrontasi bila diperlukan",
      "Menetapkan tenggat yang realistis dan mengelola waktu dengan baik",
    ],
    kecenderungan: {
      tujuan: "Menjaga pertemanan",
      menilaiOrang: "Kontak yang berpengaruh, komitmen",
      mempengaruhi: "Inspirasi dan karisma",
      nilaiOrganisasi: "Stabil, dapat diandalkan, jejaring pertemanan luas",
      berlebihan: "Antusiasme",
      tekanan: "Terlalu banyak bicara",
      ketakutan: "Kegagalan",
    },
  },
  {
    num: 16,
    name: "Relater",
    high: "I",
    ref: [22, 80, 76, 25],
    kekuatan: [
      "Mampu menolong orang lain dengan kehangatan, empati, dan pengertian",
      "Melindungi dan menghargai baik orang maupun hal-hal penting",
      "Pendengar sekaligus pembicara yang baik",
    ],
    perbaikan: [
      "Bersikap asertif dan tegas dalam situasi tertentu",
      "Tidak menghindari konfrontasi meski berisiko",
      "Lebih banyak inisiatif dan rasa urgensi",
    ],
    kecenderungan: {
      tujuan: "Menjaga pertemanan jangka panjang",
      menilaiOrang: "Loyalitas mereka pada hubungan",
      mempengaruhi: "Hubungan personal, memberi teladan yang baik",
      nilaiOrganisasi: "Pendengar yang baik, sabar terhadap orang lain",
      berlebihan: "Toleransi",
      tekanan: "Menyimpan dendam, tidak nyaman dalam situasi stres",
      ketakutan: "Konfrontasi",
    },
  },
  {
    num: 58,
    name: "Promoter",
    high: "I",
    ref: [25, 78, 25, 65],
    kekuatan: [
      "Mampu menangani situasi sulit dengan bijak, peka pada kebutuhan orang",
      "Mampu menciptakan suasana yang menyenangkan dan nyaman",
      "Mampu mempromosikan ide secara efektif",
      "Menyukai lingkungan dengan ritme cepat",
    ],
    perbaikan: [
      "Tidak terlalu analitis",
      "Menyampaikan lebih sedikit informasi saat menjual produk atau ide",
      "Lebih asertif",
    ],
    kecenderungan: {
      tujuan: "Persetujuan dan penerimaan",
      menilaiOrang: "Kemampuan membaca isyarat verbal dan nonverbal",
      mempengaruhi: "Ketenangan dan kepercayaan diri",
      nilaiOrganisasi: "Meredakan ketegangan, mempromosikan orang dan proyek",
      berlebihan: "Mengontrol percakapan",
      tekanan: "Verbal dan tajam terhadap orang lain",
      ketakutan: "Kehilangan keunikan diri",
    },
  },
  {
    num: 47,
    name: "Promoter",
    high: "I",
    ref: [22, 85, 58, 68],
    kekuatan: [
      "Kemampuan untuk beradaptasi dalam berbagai situasi",
      "Pemain tim optimis, bersosialisasi dan kooperatif",
      "Akan berusaha untuk membawa tim bersama-sama dengan cara yang terorganisir dengan baik",
      "Kesabaran untuk mendengarkan apa yang orang lain katakan",
    ],
    perbaikan: [
      "Mengurangi akomodatif terhadap orang lain",
      "Lebih konsisten dalam menunjukkan ketegasan",
      "Lebih terusterangan dan manajemen waktu yang lebih baik",
    ],
    kecenderungan: {
      tujuan: "Hasil sistematis melalui orang lain",
      menilaiOrang: "Kemampuan mereka untuk berkomunikasi dan berpikir",
      mempengaruhi: "Diplomasi",
      nilaiOrganisasi: "Hati-hati dan menarik",
      berlebihan: "Posisi dan standar mereka",
      tekanan: "Posesif dan terlalu sensitif",
      ketakutan: "Tidak menjadi bagian dari tim",
    },
  },
  {
    num: 30,
    name: "Promoter",
    high: "I",
    ref: [58, 72, 48, 22],
    kekuatan: [
      "Mampu bersikap persuasif, asertif, dan stabil",
      "Mampu mandiri saat dibutuhkan",
      "Mampu menciptakan dan mempromosikan sebuah ide",
      "Mampu menyajikan ide secara positif dan cukup langsung",
    ],
    perbaikan: [
      "Tidak terlalu keras pendapat",
      "Mengumpulkan cukup informasi sebelum bertindak",
      "Lebih memperhatikan detail dan organisasi",
    ],
    kecenderungan: {
      tujuan: "Mudah bergaul dan meyakinkan",
      menilaiOrang: "Dedikasi dan keuletan mereka",
      mempengaruhi: "Mengambil tanggung jawab",
      nilaiOrganisasi: "Antusiasme dan keterusterangan dengan ide serta opini baru",
      berlebihan: "Ambisi",
      tekanan: "Menjadi dangkal",
      ketakutan: "Tidak dipandang sebagai pemain tim",
    },
  },
];

/** Lookup cepat by nomor pattern. */
export const DISC_PATTERN_BY_NUM = new Map<number, DiscPattern>(
  DISC_PATTERNS.map((p) => [p.num, p])
);
