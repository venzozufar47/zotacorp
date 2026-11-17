"use client";

import { useEffect, useState } from "react";
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
  inline = false,
}: {
  attachments: TicketAttachment[];
  /** Teks setelah jumlah, mis. "foto" atau "foto bukti selesai". */
  label?: string;
  /** Muat & tampilkan thumbnail langsung (tanpa klik); ketuk thumbnail membuka penampil layar penuh. */
  inline?: boolean;
}) {
  const [index, setIndex] = useState<number | null>(null);
  // Mode inline langsung memuat saat mount, jadi mulai dari "loading" tanpa set state di efek.
  const [loading, setLoading] = useState(inline && attachments.length > 0);
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]);

  // Kunci stabil: pemanggil membuat array baru tiap render, jadi jangan bergantung pada identitas array.
  const pathsKey = (attachments ?? []).map((a) => a.path).join("|");

  useEffect(() => {
    if (!inline || !pathsKey) return;
    const paths = pathsKey.split("|");
    let cancelled = false;
    Promise.all(paths.map((p) => getTicketAttachmentSignedUrl(p))).then((results) => {
      if (cancelled) return;
      const out: LightboxPhoto[] = [];
      for (const res of results) {
        if (res.ok) out.push({ url: res.data!.url, title: `Foto ${out.length + 1} dari ${paths.length}` });
      }
      setPhotos(out);
      setLoading(false);
      if (out.length === 0) toast.error("Gagal memuat foto.");
    });
    return () => {
      cancelled = true;
    };
  }, [inline, pathsKey]);

  if (!attachments || attachments.length === 0) return null;

  if (inline) {
    return (
      <>
        {loading ? (
          <span className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Memuat {attachments.length} {label}…
          </span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <button
                key={p.url}
                type="button"
                onClick={() => setIndex(i)}
                className="overflow-hidden rounded-lg border border-border bg-muted"
                aria-label={p.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL bucket privat, bukan aset statis */}
                <img src={p.url} alt={p.title} className="h-40 w-auto max-w-full object-cover sm:h-52" />
              </button>
            ))}
          </div>
        )}
        <PhotoLightbox photos={photos} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />
      </>
    );
  }

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
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} {attachments.length} {label}
      </button>

      <PhotoLightbox photos={photos} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />
    </>
  );
}
