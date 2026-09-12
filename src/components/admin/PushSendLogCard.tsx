"use client";

import { AlertTriangle, CheckCircle2, XCircle, History } from "lucide-react";
import type { PushSendLogRow } from "@/lib/actions/push.actions";

/**
 * Recent push send attempts, admin-only — so a failure (VAPID not
 * configured, zero recipients subscribed, every endpoint gone stale) is
 * visible here instead of only in Vercel server logs that most admins
 * never look at.
 */
export function PushSendLogCard({ initialRows }: { initialRows: PushSendLogRow[] }) {
  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0 bg-quaternary">
          <History size={18} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg">
            Riwayat pengiriman notifikasi
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
            30 percobaan kirim push terakhir (semua jenis notifikasi).
            &ldquo;0 device&rdquo; berarti tidak ada penerima yang aktifkan notifikasi.
          </p>
        </div>
      </div>

      {initialRows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Belum ada percobaan kirim notifikasi.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-muted/20 overflow-hidden">
          {initialRows.map((r) => {
            const failed = !r.configured || r.targetedCount === 0 || r.deliveredCount === 0;
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="shrink-0">
                  {!r.configured ? (
                    <AlertTriangle size={16} className="text-destructive" />
                  ) : failed ? (
                    <XCircle size={16} className="text-destructive" />
                  ) : (
                    <CheckCircle2 size={16} className="text-success" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {!r.configured
                      ? "Push belum dikonfigurasi di server (VAPID key)"
                      : `${r.deliveredCount}/${r.targetedCount} device berhasil${
                          r.prunedCount > 0 ? ` · ${r.prunedCount} kadaluarsa dihapus` : ""
                        }`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
