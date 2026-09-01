export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import { ServiceLevelAdminClient } from "@/components/admin/ServiceLevelAdminClient";
import {
  getServiceLevel,
  getServiceLevelSummary,
  listServiceLevelOwners,
  listServiceLevelExclusions,
  listServiceLevelSkus,
} from "@/lib/actions/pos-service-level.actions";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";

/**
 * Pusat pengaturan + pemantauan metrik Service Level.
 *
 * Halaman tersendiri, bukan kartu di /admin/settings: manajemen
 * pengecualian per-SKU ber-tanggal bukan kartu kecil, dan superadmin
 * butuh tempat melihat angkanya tanpa harus membuka layar kasir.
 */
export default async function ServiceLevelAdminPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: accounts }, { data: employeeRows }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select(
        "id, account_name, default_branch, service_level_enabled, service_level_open_hour, service_level_close_hour, service_level_target"
      )
      .eq("pos_enabled", true)
      .eq("is_active", true)
      .order("default_branch", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .neq("role", "investor")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  const employees = (employeeRows ?? []).map((e) => ({
    id: e.id,
    name: e.full_name || e.email,
  }));

  // Satu putaran per outlet — jumlah outlet POS segelintir, jadi ini
  // masih jauh lebih murah daripada memecah halaman jadi banyak request.
  const today = jakartaDateString(new Date());
  const fromDate = jakartaDateMinusDays(today, 29); // 30 hari, sama seperti summary
  const outlets = await Promise.all(
    (accounts ?? []).map(async (a) => {
      const [summary, owners, exclusions, skus, live] = await Promise.all([
        getServiceLevelSummary(a.id, 30),
        listServiceLevelOwners(a.id),
        listServiceLevelExclusions(a.id),
        listServiceLevelSkus(a.id),
        // Rincian penyebab (worst SKU + per-hari) sama seperti yang
        // dilihat kasir di POS — dihitung LIVE, jadi hanya untuk outlet
        // yang aktif supaya tidak buang waktu query di outlet mati.
        a.service_level_enabled
          ? getServiceLevel(a.id, { fromDate, toDate: today }).catch(() => null)
          : Promise.resolve(null),
      ]);
      return {
        id: a.id,
        accountName: a.account_name,
        branch: a.default_branch,
        enabled: a.service_level_enabled,
        openHour: a.service_level_open_hour,
        closeHour: a.service_level_close_hour,
        target: a.service_level_target,
        summary: summary.ok ? (summary.data ?? null) : null,
        live: live && live.ok ? (live.data ?? null) : null,
        owners,
        exclusions,
        skus,
      };
    })
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Service Level"
        subtitle="Berapa persen produk ready stock, dirata-rata sepanjang jam buka. Target per outlet, lihat kartu masing-masing."
      />
      <ServiceLevelAdminClient outlets={outlets} employees={employees} />
    </div>
  );
}
