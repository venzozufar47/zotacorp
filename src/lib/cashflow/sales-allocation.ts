/**
 * Alokasi otomatis sisa "Sales" Pusat ke cabang Haengbocake menurut rasio Custom Cake.
 *
 * Sisa Sales di rekening Pusat (setelah QRIS POS Pare/Semarang dipotong otomatis) pada dasarnya adalah uang Custom Cake.
 * Sebelumnya admin harus mengalokasikannya manual; selama alokasi belum seimbang, baris itu dikecualikan dari laba-rugi
 * cabang sehingga Custom Cake tidak muncul sama sekali. Kini bila belum ada alokasi manual yang seimbang, sisa itu dibagi
 * otomatis dengan rumus yang sama dengan tombol "Terapkan saran" di editor alokasi. Alokasi manual yang seimbang/terkunci
 * tetap menang. Murni (tanpa import) agar bisa diuji.
 */

/** Mulai bulan ini (sama dengan editor alokasi menampilkan saran Custom Cake). Sebelumnya tetap manual. */
export const AUTO_CAKE_ALLOCATION_FROM = "2026-06";

export const autoAllocatesCake = (monthKey: string): boolean => monthKey >= AUTO_CAKE_ALLOCATION_FROM;

export function suggestSalesSplit(netForAllocation: number, cakeSemarang: number, cakePare: number): { semarang: number; pare: number } | null {
  const total = cakeSemarang + cakePare;
  if (!(total > 0) || !(netForAllocation > 0)) return null;
  const semarang = Math.round((netForAllocation * cakeSemarang) / total);
  return { semarang, pare: Math.max(0, netForAllocation - semarang) };
}
