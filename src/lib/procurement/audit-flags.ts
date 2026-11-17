import type { PurchaseView } from "@/lib/actions/procurement-purchases.actions";

export interface AuditFlag {
  key: "foto" | "harga" | "total" | "kosong" | "detail";
  label: string;
}

/**
 * Penanda otomatis untuk membantu auditor: hanya menunjuk TEMPAT yang perlu dilihat, bukan memutuskan benar/salah.
 * Murni dan tanpa akses data: dihitung di klien dari nota yang sudah dimuat.
 */
export function auditFlags(p: PurchaseView): AuditFlag[] {
  const flags: AuditFlag[] = [];
  if (!p.receiptUrl) flags.push({ key: "foto", label: "Foto nota tidak ada" });
  if (p.lines.length === 0) {
    flags.push({ key: "kosong", label: "Tidak ada baris" });
  } else {
    const sum = p.lines.reduce((s, l) => s + l.total, 0);
    if (Math.abs(sum - p.total) > 1) flags.push({ key: "total", label: "Total nota ≠ jumlah baris" });
    const tinjau = p.lines.filter((l) => l.priceFlag === "tinjau").length;
    if (tinjau > 0) flags.push({ key: "harga", label: `${tinjau} harga janggal` });
    const incomplete = p.lines.filter(
      (l) => !l.category?.trim() || !l.description?.trim() || (l.kind === "bahan" && (!l.materialId || !l.qtyLabel))
    ).length;
    if (incomplete > 0) flags.push({ key: "detail", label: `${incomplete} baris belum lengkap` });
  }
  return flags;
}

/** Baris yang menyebabkan penanda harga/detail, untuk disorot di kartu. */
export function lineNeedsLook(l: PurchaseView["lines"][number]): boolean {
  return (
    l.priceFlag === "tinjau" ||
    !l.category?.trim() ||
    !l.description?.trim() ||
    (l.kind === "bahan" && (!l.materialId || !l.qtyLabel))
  );
}
