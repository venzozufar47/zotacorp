"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2 } from "lucide-react";
import { getTicketAttachmentSignedUrl } from "@/lib/actions/tickets.actions";
import { PhotoLightbox, type LightboxPhoto } from "@/components/shared/PhotoLightbox";
import type { TicketAttachment } from "@/lib/tickets/types";

/**
 * Tombol "N foto" → buka penampil foto layar penuh (PhotoLightbox: di-portal ke body, bisa zoom & geser).
 * Dulu galeri ini overlay `fixed` biasa di dalam kartu bertransform, sehingga hanya menutupi area kartu dan bukan layar.
 * URL foto (bucket privat) dibuat on-demand lewat server action signed URL (600s) saat dibuka.
 */
export function TicketPhotos({
  attachments,
  label = "foto",
}: {
  attachments: TicketAttachment[];
  /** Teks setelah jumlah, mis. "foto" atau "foto bukti selesai". */
  label?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]);

  if (!attachments || attachments.length === 0) return null;

  async function openGallery() {
    if (photos.length > 0) return setIndex(0);
    setLoading(true);
    const out: LightboxPhoto[] = [];
    for (const a of attachments) {
      const res = await getTicketAttachmentSignedUrl(a.path);
      if (res.ok) out.push({ url: res.data!.url, title: `Foto ${out.length + 1} dari ${attachments.length}` });
    }
    setLoading(false);
    if (out.length === 0) return void toast.error("Gagal memuat foto.");
    setPhotos(out);
    setIndex(0);
  }

  return (
    <>
      <button
        type="button"
        onClick={openGallery}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-primary hover:underline disabled:opacity-60"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} {attachments.length} {label}
      </button>

      <PhotoLightbox photos={photos} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />
    </>
  );
}
