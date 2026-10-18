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
 * Izin di sisi Owner — tab "Izin" pada halaman Kehadiran: antrean pengajuan dari karyawan tanpa
 * atasan, catat izin untuk mereka, dan ringkasan 7 hari semua pengajuan (dibaca kapan mau, bukan
 * didorong per-pengajuan — Owner sengaja tidak menjadi titik persetujuan rutin).
 */
export async function AdminLeaveSection() {
  const [res, ownerQueue, ownerDecisions, colleagues, inputMembers] = await Promise.all([
    getLeaveRequestsSummary(7),
    getOwnerLeaveQueue(),
    getOwnerRecentDecisions(),
    listHaengbocakeColleagues(),
    listInputableMembers(),
  ]);
  const rows = res.ok ? res.data ?? [] : [];

  return (
    <div className="space-y-4">
      <LeaveApproverPanel
        queue={ownerQueue}
        recentDecisions={ownerDecisions}
        colleagues={colleagues}
        inputMembers={inputMembers}
        nowMs={serverNowMs()}
      />
      <div>
        <h2 className="text-base font-bold text-foreground">Ringkasan izin</h2>
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
                    timeZone: "Asia/Jakarta",
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
