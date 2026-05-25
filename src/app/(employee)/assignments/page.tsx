export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyAssignments } from "@/lib/actions/cashflow-assignments.actions";
import { AssignmentsClient } from "@/components/admin/finance/AssignmentsClient";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

/**
 * Queue assignment untuk user non-admin (mis. kepala studio).
 * Admin meng-assign transaksi cashflow yang ambiguous ke mereka via
 * /admin/finance/assignments. User buka halaman ini untuk resolve.
 */
export default async function MyAssignmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const res = await getMyAssignments();
  if (!res.ok) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-semibold">Assignment saya</h1>
        <div className="rounded-xl border border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat: {res.error}
        </div>
      </div>
    );
  }
  const rows = res.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <RealtimeRefresher
        channel="my-assignments"
        table="cashflow_transactions"
        debounceMs={400}
      />
      <div>
        <h1 className="text-xl font-semibold">Assignment saya</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {rows.length} transaksi keuangan menunggu kamu pilihkan kategori
          & cabangnya.
        </p>
      </div>
      <AssignmentsClient rows={rows} mode="self" />
    </div>
  );
}
