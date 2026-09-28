import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { cn } from "@/lib/utils";
import { agoLabel, STATUS_TONE } from "./TicketCard";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketQueueSummary,
} from "@/lib/tickets/types";

/**
 * Kartu ringkas read-only untuk "Antrian sesama cabang" — karyawan Yeobo
 * Space melihat tiket aktif rekan sekantor tanpa deskripsi/catatan/foto dan
 * tanpa tombol aksi (hanya pembuat/Kepala Studio/owner yang bisa
 * menindaklanjuti, lihat TicketCard). Data-nya sendiri sudah ringkas lewat
 * `TicketQueueSummary` — tidak ada field detail untuk "kelupaan" disembunyikan.
 */
export function BranchQueueCard({ ticket }: { ticket: TicketQueueSummary }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm space-y-2">
      <div className="flex items-start gap-2">
        {ticket.priority === "urgent" && (
          <span
            className="mt-1 size-2.5 rounded-full bg-destructive shrink-0"
            title="Mendesak"
          />
        )}
        <p className="font-display font-bold text-[15px] leading-snug flex-1 min-w-0">
          {ticket.title}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            STATUS_TONE[ticket.status]
          )}
        >
          {TICKET_STATUS_LABELS[ticket.status]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">{ticket.branch}</span>
        <span>·</span>
        <span>{TICKET_CATEGORY_LABELS[ticket.category]}</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <EmployeeAvatar
            size="sm"
            full_name={ticket.createdByName}
            avatar_url={ticket.createdByAvatarUrl}
            avatar_seed={ticket.createdByAvatarSeed}
          />
          {ticket.createdByName}
        </span>
        <span>·</span>
        <span>{agoLabel(ticket.createdAt)}</span>
      </div>
    </div>
  );
}
