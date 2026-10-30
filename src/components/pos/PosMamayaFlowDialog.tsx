"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SECTIONS: Array<{ title: string; items: string[] }> = [
  {
    title: "Tunai (cash)",
    items: [
      "Dicatat sebagai pemasukan \"Sales\" di buku Cash Haengbocake Semarang dengan tag cabang Mamaya.",
      "Langsung menambah isi laci, karena laci Mamaya sama dengan laci Semarang.",
      "Omset tunai langsung masuk kolom Mamaya di PnL.",
    ],
  },
  {
    title: "QRIS",
    items: [
      "Dicatat sebagai \"QRIS (non-operasional)\" di buku Semarang, tag Mamaya. Tidak menambah laci karena uangnya masuk rekening bank, bukan tunai.",
      "Verifikasi: kasir memilih \"ada bunyi BukuPay\" (tanpa foto) atau melampirkan foto bukti. Pilihan ini tersimpan di riwayat.",
      "Di PnL, setoran QRIS di bank (Sales Pusat) dipotong otomatis sebesar total QRIS Mamaya bulan itu, lalu diatribusikan ke kolom Mamaya.",
    ],
  },
  {
    title: "Pesanan & diskon",
    items: [
      "Pesanan belum dibayar: stok langsung berkurang, tetapi kas baru tercatat saat pesanan dilunasi (tunai atau QRIS) di halaman Pesanan.",
      "Pesanan yang dibayar lewat admin (WhatsApp) tidak membuat catatan kas di POS.",
      "Diskon memakai kampanye milik Mamaya sendiri. Yang masuk kas dan omset adalah harga setelah diskon.",
    ],
  },
  {
    title: "Alur stok",
    items: [
      "Stok dihitung per produk Mamaya: opname terakhir + produksi − penarikan − penjualan (penjualan yang di-void tidak dihitung).",
      "Produksi, penarikan, dan opname dicatat di menu Stok Mamaya. Beberapa operasi butuh PIN penanggung jawab (sama dengan Semarang).",
      "Opname stok Mamaya dilakukan terpisah di menu Stok, tidak ikut opname buka/tutup shift (yang hanya menghitung stok Semarang).",
      "Selisih kurang saat opname yang dibayar tunai dicatat sebagai pemasukan \"Penyesuaian\" di buku Semarang, tag Mamaya.",
      "Produk yang tidak dilacak stoknya tidak berkurang saat dijual dan tidak ikut opname.",
    ],
  },
  {
    title: "Shift, laci, dan saldo",
    items: [
      "Satu shift dan satu laci dengan Haengbo Semarang. Buka atau tutup shift cukup sekali, di outlet mana pun.",
      "Halaman Saldo menampilkan saldo Semarang, sudah termasuk penjualan Mamaya.",
    ],
  },
  {
    title: "Pembatalan (void)",
    items: [
      "Void menghapus catatan kas penjualan itu, jadi uangnya hilang dari buku dan laci.",
      "Void QRIS yang dikembalikan tunai dari laci dicatat sebagai pengeluaran \"Sales Refund\" di buku Semarang.",
    ],
  },
  {
    title: "Laporan laba rugi (PnL)",
    items: [
      "Omset dan biaya Mamaya tampil di kolom Mamaya, terpisah dari Semarang dan Pare.",
      "Pengeluaran bernota yang dicatat dari laci shift ikut mengurangi laci Semarang.",
    ],
  },
  {
    title: "Yang tetap ikut Semarang",
    items: [
      "Pengadaan dan bahan baku memakai unit \"Haengbocake Semarang\".",
      "Akses kasir: kasir yang ditugaskan di Semarang otomatis bisa memakai POS Mamaya.",
    ],
  },
  {
    title: "Yang terpisah dari Semarang",
    items: [
      "Katalog, stok, opname, diskon, struk, dan insight. Opname stok Mamaya dilakukan terpisah di menu Stok, bukan saat buka/tutup shift.",
    ],
  },
];

/**
 * Tombol + pop-up penjelasan alur keuangan POS Mamaya House. Hanya dipasang di /posmamaya (lihat
 * `PosOutletSwitch` untuk pemasangan di top bar). Isinya menjelaskan aturan di `ledger_account_id` (migrasi 273).
 */
export function PosMamayaFlowDialog({ basePath }: { basePath: string }) {
  const [open, setOpen] = useState(false);
  if (basePath !== "/posmamaya") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="size-9 rounded-full border border-border bg-card text-foreground inline-flex items-center justify-center shrink-0 hover:bg-muted"
        aria-label="Alur keuangan POS Mamaya"
        title="Alur keuangan POS Mamaya"
      >
        <Info size={16} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Alur keuangan POS Mamaya House</DialogTitle>
            <DialogDescription>
              Katalog dan stok Mamaya terpisah, tetapi uang, shift, dan laci menyatu dengan Haengbo Semarang.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {SECTIONS.map((s) => (
              <section key={s.title} className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {s.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
