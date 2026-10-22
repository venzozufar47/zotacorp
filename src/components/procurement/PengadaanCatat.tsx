"use client";

import { useRouter } from "next/navigation";
import { PurchaseForm } from "./PurchaseForm";
import type { PurchaseFormData } from "@/lib/actions/procurement-purchases.actions";

/** Pembungkus klien: setelah nota tersimpan, "Lihat riwayat" membuka tab Riwayat cabang yang sama. */
export function PengadaanCatat({ data }: { data: PurchaseFormData }) {
  const router = useRouter();
  return (
    <PurchaseForm
      // key: ganti cabang = form baru (bahan, vendor, draf tidak boleh bocor antar cabang).
      key={data.businessUnit}
      data={data}
      onSaved={() => router.push(`/pengadaan?tab=riwayat&bu=${encodeURIComponent(data.businessUnit)}`)}
    />
  );
}
