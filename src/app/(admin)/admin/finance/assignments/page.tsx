export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listAllAssignments,
  listBuDefaultAssignments,
} from "@/lib/actions/cashflow-assignments.actions";
import { AssignmentsClient } from "@/components/admin/finance/AssignmentsClient";
import { BuDefaultAssigneeSection } from "@/components/admin/finance/BuDefaultAssigneeSection";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

export default async function AssignmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/admin");

  const [res, buDefaultsRes] = await Promise.all([
    listAllAssignments(),
    listBuDefaultAssignments(),
  ]);
  if (!res.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Assignment queue</h1>
        <div className="rounded-xl border border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat: {res.error}
        </div>
      </div>
    );
  }
  const rows = res.data ?? [];
  const buDefaults = buDefaultsRes.ok && buDefaultsRes.data ? buDefaultsRes.data : [];

  return (
    <div className="space-y-4">
      <RealtimeRefresher
        channel="admin-assignments"
        table="cashflow_transactions"
        debounceMs={400}
      />
      <div>
        <h1 className="text-xl font-semibold">Assignment queue</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {rows.length} transaksi menunggu — admin dapat assign ke user
          tertentu (mis. kepala studio) atau resolve sendiri.
        </p>
      </div>

      <BuDefaultAssigneeSection initial={buDefaults} />

      <AssignmentsClient rows={rows} mode="admin" />
    </div>
  );
}
