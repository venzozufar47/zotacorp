"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { CakeAttachmentField } from "@/lib/cake-orders/types";

interface UploadedFile {
  field: CakeAttachmentField;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string;
  fileName: string;
}

interface Props {
  field: CakeAttachmentField;
  files: UploadedFile[];
  onUploaded: (f: UploadedFile) => void;
  onRemove: (storagePath: string) => void;
}

/**
 * Inline image upload — clicking the tile opens the file picker; the
 * file uploads immediately to /api/cake-orders/upload, returning a
 * storage path. The path travels in the form's submit. Multiple
 * images per field are supported. We don't expose a delete from
 * Storage on remove; the orphan stays in 'pending/' (cleaned by a
 * sweeper later). Cheap.
 */
export function ImageDropField({ field, files, onUploaded, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const fileArr = Array.from(list);
    e.target.value = ""; // allow re-picking the same file
    setUploading(true);

    for (const file of fileArr) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("field", field);
        const res = await fetch("/api/cake-orders/upload", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json()) as
          | { ok: true; path: string; mimeType: string; sizeBytes: number }
          | { error: string };
        if (!res.ok || !("ok" in data)) {
          toast.error("error" in data ? data.error : "Gagal upload");
          continue;
        }
        const previewUrl = URL.createObjectURL(file);
        onUploaded({
          field,
          storagePath: data.path,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
          previewUrl,
          fileName: file.name,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error");
      }
    }
    setUploading(false);
  };

  return (
    <div className="mt-2 space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      <div className="flex flex-wrap gap-2">
        {files.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element
          <div
            key={f.storagePath}
            className="relative size-12 rounded-lg overflow-hidden border-2 border-foreground bg-muted"
          >
            <img
              src={f.previewUrl}
              alt={f.fileName}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(f.storagePath)}
              className="absolute top-0.5 right-0.5 size-5 rounded-full bg-foreground/80 text-background flex items-center justify-center"
              aria-label="Hapus"
            >
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="size-12 rounded-lg border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center text-muted-foreground hover:border-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Tambah foto"
        >
          {uploading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <Camera size={16} strokeWidth={2} />
              <span className="text-[10px] mt-0.5">Foto</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
