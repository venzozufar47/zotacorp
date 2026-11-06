import { cn } from "@/lib/utils";
import {
  agoLabel,
  STATUS_TONE,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketQueueSummary,
} from "@/lib/tickets/types";

/**
 * Baris ringkas read-only untuk antrean sesama cabang: karyawan melihat tiket aktif rekan sekantor tanpa
 * deskripsi, catatan, foto, atau tombol aksi (hanya pembuat, atasan, dan owner yang bisa menindaklanjuti, lihat
 * TicketCard). Datanya sudah ringkas lewat `TicketQueueSummary`, jadi tidak ada field detail yang bisa ikut tampil.
 */
export function BranchQueueCard({ ticket }: { ticket: TicketQueueSummary }) {
  return (
    <div className="space-y-1 px-4 py-3">
      <div className="flex items-start gap-2">
        {ticket.priority === "urgent" && (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" title="Mendesak" aria-label="Mendesak" />
        )}
        <p className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold leading-snug">{ticket.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight",
            STATUS_TONE[ticket.status]
          )}
        >
          {TICKET_STATUS_LABELS[ticket.status]}
        </span>
        <span>{TICKET_CATEGORY_LABELS[ticket.category]}</span>
        <span className="truncate">{ticket.createdByName}</span>
        <span>{agoLabel(ticket.createdAt)}</span>
      </div>
    </div>
  );
}
