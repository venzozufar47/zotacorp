"use client";

import { useState } from "react";
import { BookOpen, Check, ChevronRight, Copy, Lightbulb } from "lucide-react";
import { toast } from "sonner";

/**
 * Panduan menyusun SOP (pemilik dokumen: Venzo) — ditampilkan di halaman SOP
 * sebagai rujukan admin saat menyusun & meninjau SOP. Isinya statis; bila
 * panduan direvisi, ubah di sini dan perbarui `GUIDE_REVIEWED`.
 */
export const GUIDE_REVIEWED = "14 Oktober 2026";

const TEMPLATE = `Nama SOP        :
Pemilik SOP     :
Brand / Cabang  :
Tingkat detail  : A / B / C
Versi & tanggal :

Tujuan
(1 kalimat)

Kapan dipakai
(pemicu proses)

Langkah / Standar hasil
1.
2.
3.

Batas kewenangan
(apa yang boleh diputuskan staf, apa yang harus dieskalasi)

Checklist akhir
[ ]
[ ]

Kesalahan yang pernah terjadi
(diisi seiring waktu)`;

const SOURCES: Array<{ label: string; href: string }> = [
  {
    label: "Adler, P. S., & Borys, B. (1996). Two Types of Bureaucracy: Enabling and Coercive. Administrative Science Quarterly, 41(1), 61-89.",
    href: "https://doi.org/10.2307/2393986",
  },
  {
    label: "Adler, P. S., Goldoftas, B., & Levine, D. I. (1999). Flexibility Versus Efficiency? A Case Study of Model Changeovers in the Toyota Production System. Organization Science, 10(1), 43-68.",
    href: "https://ideas.repec.org/a/inm/ororsc/v10y1999i1p43-68.html",
  },
  {
    label: "Tesis Radboud University, Balancing enabling and coercive formalization: a case study in an accounting firm.",
    href: "https://theses.ubn.ru.nl/handle/123456789/1718",
  },
  {
    label: "Tesis Radboud University, Enabling and Coercive Formalization.",
    href: "https://theses.ubn.ru.nl/items/36908c57-190d-4482-9390-d0dd4819584f",
  },
  { label: "CASRAI, Standard operating procedure.", href: "https://casrai.org/gxp/standard-operating-procedure" },
  {
    label: "Boston University CRRO, Standard Operating Procedures in Clinical Research.",
    href: "https://www.bumc.bu.edu/crro/files/2015/10/SOPs-final.pdf",
  },
  {
    label: "Cleveland Clinic Taussig Cancer Center, Targeted Review of SOPs for Enhanced Efficiency and Compliance (poster, 2025).",
    href: "https://www.aaci-cancer.org/Files/Admin/CRI/2025/03%2DPoster%2DTargeted%2DReview%2Dof%2DStandard%2DOperating%2DProcedures%2Dfor%2DEnhanced%2DEfficiency%2Dand%2DCompliance%2Epdf",
  },
];

function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 mb-2 font-display text-[15px] font-bold first:mt-0">{children}</h3>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h4 className="mt-4 mb-1 text-[13px] font-bold">{children}</h4>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="my-1.5 text-[13px] leading-relaxed">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="my-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed">{children}</ul>;
}
function OL({ children }: { children: React.ReactNode }) {
  return <ol className="my-1.5 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">{children}</ol>;
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-2 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[28rem] text-left text-[12.5px]">
        <thead className="bg-muted/50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 align-top ${j === 0 ? "font-semibold" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Isi panduan lengkap (dipakai di drawer "Panduan SOP"). */
export function SopGuideBody() {
  const [copied, setCopied] = useState(false);

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Gagal menyalin — salin manual dari kotak template.");
    }
  }

  return (
    <article className="max-w-3xl">
      <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[12px] text-muted-foreground">
        <div>
          <b className="text-foreground">Pemilik dokumen:</b> Venzo (Zota Corp)
        </div>
        <div>
          <b className="text-foreground">Berlaku untuk:</b> Haengbocake, Yeobo Space, Yeobo Booth
        </div>
        <div>
          <b className="text-foreground">Terakhir ditinjau:</b> {GUIDE_REVIEWED}
        </div>
      </div>

      <H2>1. Prinsip Utama</H2>
      <P>
        SOP yang baik tidak diukur dari panjangnya. Ukurannya: apakah orang yang mengerjakan bisa
        mengikutinya saat bekerja, dan apakah hasilnya konsisten.
      </P>
      <P>Dua kegagalan yang sering terjadi:</P>
      <UL>
        <li>
          <b>Terlalu kabur.</b> Staf menafsirkan sendiri, hasil tidak konsisten.
        </li>
        <li>
          <b>Terlalu panjang dan kaku.</b> Staf tidak sanggup mengikutinya, lalu menyimpang atau
          mengabaikannya.
        </li>
      </UL>
      <P>
        Aturan kerja: <b>sesuaikan tingkat detail dengan risiko dan biaya kesalahan</b>, bukan
        menyeragamkan semua SOP.
      </P>

      <H2>2. Dua Jenis SOP (Adler &amp; Borys, 1996)</H2>
      <Table
        head={["", "SOP yang membantu (enabling)", "SOP yang memaksa (koersif)"]}
        rows={[
          ["Tujuan", "Membantu staf menguasai pekerjaan", "Memastikan staf patuh"],
          ["Fungsi", "Memori organisasi, rujukan saat ragu", "Sistem antikesalahan, tanpa ruang menilai"],
          ["Cara disusun", "Melibatkan orang yang mengerjakan", "Ditulis sepihak oleh manajemen"],
          ["Dampak ke staf", "Cenderung positif", "Cenderung negatif"],
        ]}
      />
      <P>
        <b>Target Zota: SOP enabling.</b> Detail tinggi tetap bisa enabling selama staf dilatih,
        dipercaya, dan ikut memperbaikinya. Studi pabrik NUMMI (Toyota-GM) menunjukkan pekerjaan
        yang diatur sangat rinci bisa berhasil, dengan syarat pelatihan, kepercayaan, dan
        kepemimpinan mendukung.
      </P>

      <H2>3. Tiga Tingkat Detail</H2>
      <H3>Tingkat A: Detail tinggi (langkah per langkah + checklist)</H3>
      <P>Gunakan untuk proses yang mahal atau berbahaya jika salah, atau yang diulang sangat sering.</P>
      <P>Contoh:</P>
      <UL>
        <li>Kebersihan dan keamanan pangan</li>
        <li>Takaran, suhu, dan waktu produksi</li>
        <li>Penerimaan pembayaran dan pencatatan uang</li>
        <li>Serah terima pesanan custom (spesifikasi, tanggal, pembayaran)</li>
        <li>Prosedur penutupan studio dan pengecekan peralatan</li>
      </UL>
      <P>Format: checklist satu halaman, langkah bernomor, ada kolom penanggung jawab.</P>

      <H3>Tingkat B: Detail sedang (prinsip + standar hasil)</H3>
      <P>Gunakan untuk proses yang butuh penilaian situasi.</P>
      <P>Contoh:</P>
      <UL>
        <li>Menangani komplain pelanggan</li>
        <li>Mengarahkan pose pelanggan di studio</li>
        <li>Menawarkan produk tambahan</li>
      </UL>
      <P>
        Format: tulis tujuan, standar hasil yang diharapkan, dan batas kewenangan staf (kapan boleh
        memutuskan sendiri, kapan harus eskalasi). Jangan menulis skrip kata per kata.
      </P>

      <H3>Tingkat C: Belum di-SOP-kan (panduan ringan)</H3>
      <P>Gunakan untuk hal yang masih berubah cepat atau masih dalam uji coba.</P>
      <P>
        Format: catatan singkat berisi praktik terbaik saat ini. Bakukan menjadi SOP setelah pola
        kerjanya stabil.
      </P>

      <H2>4. Cara Menentukan Tingkat Detail</H2>
      <P>Jawab empat pertanyaan untuk setiap proses:</P>
      <OL>
        <li>
          <b>Jika salah, seberapa mahal atau berbahaya?</b> Tinggi → Tingkat A.
        </li>
        <li>
          <b>Seberapa sering proses ini diulang?</b> Sering → Tingkat A atau B.
        </li>
        <li>
          <b>Apakah hasil yang baik bisa dicapai dengan cara berbeda?</b> Ya → Tingkat B.
        </li>
        <li>
          <b>Apakah proses ini masih berubah?</b> Ya → Tingkat C.
        </li>
      </OL>

      <H2>5. Cara Menulis SOP</H2>
      <OL>
        <li>
          <b>Libatkan pelaksana.</b> Minta orang yang mengerjakan setiap hari ikut menyusun dan
          mengoreksi. Ini yang membedakan SOP enabling dari koersif.
        </li>
        <li>
          <b>Pisahkan eksekusi dan penjelasan.</b> Checklist satu halaman untuk dipakai di lapangan.
          Alasan dan konteks di dokumen terpisah.
        </li>
        <li>
          <b>Pakai bahasa sederhana.</b> Hindari istilah teknis yang membuat staf ragu.
        </li>
        <li>
          <b>Satu SOP, satu proses.</b> Jangan menggabungkan beberapa proses dalam satu dokumen.
        </li>
        <li>
          <b>Tulis hasil, bukan hanya langkah.</b> Staf perlu tahu seperti apa hasil yang benar.
        </li>
      </OL>

      <H3>Template SOP satu halaman</H3>
      <div className="relative my-2">
        <button
          type="button"
          onClick={copyTemplate}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-muted"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Tersalin" : "Salin"}
        </button>
        <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 pr-20 text-[12px] leading-relaxed">
          {TEMPLATE}
        </pre>
      </div>

      <H2>6. Menjaga SOP Tetap Hidup</H2>
      <P>
        SOP yang ditulis sekali lalu disimpan akan usang. SOP usang lebih berbahaya daripada tidak
        ada SOP, karena staf bekerja mengikuti aturan yang sudah tidak berlaku.
      </P>
      <UL>
        <li>
          <b>Beri pemilik.</b> Setiap SOP punya satu orang yang bertanggung jawab atas isinya.
        </li>
        <li>
          <b>Beri tanggal dan versi.</b> Tarik versi lama dari penggunaan saat versi baru berlaku.
        </li>
        <li>
          <b>Latih staf baru.</b> Semua SOP relevan diajarkan saat mereka bergabung.
        </li>
        <li>
          <b>Uji setelah diterapkan.</b> Cek beberapa hari setelah SOP baru dipakai: apakah semua
          langkah bisa dijalankan tanpa kendala?
        </li>
        <li>
          <b>Pantau kepatuhan.</b> Contoh dari Cleveland Clinic: tiap bulan, tinjau lima SOP
          berisiko tinggi, dan periksa lima kasus per SOP dengan isi SOP sebagai checklist.
          Hasilnya, temuan pelanggaran turun dari tahun ke tahun, dan satu metrik turun dari 48%
          menjadi 5%.
        </li>
        <li>
          <b>Revisi saat ada hambatan.</b> Jika staf sulit mematuhi suatu langkah, curigai SOP-nya
          dulu, bukan stafnya.
        </li>
        <li>
          <b>Tambah detail setelah ada kesalahan nyata.</b> Jangan menebak semua kemungkinan di awal.
        </li>
      </UL>

      <H3>Jadwal tinjauan yang disarankan</H3>
      <Table
        head={["Tingkat", "Tinjau"]}
        rows={[
          ["A (risiko tinggi)", "Setiap bulan atau setiap ada insiden"],
          ["B", "Setiap 3 bulan"],
          ["C", "Setiap ada perubahan praktik, lalu ditingkatkan jadi B atau A bila stabil"],
        ]}
      />
      <P>
        <b>Di sistem ini:</b> atur pemilik dan interval tinjau ulang tiap SOP di Pengaturan SOP →
        buka SOP-nya (Tingkat A ≈ tiap 30 hari, Tingkat B ≈ tiap 90 hari). Pengingat masuk ke
        pemilik lewat notifikasi dan ke Inbox admin.
      </P>

      <H2>7. Kesalahan Umum</H2>
      <UL>
        <li>Menganggap SOP terpanjang adalah SOP terbaik</li>
        <li>Menulis SOP tanpa melibatkan pelaksana</li>
        <li>Memakai SOP sebagai alat menyalahkan, bukan alat membantu</li>
        <li>Tidak memperbarui SOP ketika proses atau aturan berubah</li>
        <li>Membuat SOP untuk semua hal sekaligus sebelum prosesnya stabil</li>
        <li>Memakai bahasa yang membuat staf ragu apa yang diminta</li>
      </UL>

      <H2>8. Catatan tentang Kekuatan Bukti</H2>
      <P>
        Sebagian besar riset di balik panduan ini berasal dari manufaktur besar dan riset klinis.
        Belum ada studi yang menguji tingkat detail SOP secara langsung pada UKM jasa atau F&amp;B.
        Perlakukan panduan ini sebagai prinsip yang kuat, lalu uji dan sesuaikan di operasional Zota
        sendiri.
      </P>

      <H2>Sumber</H2>
      <ul className="my-1.5 list-disc space-y-1 pl-5 text-[12px] leading-relaxed">
        {SOURCES.map((s) => (
          <li key={s.href}>
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline break-words"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

/**
 * Pengingat ringkas untuk admin saat menyusun / meninjau SOP — dipasang di
 * atas Pengaturan SOP, tempat SOP benar-benar ditulis. Terlipat bawaan supaya
 * tidak memakan tempat; tombol membuka panduan lengkap.
 */
export function SopGuideReminder({ onOpenGuide }: { onOpenGuide: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <Lightbulb size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex-1 text-[12.5px] font-semibold">
          Pengingat menyusun SOP: detail mengikuti risiko, bukan seragam
        </span>
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-amber-500/20 px-4 py-3 text-[12px] leading-relaxed">
          <div>
            <b>Tentukan tingkat detail — jawab 4 pertanyaan:</b>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>Jika salah, seberapa mahal atau berbahaya? Tinggi → <b>A</b> (langkah + checklist).</li>
              <li>Seberapa sering diulang? Sering → A atau B.</li>
              <li>Hasil baik bisa dicapai dengan cara berbeda? Ya → <b>B</b> (standar hasil + batas kewenangan).</li>
              <li>Masih berubah? Ya → <b>C</b> (panduan ringan, belum di-SOP-kan).</li>
            </ol>
          </div>
          <div>
            <b>Kebiasaan yang menjaga SOP tetap hidup:</b>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Libatkan pelaksana saat menulis — ini yang membuat SOP membantu, bukan memaksa.</li>
              <li>Beri pemilik + jadwal tinjau ulang (A ≈ 30 hari, B ≈ 90 hari); uji beberapa hari setelah dipakai.</li>
              <li>Staf sulit mematuhi langkah? Curigai SOP-nya dulu, bukan stafnya.</li>
              <li>Tambah detail hanya setelah ada kesalahan nyata. Satu SOP, satu proses.</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] font-semibold hover:bg-muted"
          >
            <BookOpen size={12} /> Buka panduan lengkap
          </button>
        </div>
      )}
    </div>
  );
}
