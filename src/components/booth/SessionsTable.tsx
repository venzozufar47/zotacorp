"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteBoothSessionPhotos } from "@/lib/actions/booth.actions";
import {
  formatBoothTime,
  type BoothSessionRow,
  type BoothSessionStatus,
} from "@/lib/booth/types";

const STATUS_LABEL: Record<BoothSessionStatus, string> = {
  registered: "Menunggu unggah",
  uploaded: "Terunggah",
  deleted: "Dihapus",
};

export function SessionsTable({ sessions }: { sessions: BoothSessionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete(s: BoothSessionRow) {
    if (
      !confirm(
        "Hapus foto sesi ini dari cloud? Tamu tidak bisa membukanya lagi. Barisnya tetap tercatat untuk laporan."
      )
    )
      return;
    start(async () => {
      const res = await deleteBoothSessionPhotos(s.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Foto sesi dihapus");
      router.refresh();
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
        Belum ada sesi foto.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
        >
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {s.thumb_url && s.status === "uploaded" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.thumb_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              {formatBoothTime(s.captured_at)} WIB · {s.device_name}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {s.event_name} · {s.template_id}
            </div>
            <div className="text-xs mt-1">
              <span
                className={
                  s.status === "uploaded"
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }
              >
                {STATUS_LABEL[s.status]}
              </span>
              {s.expires_at && s.status === "uploaded" && (
                <span className="text-muted-foreground">
                  {" "}
                  · link berlaku sampai {formatBoothTime(s.expires_at)}
                </span>
              )}
            </div>
          </div>
          {s.status !== "deleted" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onDelete(s)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive disabled:opacity-50"
              title="Hapus foto"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
