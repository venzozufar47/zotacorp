"use client";

import { useState } from "react";
import type { PendingPesanan } from "@/lib/actions/pos-pesanan.actions";
import type { CakePickupOrder, CakePickupPaymentMethod } from "@/lib/actions/pos-cake-pickup.actions";
import type { PosProduct } from "@/lib/actions/pos.actions";
import type { PosAuthorizerRef } from "@/lib/pos-pin-format";
import type { ReceiptData } from "@/lib/pos/receipt";
import { autoPrintReceipt, type ReceiptContext } from "@/lib/pos/receipt-flow";
import { CakePickupList } from "./CakePickupList";
import { PesananList } from "./PesananList";
import { ReceiptSuccessDialog } from "./ReceiptSuccessDialog";

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
      {/* Cake didahulukan: customer-nya sedang berdiri di konter, sementara pesanan tertunda bisa menunggu. */}
      <div className="max-w-3xl mx-auto px-3 sm:px-5 py-5 space-y-6">
        <CakePickupList
          pickups={pickups}
          paymentMethods={paymentMethods}
          authorizers={cakeAuthorizers}
          receiptCtx={ctx}
          onReceipt={onReceipt}
        />
        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">Pesanan tertunda</h2>
          <PesananList
            pesanan={pesanan}
            authorizers={voidAuthorizers}
            products={products}
            receiptCtx={ctx}
            onReceipt={onReceipt}
          />
        </section>
      </div>
      {lastReceipt && <ReceiptSuccessDialog data={lastReceipt} onClose={() => setLastReceipt(null)} />}
    </>
  );
}
