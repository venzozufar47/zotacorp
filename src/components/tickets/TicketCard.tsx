"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  ImagePlus,
  Users,
  ShieldCheck,
  Clock,
  ChevronDown,
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
import { holderLabel, OWNER_LEVEL } from "@/lib/tickets/chain-logic";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { compressImageStrict, extensionFor, MAX_EDGE_DOCUMENT } from "@/lib/images/compress-image";
import {
  startTicket,
  resolveTicket,
  escalateTicket,
  delegateTicket,
  forwardOwnerTicket,
  cancelTicket,
  ownerDecideTicket,
  confirmTicketResolution,
} from "@/lib/actions/tickets.actions";
import {
  TICKET_CATEGORY_LABELS,
  ticketStatusLabel,
  ticketResolutionMs,
  formatDuration,
  agoLabel,
  STATUS_TONE,
  needsFilerConfirmation,
  type Ticket,
  type TicketViewerRole,
} from "@/lib/tickets/types";

/**
 * mine       : tiket yang saya buat (batalkan / konfirmasi selesai)
 * assigned   : tiket 'turun' untuk saya (kerjakan; bila tidak sanggup kembalikan ke owner)
 * queue      : tiket yang sedang saya pegang sebagai penanggung jawab tingkat
 * escalation : eskalasi yang menunggu keputusan saya (ACC / tolak), atau yang sudah saya ACC (selesaikan)
 * monitor    : tiket di cabang saya yang dipegang tingkat lain (hanya pantau)
 */
export type TicketContext = "mine" | "assigned" | "queue" | "escalation" | "monitor";
type Context = TicketContext;

/** Label status berwarna. Satu gaya untuk baris daftar dan detail. */
export function StatusChip({ ticket }: { ticket: Ticket }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight",
        STATUS_TONE[ticket.status]
      )}
    >
      {ticketStatusLabel(ticket)}
    </span>
  );
}

interface NotePrompt {
  title: string;
  required: boolean;
  /** true = wajib lampirkan foto (bukti penyelesaian). */
  requirePhotos?: boolean;
  /** true = hanya meminta konfirmasi, tanpa kolom catatan. */
  confirmOnly?: boolean;
  /** Pilih satu tujuan (mis. atasan mana yang menerima eskalasi). */
  choose?: { label: string; options: { id: string; name: string }[] };
  run: (
    note: string,
    photoPaths: string[],
    target: string
  ) => Promise<{ ok: boolean; error?: string }>;
  successMsg: string;
}

export function TicketCard({
  ticket,
  viewerRole,
  context,
  mySuperiors = [],
  myTeam = [],
  embedded = false,
  showHeader = true,
}: {
  ticket: Ticket;
  viewerRole: TicketViewerRole;
  context: Context;
  /** Tanpa bingkai sendiri (dipakai di dalam baris daftar atau panel detail). */
  embedded?: boolean;
  /** false = judul dan status sudah tampil di baris di atasnya. */
  showHeader?: boolean;
  /** Atasan langsung saya di cabang tiket ini (tujuan eskalasi). */
  mySuperiors?: { id: string; name: string }[];
  /** Bawahan langsung saya di cabang tiket ini (tujuan "Teruskan" untuk tiket dari owner). */
  myTeam?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState<NotePrompt | null>(null);
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Object URL dibuat SEKALI per set file dan dilepas saat berubah/unmount —
  // membuatnya di render membocorkan satu blob per render per foto.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function closePrompt() {
    setPrompt(null);
    setNote("");
    setTarget("");
    setFiles([]);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imgs].slice(0, 10));
  }

  /** Upload langsung ke bucket privat, path ${uid}/${uuid}.jpg (policy owner-folder). */
  async function uploadPhotos(): Promise<string[]> {
    const supabase = createSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) throw new Error("Sesi habis, silakan login ulang");
    const paths: string[] = [];
    try {
      for (const f of files) {
        const c = await compressImageStrict(f, { maxDim: MAX_EDGE_DOCUMENT });
        const path = `${uid}/${crypto.randomUUID()}.${extensionFor(c)}`;
        const { error } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, c, { contentType: c.type, upsert: false });
        if (error) throw error;
        paths.push(path);
      }
      return paths;
    } catch (err) {
      if (paths.length) void supabase.storage.from("ticket-attachments").remove(paths);
      throw err;
    }
  }

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
    if (prompt.requirePhotos && files.length === 0) {
      toast.error("Foto bukti wajib dilampirkan");
      return;
    }
    if (prompt.choose && !target) {
      toast.error(prompt.choose.label);
      return;
    }
    const p = prompt;
    startTransition(async () => {
      let paths: string[] = [];
      if (p.requirePhotos) {
        setUploading(true);
        try {
          paths = await uploadPhotos();
        } catch {
          setUploading(false);
          return void toast.error("Gagal mengupload foto. Coba lagi.");
        }
        setUploading(false);
      }
      const res = await p.run(note.trim(), paths, target);
      if (!res.ok) {
        // Server menolak (mis. status berubah) → foto yang sudah terupload yatim.
        if (paths.length)
          void createSupabaseClient().storage.from("ticket-attachments").remove(paths);
        return void toast.error(res.error ?? "Gagal");
      }
      toast.success(p.successMsg);
      closePrompt();
      router.refresh();
    });
  }

  const resMs = ticketResolutionMs(ticket);
  const reportPhotos = (ticket.attachments ?? []).filter((a) => a.kind === "report");
  const resolutionPhotos = (ticket.attachments ?? []).filter((a) => a.kind === "resolution");
  // Tiket yang pernah ditolak pelapor: keterangan baru + foto baru wajib.
  const isReopened = !!ticket.disputeNote;
  // Tiket naik yang sedang di tangan owner: tidak ada atasan lagi, jadi aksinya "Teruskan", bukan "Eskalasi".
  const atOwner = ticket.direction === "up" && ticket.handlerLevel >= OWNER_LEVEL;

  return (
    <div className={cn("space-y-3", embedded ? "p-4" : "rounded-xl border border-border bg-card p-4")}>
      {showHeader ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            {ticket.priority === "urgent" && (
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-destructive" title="Mendesak" aria-label="Mendesak" />
            )}
            <h3 className="min-w-0 flex-1 break-words font-display text-base font-bold leading-snug">{ticket.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <StatusChip ticket={ticket} />
            <span className="font-semibold text-foreground">{ticket.branchLabel ?? ticket.branch}</span>
            <span>·</span>
            <span>{TICKET_CATEGORY_LABELS[ticket.category]}</span>
            {context !== "mine" && ticket.createdByName && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <EmployeeAvatar
                    size="sm" className="h-11"
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
        </div>
      ) : null}

      {ticket.direction === "down" && (
        <p className="text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Dari owner</span>{" "}
          Untuk {ticket.assigneeName ?? "seluruh cabang (belum diambil)"}
          {ticket.delegatedFromName ? `, diteruskan oleh ${ticket.delegatedFromName}` : ""}
        </p>
      )}

      {ticket.description && (
        <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground/90">{ticket.description}</p>
      )}

      {reportPhotos.length > 0 && (
        <Fold title={`Foto laporan (${reportPhotos.length})`}>
          <TicketPhotos attachments={reportPhotos} />
        </Fold>
      )}

      {/* Catatan alur */}
      {ticket.escalationNote && (ticket.status === "escalated" || ticket.status === "owner_handling") && (
        <NoteLine tone="pink" label="Catatan eskalasi" text={ticket.escalationNote} />
      )}
      {ticket.ownerNote && (
        <NoteLine
          tone={ticket.ownerDecision === "rejected" ? "warn" : "info"}
          label={ticket.ownerDecision === "rejected" ? "Ditolak atasan" : "Catatan atasan"}
          text={ticket.ownerNote}
        />
      )}
      {ticket.disputeNote && ticket.status === "in_progress" && (
        <NoteLine tone="warn" label="Belum beres (dari pelapor)" text={ticket.disputeNote} />
      )}
      {ticket.status === "resolved" && (
        <div className="space-y-1 text-xs">
          <p className="flex items-start gap-1.5 font-medium text-success">
            <CheckCircle2 size={14} className="mt-px shrink-0" aria-hidden />
            <span className="break-words">
              Selesai{resMs != null ? ` dalam ${formatDuration(resMs)}` : ""}
              {ticket.resolutionNote ? `. ${ticket.resolutionNote}` : ""}
            </span>
          </p>
          {(resolutionPhotos.length > 0 || (ticket.verification && ticket.verification.length > 0)) && (
            <Fold title="Bukti dan verifikasi">
              <div className="space-y-2">
              {resolutionPhotos.length > 0 && <TicketPhotos attachments={resolutionPhotos} label="foto bukti selesai" />}
              {ticket.verification && ticket.verification.length > 0 && (
                <p className="flex items-start gap-1.5 text-foreground/80">
                  <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden />
                  <span>
                    Verifikasi:{" "}
                    {ticket.verification
                      .map((v) => `${v.name} ${v.status === "verified" ? "(sudah)" : v.status === "rejected" ? "(menolak)" : "(menunggu)"}`)
                      .join(", ")}
                  </span>
                </p>
              )}
              </div>
            </Fold>
          )}
          {ticket.confirmedAt ? (
            <p className="flex items-center gap-1.5 text-success/80">
              <CheckCircle2 size={14} aria-hidden />
              {ticket.confirmedBy ? "Dikonfirmasi pelapor" : "Dikonfirmasi otomatis (tidak ada respons 7 hari)"}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-warning">
              <Clock size={14} aria-hidden />
              Menunggu konfirmasi pelapor
            </p>
          )}
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
            title: isReopened ? "Tandai selesai (perbaikan ulang)" : "Tandai selesai",
            required: isReopened,
            requirePhotos: true,
            run: (n, paths) => resolveTicket(ticket.id, n || undefined, paths),
            successMsg: "Tiket selesai",
          })
        }
        onEscalate={() =>
          setPrompt({
            title: ticket.direction === "down" ? "Kembalikan ke owner" : "Eskalasi ke atasan",
            required: true,
            choose:
              ticket.direction !== "down" && mySuperiors.length > 1
                ? { label: "Pilih atasan tujuan eskalasi", options: mySuperiors }
                : undefined,
            run: (n, _p, to) => escalateTicket(ticket.id, n, to || null),
            successMsg: ticket.direction === "down" ? "Tiket dikembalikan ke owner" : "Tiket dieskalasi ke atasan",
          })
        }
        atOwner={atOwner}
        canDelegate={(ticket.direction === "down" || atOwner) && myTeam.length > 0}
        onDelegate={() =>
          setPrompt({
            title: atOwner ? "Teruskan ke koordinator cabang" : "Teruskan ke anggota tim",
            required: false,
            choose: { label: atOwner ? "Pilih koordinator tujuan" : "Pilih anggota tim tujuan", options: myTeam },
            run: (n, _p, to) => (atOwner ? forwardOwnerTicket(ticket.id, n, to) : delegateTicket(ticket.id, n, to)),
            successMsg: atOwner ? "Tiket diteruskan ke koordinator" : "Tiket diteruskan ke anggota tim",
          })
        }
        onCancel={() =>
          setPrompt({
            title: "Batalkan tiket ini?",
            required: false,
            confirmOnly: true,
            run: () => cancelTicket(ticket.id),
            successMsg: "Tiket dibatalkan",
          })
        }
        onAccept={() =>
          setPrompt({
            title: "ACC eskalasi (ambil alih)",
            required: false,
            run: (n) => ownerDecideTicket(ticket.id, "accept", n || undefined),
            successMsg: "Eskalasi diterima — jadi tanggung jawabmu",
          })
        }
        onReject={() =>
          setPrompt({
            title: "Tolak eskalasi (kembalikan)",
            required: true,
            run: (n) => ownerDecideTicket(ticket.id, "reject", n),
            successMsg: "Eskalasi ditolak — dikembalikan ke tingkat bawah",
          })
        }
        onConfirm={() =>
          runDirect(
            () => confirmTicketResolution(ticket.id, "confirm"),
            "Terima kasih — konfirmasi tercatat"
          )
        }
        onDispute={() =>
          setPrompt({
            title: "Belum beres — buka kembali tiket",
            required: true,
            run: (n) => confirmTicketResolution(ticket.id, "dispute", n),
            successMsg: "Tiket dibuka kembali untuk ditindaklanjuti",
          })
        }
      />

      {/* Dialog catatan */}
      <Dialog open={prompt !== null} onOpenChange={(v) => !v && !uploading && !pending && closePrompt()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8">{prompt?.title}</DialogTitle>
          </DialogHeader>
          {!prompt?.confirmOnly && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={
                prompt?.requirePhotos && prompt.required
                  ? "Keterangan baru (wajib)…"
                  : prompt?.required
                    ? "Catatan (wajib)…"
                    : "Catatan (opsional)…"
              }
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y"
            />
          )}
          {prompt?.choose && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Kirim ke</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">{prompt.choose.label}</option>
                {prompt.choose.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {prompt?.requirePhotos && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Foto bukti (wajib, bisa lebih dari 1)
              </span>
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className="relative size-16 rounded-lg border border-border overflow-hidden bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previews[i]}
                      alt={`foto ${i + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 grid place-items-center size-5 rounded-full bg-foreground text-background"
                      aria-label="Hapus foto"
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ))}
                {files.length < 10 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="grid place-items-center size-16 rounded-lg border border-dashed border-foreground/40 text-muted-foreground hover:bg-muted transition"
                  >
                    <ImagePlus size={20} />
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePrompt} disabled={pending}>
              Batal
            </Button>
            <Button onClick={confirmPrompt} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {uploading ? "Mengupload…" : ""}
                </>
              ) : (
                "Konfirmasi"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Bagian detail yang jarang dibaca: dilipat, terbuka saat diketuk. */
function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown size={14} className="-rotate-90 transition-transform group-open:rotate-0" aria-hidden />
        {title}
      </summary>
      <div className="pt-1">{children}</div>
    </details>
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
    <div className={cn("rounded-lg border px-2.5 py-1.5 text-xs", cls)}>
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
  atOwner,
  canDelegate,
  onDelegate,
  onCancel,
  onAccept,
  onReject,
  onConfirm,
  onDispute,
}: {
  ticket: Ticket;
  viewerRole: TicketViewerRole;
  context: Context;
  pending: boolean;
  onStart: () => void;
  onResolveDirect: () => void;
  onEscalate: () => void;
  /** Tiket naik yang dipegang owner: puncak hierarki, jadi tidak ada eskalasi — hanya "Teruskan". */
  atOwner: boolean;
  canDelegate: boolean;
  onDelegate: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onReject: () => void;
  onConfirm: () => void;
  onDispute: () => void;
}) {
  const s = ticket.status;
  const btns: React.ReactNode[] = [];
  /** Aksi jarang dipakai: dilipat di bawah "Opsi lain". */
  const more: React.ReactNode[] = [];
  const here = holderLabel(ticket.handlerLevel, ticket.handlerName);

  if (context === "mine") {
    if (s === "open" || s === "in_progress")
      more.push(
        <Button key="cancel" variant="ghost" size="sm" className="h-11" disabled={pending} onClick={onCancel}>
          <XIcon size={13} /> Batalkan
        </Button>
      );
    if (needsFilerConfirmation(ticket)) {
      btns.push(
        <Button key="confirm" variant="emerald" size="sm" className="h-11" disabled={pending} onClick={onConfirm}>
          <CheckCircle2 size={13} /> Konfirmasi selesai
        </Button>
      );
      btns.push(
        <Button key="dispute" variant="outline" size="sm" className="h-11" disabled={pending} onClick={onDispute}>
          <ThumbsDown size={13} /> Belum beres
        </Button>
      );
    }
    // Tiket yang saya buat tapi dipegang orang lain: beri tahu posisinya.
    if (s === "escalated" || s === "owner_handling")
      btns.push(
        <span key="where" className="text-[11px] text-muted-foreground italic">
          {s === "escalated" ? `Menunggu keputusan ${here}…` : `Ditangani ${here}`}
        </span>
      );
    if ((s === "open" || s === "in_progress") && ticket.direction === "up" && viewerRole === "filer")
      btns.push(
        <span key="where2" className="text-[11px] text-muted-foreground italic">
          Ada di {here}
        </span>
      );
  }

  // Aksi penanggung jawab: tiket yang sedang saya pegang ("queue") atau tugas 'turun' untuk saya ("assigned").
  if (context === "queue" || context === "assigned") {
    if (s === "open")
      btns.push(
        <Button key="start" size="sm" className="h-11" disabled={pending} onClick={onStart}>
          <Play size={13} /> {context === "assigned" && !ticket.assigneeId ? "Ambil" : "Mulai"}
        </Button>
      );
    if (s === "open" || s === "in_progress") {
      btns.push(
        <Button key="resolve" variant="emerald" size="sm" className="h-11" disabled={pending} onClick={onResolveDirect}>
          <CheckCircle2 size={13} /> Selesai
        </Button>
      );
      if (!atOwner)
        more.push(
          <Button key="esc" variant="outline" size="sm" className="h-11" disabled={pending} onClick={onEscalate}>
            <ArrowUpCircle size={13} /> {ticket.direction === "down" ? "Kembalikan ke owner" : "Eskalasi"}
          </Button>
        );
      if (canDelegate)
        more.push(
          <Button key="delegate" variant="outline" size="sm" className="h-11" disabled={pending} onClick={onDelegate}>
            <Users size={13} /> Teruskan
          </Button>
        );
    }
    if (s === "escalated")
      btns.push(
        <span key="waiting" className="text-[11px] text-muted-foreground italic">
          Menunggu keputusan {here}…
        </span>
      );
    if (s === "owner_handling")
      btns.push(
        <span key="owner" className="text-[11px] text-muted-foreground italic">
          Ditangani {here}
        </span>
      );
    if (s === "resolved" && ticket.direction === "down")
      btns.push(
        <span key="resolved-down" className="text-[11px] text-muted-foreground italic">
          Menunggu konfirmasi owner
        </span>
      );
  }

  // Read-only: memantau tiket yang dipegang tingkat lain di cabang saya.
  if (context === "monitor") {
    if (s === "open")
      btns.push(
        <span key="m-open" className="text-[11px] text-muted-foreground italic">
          Menunggu {here} memulai…
        </span>
      );
    if (s === "in_progress")
      btns.push(
        <span key="m-prog" className="text-[11px] text-muted-foreground italic">
          Sedang dikerjakan {here}…
        </span>
      );
    if (s === "escalated")
      btns.push(
        <span key="m-esc" className="text-[11px] text-muted-foreground italic">
          Menunggu keputusan {here}…
        </span>
      );
    if (s === "owner_handling")
      btns.push(
        <span key="m-own" className="text-[11px] text-muted-foreground italic">
          Ditangani {here}
        </span>
      );
  }

  // Keputusan atas eskalasi untuk tingkat yang menerimanya (owner maupun tingkat menengah).
  if (context === "escalation") {
    if (s === "escalated") {
      btns.push(
        <Button key="acc" variant="emerald" size="sm" className="h-11" disabled={pending} onClick={onAccept}>
          <ThumbsUp size={13} /> ACC (ambil alih)
        </Button>
      );
      btns.push(
        <Button key="rej" variant="outline" size="sm" className="h-11" disabled={pending} onClick={onReject}>
          <ThumbsDown size={13} /> Tolak
        </Button>
      );
    }
    if (s === "owner_handling")
      btns.push(
        <Button key="ownres" variant="emerald" size="sm" className="h-11" disabled={pending} onClick={onResolveDirect}>
          <CheckCircle2 size={13} /> Tandai selesai
        </Button>
      );
  }

  if (btns.length === 0 && more.length === 0) return null;
  return (
    <div className="space-y-1 pt-0.5">
      {btns.length > 0 && <div className="flex flex-wrap items-center gap-2">{btns}</div>}
      {more.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
            Opsi lain
            <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="flex flex-wrap gap-2 pt-1">{more}</div>
        </details>
      )}
    </div>
  );
}
