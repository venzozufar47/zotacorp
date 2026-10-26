"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { createTicket, createDownTicket, type TicketFormOptions } from "@/lib/actions/tickets.actions";
import { TICKET_CATEGORY_LABELS, type TicketCategory, type TicketPriority } from "@/lib/tickets/types";

type Mode = "report" | "assign";
/** Nilai "semua karyawan cabang" pada pilihan penerima tiket ke bawah. */
const WHOLE_BRANCH = "__branch__";

/**
 * Form buat tiket + upload foto (multi). Foto di-upload langsung ke bucket privat `ticket-attachments` dari browser
 * (RLS owner-folder), path `${uid}/${uuid}.jpg` — kumpulkan path lalu kirim ke server action.
 *
 * Karyawan: melapor ke atasan di cabangnya (tiket "naik"). Owner: bisa juga menugaskan ke satu karyawan atau seluruh
 * cabang (tiket "turun"; pembuat yang mengonfirmasi selesai).
 */
export function TicketForm({ uid, options, isOwner }: { uid: string; options: TicketFormOptions; isOwner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("report");
  const [reportBranch, setReportBranch] = useState<string>(options.fileBranches[0]?.id ?? "");
  const [assignBranch, setAssignBranch] = useState<string>(options.downTargets[0]?.branch.id ?? "");
  const [assignee, setAssignee] = useState<string>(WHOLE_BRANCH);
  const [category, setCategory] = useState<TicketCategory>("kebutuhan_barang");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  const assignTarget = options.downTargets.find((t) => t.branch.id === assignBranch);

  function reset() {
    setMode("report");
    setCategory("kebutuhan_barang");
    setPriority("normal");
    setTitle("");
    setDescription("");
    setAssignee(WHOLE_BRANCH);
    setFiles([]);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imgs].slice(0, 10));
  }

  async function uploadPhotos(): Promise<string[]> {
    if (files.length === 0) return [];
    setUploading(true);
    const supabase = createSupabaseClient();
    const paths: string[] = [];
    try {
      for (const f of files) {
        const path = `${uid}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("ticket-attachments").upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
        if (error) throw error;
        paths.push(path);
      }
      return paths;
    } catch (err) {
      // best-effort cleanup of anything uploaded before the failure
      if (paths.length) void supabase.storage.from("ticket-attachments").remove(paths);
      throw err;
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (title.trim().length < 3) {
      toast.error("Judul minimal 3 karakter");
      return;
    }
    const branchId = mode === "report" ? reportBranch : assignBranch;
    if (!branchId) {
      toast.error("Pilih cabang dulu");
      return;
    }
    startTransition(async () => {
      let attachmentPaths: string[] = [];
      try {
        attachmentPaths = await uploadPhotos();
      } catch {
        toast.error("Gagal mengupload foto. Coba lagi.");
        return;
      }
      const base = { category, priority, title: title.trim(), description: description.trim(), attachmentPaths };
      const res =
        mode === "report"
          ? await createTicket({ ...base, branchId })
          : await createDownTicket({ ...base, branchId, assigneeId: assignee === WHOLE_BRANCH ? null : assignee });
      if (!res.ok) {
        // Server menolak → foto yang sudah terupload yatim.
        if (attachmentPaths.length) void createSupabaseClient().storage.from("ticket-attachments").remove(attachmentPaths);
        toast.error(res.error);
        return;
      }
      toast.success(mode === "report" ? "Tiket terkirim 🙏" : "Tiket ditugaskan");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const busy = pending || uploading;
  if (options.fileBranches.length === 0 && options.downTargets.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : !busy && setOpen(false))}>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={15} /> Buat Tiket
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "report" ? "Buat Tiket Baru" : "Tugaskan Tiket ke Bawah"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {isOwner && (
            <div role="tablist" aria-label="Jenis tiket" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  ["report", "Lapor / catat masalah"],
                  ["assign", "Tugaskan ke karyawan"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("h-8 rounded-lg text-[12.5px] font-semibold transition", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cabang">
              {mode === "report" ? (
                <Select value={reportBranch} onChange={setReportBranch}>
                  {options.fileBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select
                  value={assignBranch}
                  onChange={(v) => {
                    setAssignBranch(v);
                    setAssignee(WHOLE_BRANCH);
                  }}
                >
                  {options.downTargets.map((t) => (
                    <option key={t.branch.id} value={t.branch.id}>
                      {t.branch.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Prioritas">
              <Select value={priority} onChange={(v) => setPriority(v as TicketPriority)}>
                <option value="normal">Normal</option>
                <option value="urgent">Mendesak</option>
              </Select>
            </Field>
          </div>

          {mode === "assign" && (
            <Field label="Untuk siapa">
              <Select value={assignee} onChange={setAssignee}>
                <option value={WHOLE_BRANCH}>Seluruh karyawan cabang (yang pertama mengambil)</option>
                {(assignTarget?.employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">Penerima mengerjakan dan melampirkan foto bukti; kamu yang mengonfirmasi selesai.</p>
            </Field>
          )}

          <Field label="Kategori">
            <Select value={category} onChange={(v) => setCategory(v as TicketCategory)}>
              {(Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[]).map((c) => (
                <option key={c} value={c}>
                  {TICKET_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Judul">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "report" ? "mis. AC ruang edit mati" : "mis. Rapikan gudang bahan"}
              maxLength={160}
            />
          </Field>
          <Field label="Deskripsi (opsional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder={mode === "report" ? "Jelaskan detail masalah / kebutuhannya…" : "Jelaskan apa yang perlu dilakukan…"}
              className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm resize-y"
            />
          </Field>

          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Foto (opsional, bisa lebih dari 1)</span>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative size-16 rounded-lg border-2 border-foreground overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[i]} alt={`foto ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 grid place-items-center size-5 rounded-full bg-foreground text-background"
                    aria-label="Hapus foto"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {files.length < 10 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="grid place-items-center size-16 rounded-lg border-2 border-dashed border-foreground/40 text-muted-foreground hover:bg-muted transition"
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {uploading ? "Mengupload…" : "Mengirim…"}
              </>
            ) : mode === "report" ? (
              "Kirim tiket"
            ) : (
              "Tugaskan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-10 rounded-xl border-2 border-border bg-background px-3 text-sm">
      {children}
    </select>
  );
}
