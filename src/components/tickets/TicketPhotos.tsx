"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, X } from "lucide-react";
import { getTicketAttachmentSignedUrl } from "@/lib/actions/tickets.actions";
import type { TicketAttachment } from "@/lib/tickets/types";

/**
 * Tombol "N foto" → buka galeri lightbox. URL foto (bucket privat) dibuat
 * on-demand lewat server action signed URL (600s) saat dibuka.
 */
export function TicketPhotos({ attachments }: { attachments: TicketAttachment[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);

  if (!attachments || attachments.length === 0) return null;

  async function openGallery() {
    setOpen(true);
    if (urls.length > 0) return;
    setLoading(true);
    const out: string[] = [];
    for (const a of attachments) {
      const res = await getTicketAttachmentSignedUrl(a.path);
      if (res.ok) out.push(res.data!.url);
    }
    setUrls(out);
    setLoading(false);
    if (out.length === 0) toast.error("Gagal memuat foto.");
  }

  return (
    <>
      <button
        type="button"
        onClick={openGallery}
        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-primary hover:underline"
      >
        <ImageIcon size={13} /> {attachments.length} foto
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-foreground/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 grid place-items-center size-10 rounded-full bg-card border-2 border-foreground"
            onClick={() => setOpen(false)}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
          <div
            className="max-w-3xl w-full max-h-[85vh] overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {loading ? (
              <div className="grid place-items-center py-16 text-white">
                <Loader2 size={26} className="animate-spin" />
              </div>
            ) : (
              urls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={u}
                  alt={`foto ${i + 1}`}
                  className="w-full rounded-xl border-2 border-foreground bg-card"
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
