import { NUMBER_FORMAT_HINT, parseDecimalId } from "@/lib/utils/parse-number";

/** Petunjuk merah bila angka yang diketik melanggar aturan baku (titik = ribuan, koma = desimal). Kosong/valid: tak tampil. */
export function NumberHint({ value }: { value: string }) {
  if (!value.trim() || parseDecimalId(value) != null) return null;
  return <p className="text-[11px] font-semibold text-destructive">Format angka belum benar. {NUMBER_FORMAT_HINT}</p>;
}
