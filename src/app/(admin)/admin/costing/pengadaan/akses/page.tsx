export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { costingBrands } from "@/lib/costing/brands";
import {
  listProcurementAssignments,
  listEligibleProfiles,
  getProcurementSettings,
} from "@/lib/actions/procurement-admin.actions";
import { PROCUREMENT_DEFAULTS } from "@/lib/procurement/calc";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProcurementAccessManager } from "@/components/admin/costing/ProcurementAccessManager";

/** Admin: siapa yang boleh memantau pengadaan + setelan hitungannya. */
export default async function ProcurementAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [units, staffRes, candRes, settingsRes] = await Promise.all([
    listBusinessUnits(),
    listProcurementAssignments(),
    listEligibleProfiles(),
    getProcurementSettings(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Akses &amp; setelan pengadaan"
        subtitle="Tugaskan karyawan per unit bisnis, atur service level & biaya"
        action={
          <Link
            href="/admin/costing/pengadaan"
            className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold hover:bg-muted transition"
          >
            <ArrowLeft size={15} /> Papan pantau
          </Link>
        }
      />
      <ProcurementAccessManager
        brands={costingBrands(units.map((u) => u.name))}
        staff={staffRes.ok ? staffRes.data ?? [] : []}
        candidates={candRes.ok ? candRes.data ?? [] : []}
        settings={
          settingsRes.ok && settingsRes.data
            ? settingsRes.data
            : { ...PROCUREMENT_DEFAULTS }
        }
      />
    </div>
  );
}
