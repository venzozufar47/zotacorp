/**
 * Contoh pelanggaran berat untuk kanal Pengaduan HR. Laporan yang ditandai "pelanggaran berat" langsung
 * ke tingkat 4 (pihak tepercaya alternatif / Owner). Daftar ini panduan bagi pelapor, bukan batasan
 * hukum — modul biasa (bukan "use server") agar bisa diimpor client.
 */
export const SERIOUS_VIOLATIONS: { title: string; examples: string }[] = [
  {
    title: "Pelecehan dan kekerasan",
    examples: "Pelecehan seksual, kekerasan fisik, ancaman, intimidasi, perundungan berat.",
  },
  {
    title: "Pencurian dan penggelapan",
    examples: "Mengambil uang kas, barang, atau stok tanpa izin; menyelewengkan uang perusahaan.",
  },
  {
    title: "Kecurangan dan manipulasi data",
    examples: "Memalsukan absen, nota, hitungan kas, stok, atau laporan; titip absen.",
  },
  {
    title: "Penyalahgunaan wewenang",
    examples: "Menerima suap atau gratifikasi, konflik kepentingan, memakai jabatan untuk keuntungan pribadi.",
  },
  {
    title: "Narkoba dan alkohol",
    examples: "Membawa, memakai, atau mengedarkan narkoba/alkohol.",
  },
  {
    title: "Merusak aset atau nama baik perusahaan",
    examples: "Sabotase, merusak peralatan dengan sengaja, membocorkan data rahasia, menyebar fitnah.",
  },
];
