/**
 * Instrumen DISC — 24 kelompok kata (digitisasi dari workbook
 * "Personal Insights Profile" yang dipakai internal Zota Corp; terjemahan
 * Bahasa Indonesia). Untuk setiap kelompok, karyawan memilih SATU baris
 * "Paling menggambarkan" (Most) dan SATU baris "Kurang menggambarkan"
 * (Least) — harus berbeda.
 *
 * Kunci skoring (`most`/`least` per baris → D/I/S/C/null):
 * Workbook fisik menyembunyikan kunci di lapisan scratch-off, TIDAK
 * tercetak di halaman mana pun. Kunci di bawah adalah REKONSTRUKSI dari
 * semantik kata sifat DISC, DIVALIDASI terhadap batasan numerik dari
 * workbook itu sendiri:
 *   - contoh terisi di halaman petunjuk: box 1 baris 1 = S, baris 3 = C;
 *   - jumlah maksimum tally per faktor pada tabel konversi grafik:
 *     MOST  → D=20, I=17, S=19, C=15 (sisanya 25 baris netral "—")
 *     LEAST → D=21, I=19, S=19, C=16 (sisanya 21 baris netral "—")
 * Kedua distribusi terpenuhi PERSIS oleh kunci ini.
 */

export type DiscFactor = "D" | "I" | "S" | "C";

export interface DiscQuestionLine {
  /** Teks Indonesia yang tampil ke karyawan. */
  id: string;
  /** Teks asli (referensi admin/audit). */
  en: string;
  /** Faktor yang di-tally bila baris ini dipilih PALING (null = netral). */
  most: DiscFactor | null;
  /** Faktor yang di-tally bila baris ini dipilih KURANG (null = netral). */
  least: DiscFactor | null;
}

export interface DiscQuestionBox {
  /** Nomor kelompok 1..24. */
  no: number;
  lines: [DiscQuestionLine, DiscQuestionLine, DiscQuestionLine, DiscQuestionLine];
}

export const DISC_QUESTIONS: DiscQuestionBox[] = [
  {
    no: 1,
    lines: [
      { id: "Lembut, baik hati", en: "Gentle, kindly", most: "S", least: "S" },
      { id: "Persuasif, meyakinkan", en: "Persuasive, convincing", most: "I", least: "I" },
      { id: "Rendah hati, pendiam, sederhana", en: "Humble, reserved, modest", most: "C", least: "C" },
      { id: "Orisinal, penuh ide, individualistis", en: "Original, inventive, individualistic", most: "D", least: "D" },
    ],
  },
  {
    no: 2,
    lines: [
      { id: "Menarik, memikat, disukai orang", en: "Attractive, charming, attracts others", most: "I", least: "I" },
      { id: "Kooperatif, mudah setuju", en: "Cooperative, agreeable", most: "S", least: "S" },
      { id: "Keras kepala, tak mau mengalah", en: "Stubborn, unyielding", most: "D", least: "D" },
      { id: "Manis, menyenangkan", en: "Sweet, pleasing", most: null, least: null },
    ],
  },
  {
    no: 3,
    lines: [
      { id: "Mudah diarahkan, pengikut", en: "Easily led, follower", most: null, least: null },
      { id: "Berani, nekat", en: "Bold, daring", most: "D", least: "D" },
      { id: "Setia, penuh dedikasi", en: "Loyal, faithful, devoted", most: "S", least: "S" },
      { id: "Memesona, menyenangkan hati", en: "Charming, delightful", most: null, least: null },
    ],
  },
  {
    no: 4,
    lines: [
      { id: "Berpikiran terbuka, reseptif", en: "Open-minded, receptive", most: null, least: null },
      { id: "Suka membantu, ringan tangan", en: "Obliging, helpful", most: "S", least: "S" },
      { id: "Berkemauan keras, teguh", en: "Willpower, strong-willed", most: "D", least: "D" },
      { id: "Ceria, penuh sukacita", en: "Cheerful, joyful", most: "I", least: "I" },
    ],
  },
  {
    no: 5,
    lines: [
      { id: "Humoris, suka bercanda", en: "Jovial, joking", most: "I", least: "I" },
      { id: "Presisi, tepat", en: "Precise, exact", most: "C", least: "C" },
      { id: "Berani ambil risiko, tangguh, lancang", en: "Nervy, gutsy, brazen", most: "D", least: "D" },
      { id: "Tenang, kalem, tidak mudah terpancing", en: "Even-tempered, calm, not easily excited", most: "S", least: "S" },
    ],
  },
  {
    no: 6,
    lines: [
      { id: "Kompetitif, ingin menang", en: "Competitive, seeking to win", most: "D", least: "D" },
      { id: "Perhatian, peduli, penuh pertimbangan", en: "Considerate, caring, thoughtful", most: "S", least: "S" },
      { id: "Supel, suka bersenang-senang, aktif bergaul", en: "Outgoing, fun-loving, socially striving", most: "I", least: "I" },
      { id: "Harmonis, mudah sepakat", en: "Harmonious, agreeable", most: null, least: null },
    ],
  },
  {
    no: 7,
    lines: [
      { id: "Cerewet, sulit dipuaskan", en: "Fussy, hard to please", most: "C", least: "C" },
      { id: "Patuh, menurut, taat aturan", en: "Obedient, will do as told, dutiful", most: "S", least: "S" },
      { id: "Pantang menyerah, gigih", en: "Unconquerable, determined", most: "D", least: "D" },
      { id: "Suka bermain, jenaka, penuh keceriaan", en: "Playful, frisky, full of fun", most: "I", least: "I" },
    ],
  },
  {
    no: 8,
    lines: [
      { id: "Pemberani, tak gentar", en: "Brave, unafraid, courageous", most: "D", least: "D" },
      { id: "Menginspirasi, menstimulasi, memotivasi", en: "Inspiring, stimulating, motivating", most: "I", least: "I" },
      { id: "Mengalah, menurut, mudah menyerah", en: "Submissive, yielding, gives in", most: "S", least: "S" },
      { id: "Pemalu, penakut, pendiam", en: "Timid, shy, quiet", most: "C", least: "C" },
    ],
  },
  {
    no: 9,
    lines: [
      { id: "Mudah bergaul, senang ditemani orang", en: "Sociable, enjoys the company of others", most: "I", least: "I" },
      { id: "Sabar, stabil, toleran", en: "Patient, steady, tolerant", most: "S", least: "S" },
      { id: "Mandiri, percaya pada diri sendiri", en: "Self-reliant, independent", most: "D", least: "D" },
      { id: "Bicara lembut, kalem, tertutup", en: "Soft-spoken, mild, reserved", most: "C", least: "C" },
    ],
  },
  {
    no: 10,
    lines: [
      { id: "Suka petualangan, berani ambil peluang", en: "Adventurous, willing to take chances", most: "D", least: "D" },
      { id: "Reseptif, terbuka pada saran", en: "Receptive, open to suggestions", most: null, least: null },
      { id: "Ramah, hangat, bersahabat", en: "Cordial, warm, friendly", most: null, least: null },
      { id: "Moderat, menghindari hal ekstrem", en: "Moderate, avoids extremes", most: null, least: null },
    ],
  },
  {
    no: 11,
    lines: [
      { id: "Banyak bicara, suka mengobrol", en: "Talkative, chatty", most: "I", least: "I" },
      { id: "Terkontrol, terkendali", en: "Controlled, restrained", most: "C", least: "C" },
      { id: "Konvensional, mengikuti kebiasaan", en: "Conventional, doing it the usual way, customary", most: "S", least: "S" },
      { id: "Tegas, pasti, mantap mengambil keputusan", en: "Decisive, certain, firm in making a decision", most: "D", least: "D" },
    ],
  },
  {
    no: 12,
    lines: [
      { id: "Pintar bicara, lihai berkata-kata", en: "Polished, smooth-talker", most: "I", least: "I" },
      { id: "Berani, pengambil risiko", en: "Daring, risk-taker", most: "D", least: "D" },
      { id: "Diplomatis, bijak terhadap orang", en: "Diplomatic, tactful to people", most: "C", least: "C" },
      { id: "Puas, merasa cukup, senang", en: "Satisfied, content, pleased", most: null, least: null },
    ],
  },
  {
    no: 13,
    lines: [
      { id: "Agresif, penantang, langsung bertindak", en: "Aggressive, challenger, takes action", most: "D", least: "D" },
      { id: "Bintang suasana, menghibur, supel", en: "Life of the party, entertaining, outgoing", most: "I", least: "I" },
      { id: "Mudah dimanfaatkan orang lain", en: "Easy mark, easily taken advantage of", most: "S", least: "S" },
      { id: "Penakut, mudah cemas", en: "Fearful, afraid", most: "C", least: "C" },
    ],
  },
  {
    no: 14,
    lines: [
      { id: "Hati-hati, waspada, cermat", en: "Cautious, wary, careful", most: "C", least: "C" },
      { id: "Bertekad kuat, teguh pendirian", en: "Determined, decided, unwavering, stand firm", most: "D", least: "D" },
      { id: "Meyakinkan, menenteramkan", en: "Convincing, assuring", most: null, least: null },
      { id: "Baik hati, menyenangkan", en: "Good-natured, pleasant", most: null, least: null },
    ],
  },
  {
    no: 15,
    lines: [
      { id: "Bersedia, mau mengikuti", en: "Willing, go along with", most: "S", least: "S" },
      { id: "Bersemangat, menggebu-gebu", en: "Eager, anxious", most: null, least: "D" },
      { id: "Mudah setuju, menurut", en: "Agreeable, consenting", most: "C", least: "C" },
      { id: "Bersemangat tinggi, lincah, antusias", en: "High-spirited, lively, enthusiastic", most: "I", least: "I" },
    ],
  },
  {
    no: 16,
    lines: [
      { id: "Percaya diri, yakin pada diri sendiri", en: "Confident, believes in self, assured", most: null, least: "I" },
      { id: "Simpatik, penuh kasih, pengertian", en: "Sympathetic, compassionate, understanding", most: "S", least: "S" },
      { id: "Toleran", en: "Tolerant", most: null, least: null },
      { id: "Asertif, agresif", en: "Assertive, aggressive", most: "D", least: "D" },
    ],
  },
  {
    no: 17,
    lines: [
      { id: "Disiplin, pengendalian diri baik", en: "Well-disciplined, self-controlled", most: "C", least: "C" },
      { id: "Dermawan, suka berbagi", en: "Generous, willing to share", most: null, least: null },
      { id: "Ekspresif, banyak gestur saat bicara", en: "Animated, uses gestures for expression", most: "I", least: "I" },
      { id: "Persisten, pantang berhenti", en: "Persistent, unrelenting, refuses to quit", most: "D", least: "D" },
    ],
  },
  {
    no: 18,
    lines: [
      { id: "Mengagumkan, layak dipuji", en: "Admirable, deserving of praise", most: null, least: "I" },
      { id: "Baik, suka memberi atau menolong", en: "Kind, willing to give or help", most: "S", least: "S" },
      { id: "Pasrah, mengalah", en: "Resigned, gives in", most: null, least: null },
      { id: "Karakter kuat, berwibawa", en: "Force of character, powerful", most: "D", least: "D" },
    ],
  },
  {
    no: 19,
    lines: [
      { id: "Hormat, menghargai orang lain", en: "Respectful, shows respect", most: "C", least: "C" },
      { id: "Perintis, penjelajah, berjiwa usaha", en: "Pioneering, exploring, enterprising", most: "D", least: "D" },
      { id: "Optimis, berpandangan positif", en: "Optimistic, positive view", most: "I", least: "I" },
      { id: "Akomodatif, ingin menyenangkan, siap membantu", en: "Accommodating, willing to please, ready to help", most: "S", least: "S" },
    ],
  },
  {
    no: 20,
    lines: [
      { id: "Suka berdebat, konfrontatif", en: "Argumentative, confronting", most: "D", least: "D" },
      { id: "Adaptif, fleksibel", en: "Adaptable, flexible", most: "S", least: "S" },
      { id: "Cuek, acuh tak acuh", en: "Nonchalant, casually indifferent, lack of concern", most: null, least: null },
      { id: "Riang, tanpa beban", en: "Light-hearted, carefree", most: null, least: null },
    ],
  },
  {
    no: 21,
    lines: [
      { id: "Mudah percaya, yakin pada orang lain", en: "Trusting, faith in others", most: "I", least: "I" },
      { id: "Merasa puas, berkecukupan", en: "Contented, satisfied", most: null, least: null },
      { id: "Positif, tanpa keraguan", en: "Positive, admitting no doubt", most: null, least: null },
      { id: "Damai, tenteram", en: "Peaceful, tranquil", most: null, least: null },
    ],
  },
  {
    no: 22,
    lines: [
      { id: "Mudah membaur, suka bersama orang lain", en: "Good mixer, likes being with others", most: "I", least: "I" },
      { id: "Berwawasan, terpelajar, berpengetahuan", en: "Cultured, educated, knowledgeable", most: "C", least: "C" },
      { id: "Penuh energi, bersemangat", en: "Vigorous, energetic", most: null, least: null },
      { id: "Longgar, tidak kaku, toleran pada tindakan orang", en: "Lenient, not overly strict, tolerant of others actions", most: "S", least: "S" },
    ],
  },
  {
    no: 23,
    lines: [
      { id: "Enak ditemani, mudah didekati", en: "Companionable, easy to be with", most: "S", least: "S" },
      { id: "Akurat, tepat", en: "Accurate, correct", most: "C", least: "C" },
      { id: "Blak-blakan, bicara bebas dan berani", en: "Outspoken, speaks freely and boldly", most: "D", least: "D" },
      { id: "Tertahan, pendiam, terkontrol", en: "Restrained, reserved, controlled", most: null, least: "C" },
    ],
  },
  {
    no: 24,
    lines: [
      { id: "Gelisah, sulit diam atau santai", en: "Restless, unable to rest or relax", most: null, least: null },
      { id: "Ramah bertetangga, bersahabat", en: "Neighborly, friendly", most: "S", least: "S" },
      { id: "Populer, disukai banyak orang", en: "Popular, liked by many or most people", most: "I", least: "I" },
      { id: "Rapi, teratur, terorganisir", en: "Orderly, neat, organized", most: "C", least: "C" },
    ],
  },
];
