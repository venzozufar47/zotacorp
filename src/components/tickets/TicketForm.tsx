"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { createTicket } from "@/lib/actions/tickets.actions";
import {
  TICKET_BRANCHES,
  TICKET_CATEGORY_LABELS,
  type TicketBranch,
  type TicketCategory,
  type TicketPriority,
} from "@/lib/tickets/types";

/**
 * Form buat tiket + upload foto (multi). Foto di-upload langsung ke bucket
 * privat `ticket-attachments` dari browser (RLS owner-folder), path
 * `${uid}/${uuid}.jpg` — kumpulkan path lalu kirim ke createTicket.
 */
export function TicketForm({ uid }: { uid: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [branch, setBranch] = useState<TicketBranch>("Tlogosari");
  const [category, setCategory] = useState<TicketCategory>("kebutuhan_barang");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  function reset() {
    setBranch("Tlogosari");
    setCategory("kebutuhan_barang");
    setPriority("normal");
    setTitle("");
    setDescription("");
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
        const { error } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
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
    startTransition(async () => {
      let attachmentPaths: string[] = [];
      try {
        attachmentPaths = await uploadPhotos();
      } catch {
        toast.error("Gagal mengupload foto. Coba lagi.");
        return;
      }
      const res = await createTicket({
        branch,
        category,
        priority,
        title: title.trim(),
        description: description.trim(),
        attachmentPaths,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tiket terkirim ke Kepala Studio 🙏");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const busy = pending || uploading;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : (!busy && setOpen(false)))}>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={15} /> Buat Tiket
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat Tiket Baru</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cabang studio">
              <Select value={branch} onChange={(v) => setBranch(v as TicketBranch)}>
                {TICKET_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <Field label="Prioritas">
              <Select value={priority} onChange={(v) => setPriority(v as TicketPriority)}>
                <option value="normal">Normal</option>
                <option value="urgent">Mendesak</option>
              </Select>
            </Field>
          </div>
          <Field label="Kategori">
            <Select value={category} onChange={(v) => setCategory(v as TicketCategory)}>
              {(Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[]).map((c) => (
                <option key={c} value={c}>{TICKET_CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Judul">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. AC ruang edit mati"
              maxLength={160}
            />
          </Field>
          <Field label="Deskripsi (opsional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Jelaskan detail masalah / kebutuhannya…"
              className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm resize-y"
            />
          </Field>

          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Foto (opsional, bisa lebih dari 1)
            </span>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="relative size-16 rounded-lg border-2 border-foreground overflow-hidden bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(f)}
                    alt={`foto ${i + 1}`}
                    className="size-full object-cover"
                  />
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
              onChange={(e) => addFiles(e.target.files)}
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
            ) : (
              "Kirim tiket"
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
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 rounded-xl border-2 border-border bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}
