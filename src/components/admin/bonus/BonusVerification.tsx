import { getBonusCloseState } from "@/lib/actions/bonus.actions";
import { BonusVerificationForm } from "./BonusVerificationForm";

/** Panel verifikasi tutup buku untuk satu bulan (server component async; dibungkus Suspense oleh halaman). */
export async function BonusVerification({ period }: { period: string }) {
  const res = await getBonusCloseState(period);
  if (!res.ok) return <p className="text-sm text-destructive">Gagal memeriksa syarat tutup buku: {res.error}</p>;
  // key = bulan + waktu verifikasi supaya form ikut me-reset state lokalnya saat data server berubah.
  return <BonusVerificationForm key={`${period}|${res.state.verifiedAt ?? ""}|${res.state.checks.map((c) => (c.ok ? 1 : 0)).join("")}`} state={res.state} />;
}
