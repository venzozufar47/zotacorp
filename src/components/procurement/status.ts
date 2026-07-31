/**
 * Label + gaya status pengadaan. Dipisah dari `calc.ts` supaya modul
 * matematika tetap bebas presentasi.
 */

import type {
  ProcurementStatus,
  SafetyStockBasis,
  Freshness,
  EoqError,
} from "@/lib/procurement/calc";

export const STATUS_LABEL: Record<ProcurementStatus, string> = {
  belum_opname: "Belum opname",
  habis: "Habis",
  kritis: "Kritis",
  menipis: "Menipis",
  aman: "Aman",
  overstock: "Overstock",
};

export const STATUS_CLASS: Record<ProcurementStatus, string> = {
  belum_opname: "border-dashed border-border text-muted-foreground",
  habis: "border-foreground bg-destructive text-white",
  kritis: "border-foreground bg-destructive/60",
  menipis: "border-foreground bg-warning",
  aman: "border-foreground bg-success/30",
  overstock: "border-foreground bg-tertiary/40",
};

/** Urutan chip filter — paling mendesak dulu. */
export const STATUS_FILTERS: ProcurementStatus[] = [
  "habis",
  "kritis",
  "menipis",
  "belum_opname",
  "aman",
  "overstock",
];

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  segar: "segar",
  perlu_opname: "perlu opname",
  basi: "basi",
};

export const FRESHNESS_CLASS: Record<Freshness, string> = {
  segar: "text-success",
  perlu_opname: "text-warning",
  basi: "text-destructive",
};

/** Penjelasan dasar perhitungan safety stock — WAJIB ditampilkan kalau
 *  "proxy", supaya staf tahu angkanya berdiri di atas asumsi. */
export function ssBasisNote(basis: SafetyStockBasis, cvPercent: number): string | null {
  switch (basis) {
    case "proxy":
      return `Safety stock memakai asumsi variasi pemakaian ±${cvPercent}% karena data variasi belum diisi. Isi "variasi pemakaian harian" untuk hasil yang lebih akurat.`;
    case "demand":
      return "Variasi lead time belum diisi — dianggap lead time selalu tepat.";
    case "leadtime":
      return "Variasi pemakaian harian belum diisi.";
    case "none":
      return "Pemakaian harian belum diisi, jadi belum ada safety stock.";
    default:
      return null;
  }
}

export function eoqErrorNote(err: EoqError): string | null {
  switch (err) {
    case "no_usage":
      return "EOQ butuh pemakaian harian.";
    case "no_ordering_cost":
      return "EOQ butuh biaya sekali pesan (diatur superadmin). Sementara pakai target periodic review.";
    case "no_cost":
      return "EOQ butuh harga beli bahan.";
    default:
      return null;
  }
}
