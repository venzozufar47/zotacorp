"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImageStrict, extensionFor, MAX_EDGE_DOCUMENT } from "@/lib/images/compress-image";
import { TASK_ATTACHMENT_BUCKET } from "@/lib/tasks/types";

export interface PickedPhoto {
  /** Path di bucket task-attachments (sudah terunggah). */
  path: string;
  /** Object URL lokal untuk pratinjau (tidak perlu signed URL). */
  previewUrl: string;
}

/** Hapus file yang sudah terunggah tapi batal dipakai (best-effort). */
export async function discardPickedPhotos(photos: PickedPhoto[]) {
  if (photos.length === 0) return;
  try {
    await createClient().storage.from(TASK_ATTACHMENT_BUCKET).remove(photos.map((p) => p.path));
  } catch {
    // File yatim dibersihkan GC storage (48 jam) — tidak perlu mengganggu admin.
  }
  photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
}

/**
 * Pemilih lampiran foto untuk admin (boleh lebih dari satu; kamera atau
 * galeri). Tiap foto DIKOMPRES di perangkat (WebP/JPEG, sisi terpanjang
 * 1280px) lalu langsung diunggah, jadi kegagalan terlihat per foto sebelum
 * form dikirim. Foto yang tidak bisa dikompres ditolak, bukan diunggah mentah.
 */
export function AttachmentPicker({
  photos,
  onChange,
  max,
  remaining = max,
  label = "Tambah foto",
}: {
  photos: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  /** Batas total foto baru. */
  max: number;
  /** Sisa kuota (mis. dikurangi foto lama yang sudah ada). Default = max. */
  remaining?: number;
  label?: string;
}) {
  const [busy, setBusy] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const room = Math.max(0, Math.min(max, remaining) - photos.length - busy);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).slice(0, room);
    if (files.length > room) toast.error(`Maksimal ${Math.min(max, remaining)} foto.`);
    if (selected.length === 0) return;
    setBusy((n) => n + selected.length);

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      toast.error("Sesi tidak valid.");
      setBusy((n) => n - selected.length);
      return;
    }

    const results = await Promise.all(
      selected.map(async (file): Promise<PickedPhoto | null> => {
        try {
          const compressed = await compressImageStrict(file, { maxDim: MAX_EDGE_DOCUMENT });
          const path = `${uid}/${crypto.randomUUID()}.${extensionFor(compressed)}`;
          const { error } = await supabase.storage
            .from(TASK_ATTACHMENT_BUCKET)
            .upload(path, compressed, { contentType: compressed.type, upsert: false });
          if (error) throw new Error(`Gagal mengunggah ${file.name}`);
          return { path, previewUrl: URL.createObjectURL(compressed) };
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Gagal memproses ${file.name}`);
          return null;
        }
      })
    );
    const ok = results.filter((r): r is PickedPhoto => !!r);
    setBusy((n) => n - selected.length);
    if (ok.length > 0) onChange([...photosRef.current, ...ok]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(p: PickedPhoto) {
    void discardPickedPhotos([p]);
    onChange(photos.filter((x) => x.path !== p.path));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <div key={p.path} className="relative size-20 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.previewUrl}
            alt=""
            className="size-full rounded-xl object-cover border-2 border-foreground"
          />
          <button
            type="button"
            onClick={() => remove(p)}
            aria-label="Hapus foto"
            className="absolute -top-2 -right-2 size-7 grid place-items-center rounded-full bg-foreground text-background shadow"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {Array.from({ length: busy }).map((_, i) => (
        <div
          key={`busy-${i}`}
          className="size-20 shrink-0 grid place-items-center rounded-xl border-2 border-dashed border-border bg-muted/50"
        >
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ))}
      {room > 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="size-20 shrink-0 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
        >
          <ImagePlus size={20} />
          {label}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
