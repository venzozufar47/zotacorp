export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import {
  getLeaveRequestsSummary,
  getOwnerLeaveQueue,
  getOwnerRecentDecisions,
  listHaengbocakeColleagues,
  listInputableMembers,
} from "@/lib/actions/leave-requests.actions";
import { LeaveApproverPanel } from "@/components/leave/LeaveParts";
import { LEAVE_KIND_LABEL, serverNowMs } from "@/lib/leave/constants";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

/**
 * Ringkasan izin MINGGUAN untuk Owner — dibaca kapan mau, bukan didorong
 * per-pengajuan. Lihat catatan di `leave-requests.actions.ts`: ini sengaja
 * dirancang supaya Owner tidak balik jadi titik persetujuan rutin.
 */
export default async function AdminIzinPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [res, ownerQueue, ownerDecisions, colleagues, inputMembers] = await Promise.all([
    getLeaveRequestsSummary(7),
    getOwnerLeaveQueue(),
    getOwnerRecentDecisions(),
    listHaengbocakeColleagues(),
    listInputableMembers(),
  ]);
  const rows = res.ok ? res.data ?? [] : [];

  return (
    <div className="space-y-4 p-4">
      <LeaveApproverPanel
        queue={ownerQueue}
        recentDecisions={ownerDecisions}
        colleagues={colleagues}
        inputMembers={inputMembers}
        nowMs={serverNowMs()}
      />
      <div>
        <h1 className="text-xl font-bold text-foreground">Ringkasan Izin</h1>
        <p className="text-sm text-muted-foreground">
          7 hari terakhir. Sudah ditangani atasan langsung — ini hanya untuk dipantau.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pengajuan minggu ini.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.userName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString("id-ID", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {LEAVE_KIND_LABEL[r.kind]} · {STATUS_LABEL[r.status]}
                {r.approverName ? ` oleh ${r.approverName}` : ""}
                {r.enteredByName ? ` · diinput ${r.enteredByName}` : ""}
              </p>
              <p className="mt-1">{r.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
