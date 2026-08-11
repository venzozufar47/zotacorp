import { redirect } from "next/navigation";

/**
 * Konsol Dividen & Payout sudah melebur jadi tab "Distribusi Bulanan" di
 * halaman Investor — orang, kontrak, dan bagi hasil satu alur kerja.
 *
 * Rute lama dipertahankan sebagai redirect, bukan dihapus: ia sudah
 * tersebar di bookmark dan tautan internal, dan 404 pada alur kerja
 * bulanan jauh lebih mahal daripada satu berkas tipis ini.
 *
 * `month` diteruskan supaya tautan lama ke bulan tertentu tetap mendarat
 * di bulan yang sama.
 */
export default async function DividenRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const suffix = month ? `&month=${encodeURIComponent(month)}` : "";
  redirect(`/admin/investors?tab=distribusi${suffix}`);
}
