import type { Metadata } from "next";
import Image from "next/image";

/**
 * Public privacy policy page — required by Google Play (and Apple) before an
 * app that handles personal data can be published. Must be reachable WITHOUT
 * login (Google's reviewer is anonymous), so `/privacy` is allow-listed in
 * src/lib/supabase/middleware.ts ahead of the auth gate.
 *
 * Content reflects what the app actually collects: account (email/name),
 * attendance (selfie + geolocation), uploaded photos (cleaning/order proof),
 * camera+mic for in-app voice/video, and work records (payroll, sales,
 * schedules). Keep this in sync with the Play Console "Data safety" form.
 */
export const metadata: Metadata = {
  title: "Kebijakan Privasi — Zota Corp",
  description:
    "Kebijakan privasi aplikasi Zota Corp: data yang dikumpulkan, cara penggunaan, dan hak pengguna.",
};

const LAST_UPDATED = "17 Juni 2026";
// TODO(zota): ganti ke alamat email resmi yang benar-benar dipantau.
const CONTACT_EMAIL = "privacy@zotacorp.com";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-poppins text-xl font-semibold text-foreground">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-full bg-background">
      {/* Header band — brand teal so the doc reads as an official Zota page */}
      <div className="bg-primary">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-8">
          <Image
            src="/zota-favicon.png"
            alt="Zota Corp"
            width={44}
            height={44}
            className="rounded-xl"
          />
          <div>
            <p className="font-poppins text-lg font-bold text-primary-foreground">
              Zota Corp
            </p>
            <p className="text-sm text-primary-foreground/80">
              Kebijakan Privasi Aplikasi
            </p>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 pb-20">
        <p className="mt-8 text-sm text-muted-foreground">
          Terakhir diperbarui: {LAST_UPDATED}
        </p>

        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Aplikasi <strong className="text-foreground">Zota Corp</strong> adalah
          alat operasional internal yang digunakan oleh karyawan, admin, dan
          investor Zota Corp. Kebijakan ini menjelaskan data apa yang kami
          kumpulkan, mengapa, dan bagaimana kami melindunginya. Aplikasi ini{" "}
          <strong className="text-foreground">
            hanya dapat digunakan oleh pengguna yang memiliki akun
          </strong>{" "}
          yang dibuat oleh Zota Corp; aplikasi tidak ditujukan untuk masyarakat
          umum dan tidak untuk anak-anak di bawah 18 tahun.
        </p>

        <Section title="1. Data yang kami kumpulkan">
          <p>Kami hanya mengumpulkan data yang diperlukan untuk menjalankan operasional perusahaan:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Data akun:</strong> nama,
              alamat email, peran (karyawan/admin/investor), dan foto profil.
            </li>
            <li>
              <strong className="text-foreground">Data kehadiran:</strong> foto
              swafoto (selfie) saat absen, serta lokasi (GPS) pada saat
              check-in/check-out untuk memverifikasi kehadiran di lokasi kerja.
            </li>
            <li>
              <strong className="text-foreground">Foto unggahan:</strong> bukti
              pekerjaan seperti foto kebersihan, bukti pesanan, dan bukti
              transaksi yang kamu unggah.
            </li>
            <li>
              <strong className="text-foreground">Kamera & mikrofon:</strong>{" "}
              diakses hanya saat kamu menggunakan fitur panggilan suara/video
              internal. Kami tidak merekam tanpa tindakanmu.
            </li>
            <li>
              <strong className="text-foreground">Catatan kerja:</strong> data
              terkait pekerjaan seperti penggajian, penjualan (POS), jadwal,
              pesanan, dan laporan keuangan sesuai peranmu.
            </li>
          </ul>
        </Section>

        <Section title="2. Bagaimana kami menggunakan data">
          <ul className="list-disc space-y-2 pl-5">
            <li>Mengautentikasi dan mengelola akunmu.</li>
            <li>Mencatat dan memverifikasi kehadiran serta aktivitas kerja.</li>
            <li>Menjalankan fitur operasional (absensi, POS, penggajian, penjadwalan, laporan).</li>
            <li>Mengirim notifikasi terkait pekerjaan (mis. pengingat jadwal, terbitnya slip gaji).</li>
            <li>Menjaga keamanan dan mencegah penyalahgunaan.</li>
          </ul>
          <p>
            Kami <strong className="text-foreground">tidak</strong> menjual
            datamu, dan <strong className="text-foreground">tidak</strong>{" "}
            menggunakannya untuk iklan.
          </p>
        </Section>

        <Section title="3. Penyimpanan & pihak ketiga">
          <p>
            Data disimpan dengan aman pada penyedia infrastruktur tepercaya yang
            kami gunakan semata untuk menjalankan aplikasi:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Supabase</strong> — basis data
              & autentikasi (penyimpanan akun, data kerja, dan file).
            </li>
            <li>
              <strong className="text-foreground">Vercel</strong> — hosting
              aplikasi.
            </li>
            <li>
              <strong className="text-foreground">LiveKit</strong> — layanan
              panggilan suara/video internal.
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> — pengiriman
              email (mis. tautan atur ulang kata sandi).
            </li>
          </ul>
          <p>
            Seluruh data dikirim melalui koneksi terenkripsi (HTTPS). Penyedia
            di atas memproses data hanya atas nama kami.
          </p>
        </Section>

        <Section title="4. Penyimpanan data (retensi)">
          <p>
            Kami menyimpan data selama akunmu aktif dan selama diperlukan untuk
            keperluan operasional serta kepatuhan hukum. Saat akun dinonaktifkan,
            data terkait dapat dihapus atau dianonimkan sesuai kebutuhan
            perusahaan.
          </p>
        </Section>

        <Section title="5. Hak kamu">
          <p>
            Kamu berhak meminta akses, perbaikan, atau penghapusan data
            pribadimu. Karena ini aplikasi internal, permintaan tersebut diajukan
            melalui admin perusahaan atau kontak di bawah.
          </p>
        </Section>

        <Section title="6. Keamanan">
          <p>
            Kami menerapkan langkah teknis dan organisasi yang wajar untuk
            melindungi data, termasuk enkripsi saat transit, kontrol akses
            berbasis peran, dan autentikasi. Namun, tidak ada sistem yang 100%
            aman; harap jaga kerahasiaan kata sandimu.
          </p>
        </Section>

        <Section title="7. Perubahan kebijakan">
          <p>
            Kebijakan ini dapat diperbarui sewaktu-waktu. Perubahan akan
            ditampilkan pada halaman ini dengan tanggal &quot;terakhir
            diperbarui&quot; yang baru.
          </p>
        </Section>

        <Section title="8. Kontak">
          <p>
            Pertanyaan tentang kebijakan ini atau data pribadimu dapat
            disampaikan ke:
          </p>
          <p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-primary underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="text-foreground">Zota Corp — Semarang, Indonesia</p>
        </Section>
      </article>
    </main>
  );
}
