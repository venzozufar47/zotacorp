"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  CheckCircle2,
  ArrowUpCircle,
  X as XIcon,
  ThumbsUp,
  ThumbsDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { cn } from "@/lib/utils";
import { TicketPhotos } from "./TicketPhotos";
import {
  startTicket,
  resolveTicket,
  escalateTicket,
  cancelTicket,
  ownerDecideTicket,
} from "@/lib/actions/tickets.actions";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  ticketResolutionMs,
  formatDuration,
  type Ticket,
  type TicketViewerRole,
} from "@/lib/tickets/types";

type Context = "mine" | "queue" | "escalation";

const STATUS_TONE: Record<Ticket["status"], string> = {
  open: "bg-warning/20 text-warning border-warning",
  in_progress: "bg-accent text-[var(--teal-700)] border-[var(--teal-500)]",
  escalated: "bg-pop-pink/30 text-foreground border-foreground",
  owner_handling: "bg-primary/15 text-primary border-primary",
  resolved: "bg-success/15 text-success border-success",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function agoLabel(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
}

interface NotePrompt {
  title: string;
  required: boolean;
  run: (note: string) => Promise<{ ok: boolean; error?: string }>;
  successMsg: string;
}

export function TicketCard({
  ticket,
  viewerRole,
  context,
}: {
  ticket: Ticket;
  viewerRole: TicketViewerRole;
  context: Context;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState<NotePrompt | null>(null);
  const [note, setNote] = useState("");

  function runDirect(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string
  ) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Gagal");
      toast.success(successMsg);
      router.refresh();
    });
  }

  function confirmPrompt() {
    if (!prompt) return;
    if (prompt.required && !note.trim()) {
      toast.error("Catatan wajib diisi");
      return;
    }
    const p = prompt;
    startTransition(async () => {
      const res = await p.run(note.trim());
      if (!res.ok) return void toast.error(res.error ?? "Gagal");
      toast.success(p.successMsg);
      setPrompt(null);
      setNote("");
      router.refresh();
    });
  }

  const resMs = ticketResolutionMs(ticket);

  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm space-y-2.5">
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
        {context !== "mine" && ticket.createdByName && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <EmployeeAvatar
                size="sm"
                full_name={ticket.createdByName}
                avatar_url={ticket.createdByAvatarUrl ?? null}
                avatar_seed={ticket.createdByAvatarSeed ?? null}
              />
              {ticket.createdByName}
            </span>
          </>
        )}
        <span>·</span>
        <span>{agoLabel(ticket.createdAt)}</span>
      </div>

      {ticket.description && (
        <p className="text-[13px] leading-snug text-foreground/90 whitespace-pre-wrap">
          {ticket.description}
        </p>
      )}

      {ticket.attachments && ticket.attachments.length > 0 && (
        <TicketPhotos attachments={ticket.attachments} />
      )}

      {/* Catatan alur */}
      {ticket.escalationNote && (ticket.status === "escalated" || ticket.status === "owner_handling") && (
        <NoteLine tone="pink" label="Catatan eskalasi" text={ticket.escalationNote} />
      )}
      {ticket.ownerNote && (
        <NoteLine
          tone={ticket.ownerDecision === "rejected" ? "warn" : "info"}
          label={ticket.ownerDecision === "rejected" ? "Ditolak owner" : "Catatan owner"}
          text={ticket.ownerNote}
        />
      )}
      {ticket.status === "resolved" && (
        <div className="text-[11.5px] text-success font-medium">
          ✓ Selesai{resMs != null ? ` dalam ${formatDuration(resMs)}` : ""}
          {ticket.resolutionNote ? ` — ${ticket.resolutionNote}` : ""}
        </div>
      )}

      {/* Aksi */}
      <ActionBar
        ticket={ticket}
        viewerRole={viewerRole}
        context={context}
        pending={pending}
        onStart={() =>
          runDirect(() => startTicket(ticket.id), "Tiket mulai dikerjakan")
        }
        onResolveDirect={() =>
          setPrompt({
            title: "Tandai selesai",
            required: false,
            run: (n) => resolveTicket(ticket.id, n || undefined),
            successMsg: "Tiket selesai",
          })
        }
        onEscalate={() =>
          setPrompt({
            title: "Eskalasi ke owner",
            required: true,
            run: (n) => escalateTicket(ticket.id, n),
            successMsg: "Tiket dieskalasi ke owner",
          })
        }
        onCancel={() =>
          runDirect(() => cancelTicket(ticket.id), "Tiket dibatalkan")
        }
        onAccept={() =>
          setPrompt({
            title: "ACC eskalasi (ambil alih)",
            required: false,
            run: (n) => ownerDecideTicket(ticket.id, "accept", n || undefined),
            successMsg: "Eskalasi diterima — jadi tanggung jawab owner",
          })
        }
        onReject={() =>
          setPrompt({
            title: "Tolak eskalasi (kembalikan)",
            required: true,
            run: (n) => ownerDecideTicket(ticket.id, "reject", n),
            successMsg: "Eskalasi ditolak — dikembalikan ke Kepala Studio",
          })
        }
      />

      {/* Dialog catatan */}
      <Dialog open={prompt !== null} onOpenChange={(v) => !v && setPrompt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{prompt?.title}</DialogTitle>
          </DialogHeader>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={prompt?.required ? "Catatan (wajib)…" : "Catatan (opsional)…"}
            className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm resize-y"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrompt(null)} disabled={pending}>
              Batal
            </Button>
            <Button onClick={confirmPrompt} disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : "Konfirmasi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteLine({
  tone,
  label,
  text,
}: {
  tone: "pink" | "warn" | "info";
  label: string;
  text: string;
}) {
  const cls =
    tone === "warn"
      ? "bg-warning/15 border-warning/50"
      : tone === "pink"
        ? "bg-pop-pink/15 border-foreground/20"
        : "bg-accent border-[var(--teal-500)]/40";
  return (
    <div className={cn("rounded-lg border px-2.5 py-1.5 text-[12px]", cls)}>
      <span className="font-semibold">{label}:</span> {text}
    </div>
  );
}

function ActionBar({
  ticket,
  viewerRole,
  context,
  pending,
  onStart,
  onResolveDirect,
  onEscalate,
  onCancel,
  onAccept,
  onReject,
}: {
  ticket: Ticket;
  viewerRole: TicketViewerRole;
  context: Context;
  pending: boolean;
  onStart: () => void;
  onResolveDirect: () => void;
  onEscalate: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const s = ticket.status;
  const btns: React.ReactNode[] = [];

  if (context === "mine") {
    if (s === "open" || s === "in_progress")
      btns.push(
        <Button key="cancel" variant="ghost" size="xs" disabled={pending} onClick={onCancel}>
          <XIcon size={13} /> Batalkan
        </Button>
      );
  }

  if (context === "queue") {
    if (s === "open")
      btns.push(
        <Button key="start" size="xs" disabled={pending} onClick={onStart}>
          <Play size={13} /> Mulai
        </Button>
      );
    if (s === "open" || s === "in_progress") {
      btns.push(
        <Button key="resolve" variant="emerald" size="xs" disabled={pending} onClick={onResolveDirect}>
          <CheckCircle2 size={13} /> Selesai
        </Button>
      );
      btns.push(
        <Button key="esc" variant="outline" size="xs" disabled={pending} onClick={onEscalate}>
          <ArrowUpCircle size={13} /> Eskalasi
        </Button>
      );
    }
    if (s === "escalated")
      btns.push(
        <span key="waiting" className="text-[11px] text-muted-foreground italic">
          Menunggu keputusan owner…
        </span>
      );
    if (s === "owner_handling")
      btns.push(
        <span key="owner" className="text-[11px] text-muted-foreground italic">
          Ditangani owner
        </span>
      );
  }

  if (context === "escalation" && viewerRole === "owner") {
    if (s === "escalated") {
      btns.push(
        <Button key="acc" variant="emerald" size="xs" disabled={pending} onClick={onAccept}>
          <ThumbsUp size={13} /> ACC (ambil alih)
        </Button>
      );
      btns.push(
        <Button key="rej" variant="outline" size="xs" disabled={pending} onClick={onReject}>
          <ThumbsDown size={13} /> Tolak
        </Button>
      );
    }
    if (s === "owner_handling")
      btns.push(
        <Button key="ownres" variant="emerald" size="xs" disabled={pending} onClick={onResolveDirect}>
          <CheckCircle2 size={13} /> Tandai selesai
        </Button>
      );
  }

  if (btns.length === 0) return null;
  return <div className="flex flex-wrap items-center gap-2 pt-0.5">{btns}</div>;
}
