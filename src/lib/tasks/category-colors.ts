/**
 * Warna penanda kategori tugas (khusus tampilan admin). Sengaja memakai hue
 * di luar warna status (kuning/hijau/merah/biru primer) supaya kategori dan
 * status tidak tertukar. Kelas ditulis utuh agar terdeteksi Tailwind.
 *
 * Warna ditentukan oleh URUTAN kategori (sort_order) — stabil selama urutan
 * tidak berubah, tanpa kolom warna di database.
 */
export interface CategoryStyle {
  /** Titik/penanda kecil. */
  dot: string;
  /** Garis tebal di tepi kiri label baris. */
  bar: string;
  /** Latar lembut untuk pil kategori. */
  soft: string;
}

const PALETTE: CategoryStyle[] = [
  { dot: "bg-sky-500", bar: "border-l-sky-500", soft: "bg-sky-500/15" },
  { dot: "bg-violet-500", bar: "border-l-violet-500", soft: "bg-violet-500/15" },
  { dot: "bg-teal-500", bar: "border-l-teal-500", soft: "bg-teal-500/15" },
  { dot: "bg-rose-500", bar: "border-l-rose-500", soft: "bg-rose-500/15" },
  { dot: "bg-fuchsia-500", bar: "border-l-fuchsia-500", soft: "bg-fuchsia-500/15" },
  { dot: "bg-indigo-500", bar: "border-l-indigo-500", soft: "bg-indigo-500/15" },
  { dot: "bg-lime-500", bar: "border-l-lime-500", soft: "bg-lime-500/15" },
  { dot: "bg-cyan-500", bar: "border-l-cyan-500", soft: "bg-cyan-500/15" },
];

const NEUTRAL: CategoryStyle = {
  dot: "bg-muted-foreground/40",
  bar: "border-l-border",
  soft: "bg-muted",
};

/** Gaya kategori `id` di antara `categories` (urut sort_order); null/tak dikenal = netral. */
export function categoryStyle(
  categories: { id: string }[],
  id: string | null
): CategoryStyle {
  if (!id) return NEUTRAL;
  const idx = categories.findIndex((c) => c.id === id);
  return idx < 0 ? NEUTRAL : PALETTE[idx % PALETTE.length];
}
