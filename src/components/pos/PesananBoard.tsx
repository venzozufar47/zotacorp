"use client";

import { useState, type ReactNode } from "react";
import { CakeSlice, Clock } from "lucide-react";
import type { PendingPesanan } from "@/lib/actions/pos-pesanan.actions";
import type { CakePickupOrder, CakePickupPaymentMethod } from "@/lib/actions/pos-cake-pickup.actions";
import type { PosProduct } from "@/lib/actions/pos.actions";
import type { PosAuthorizerRef } from "@/lib/pos-pin-format";
import type { ReceiptData } from "@/lib/pos/receipt";
import { autoPrintReceipt, type ReceiptContext } from "@/lib/pos/receipt-flow";
import { CakePickupList } from "./CakePickupList";
import { PesananList } from "./PesananList";
import { ReceiptSuccessDialog } from "./ReceiptSuccessDialog";

/** Satu kolom: judul + jumlah tetap di atas, isi scroll sendiri di lg+ (di layar sempit mengalir biasa). */
function Column({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col lg:rounded-2xl lg:border lg:border-border lg:bg-muted/30">
      <div className="mb-2 flex shrink-0 items-center gap-2 text-foreground lg:mb-0 lg:border-b lg:border-border lg:px-3 lg:py-2.5">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        {count > 0 && <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>}
      </div>
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:p-2">{children}</div>
    </section>
  );
}

/**
 * Isi halaman Pesanan: serah terima custom cake dan pesanan tertunda. Memegang satu dialog struk bersama, supaya setelah
 * pesanan diselesaikan atau kue diserahkan kasir tetap bisa mencetak struk (otomatis bila diaktifkan di perangkat, atau
 * lewat tombol Cetak Struk), sama seperti checkout POS biasa. Dialognya hidup di sini karena daftar di bawahnya
 * dirender ulang (bahkan menjadi kosong) setelah halaman di-refresh.
 */
export function PesananBoard({
  pickups,
  paymentMethods,
  cakeAuthorizers,
  pesanan,
  voidAuthorizers,
  products,
  receipt,
}: {
  pickups: CakePickupOrder[];
  paymentMethods: CakePickupPaymentMethod[];
  cakeAuthorizers: PosAuthorizerRef[];
  pesanan: PendingPesanan[];
  voidAuthorizers: PosAuthorizerRef[];
  products: PosProduct[];
  receipt: ReceiptContext;
}) {
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  // Sistem struk dimatikan untuk rekening ini: semua afordance cetak hilang (sama seperti di kasir).
  const ctx = receipt.content.enabled ? receipt : null;

  function onReceipt(data: ReceiptData) {
    autoPrintReceipt(data);
    setLastReceipt(data);
  }

  return (
    <>
      {/*
        Dua kolom di tablet landscape (lg+), masing-masing scroll sendiri dengan judul tetap. Di layar sempit ditumpuk
        dan halaman scroll biasa. Cake di kiri: customer-nya sedang berdiri di konter, pesanan tertunda bisa menunggu.
      */}
      <div className="mx-auto max-w-3xl space-y-6 px-3 py-5 sm:px-5 lg:grid lg:h-full lg:max-w-none lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-5 lg:py-4">
        <Column icon={<CakeSlice size={16} />} title="Custom cake siap diambil" count={pickups.length}>
          <CakePickupList
            hideHeader
            pickups={pickups}
            paymentMethods={paymentMethods}
            authorizers={cakeAuthorizers}
            receiptCtx={ctx}
            onReceipt={onReceipt}
          />
        </Column>
        <Column icon={<Clock size={16} />} title="Pesanan tertunda" count={pesanan.length}>
          <PesananList
            pesanan={pesanan}
            authorizers={voidAuthorizers}
            products={products}
            receiptCtx={ctx}
            onReceipt={onReceipt}
          />
        </Column>
      </div>
      {lastReceipt && <ReceiptSuccessDialog data={lastReceipt} onClose={() => setLastReceipt(null)} />}
    </>
  );
}
