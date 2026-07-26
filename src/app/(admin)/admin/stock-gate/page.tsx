export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getStockGateMonitor } from "@/lib/actions/stock-opname-monitor.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { StockGateMonitor } from "@/components/admin/StockGateMonitor";

/**
 * Admin — monitor gate "absen pulang" berbasis stock opname.
 *
 * Gate-nya berjalan di server tiap kali karyawan studio Yeobo Space menekan
 * absen pulang, jadi normalnya tak kasat mata. Halaman ini membuka isinya:
 * kesehatan konfigurasi (API key + mode fail-closed), status opname tiap
 * cabang hari ini (probe langsung ke API yeobospace.id — jalur yang sama
 * dengan gate asli), dan siapa saja yang hari ini terdampak.
 */
export default async function AdminStockGatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const res = await getStockGateMonitor();

  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Gate Absen Pulang"
          subtitle={`Gagal memuat monitor: ${res.error}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate Absen Pulang"
        subtitle="Karyawan studio Yeobo Space tidak bisa absen pulang sebelum stock opname cabangnya selesai. Panel ini menunjukkan sistemnya hidup dan sedang bekerja."
      />
      <StockGateMonitor data={res.data} />
    </div>
  );
}
