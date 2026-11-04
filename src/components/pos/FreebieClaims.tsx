"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Gift, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { listFreebieClaims, resolveFreebieClaim, type FreebieClaimRow } from "@/lib/actions/feedback.actions";

/**
 * Baris stok freebies di kartu Feedback + daftar tawaran yang menunggu kasir. Progressive disclosure: baris hanya
 * menampilkan "nama · sisa · menunggu N"; daftar tawaran (kode, jam, bintang) baru terbuka saat diketuk.
 * Stok berkurang hanya saat kasir mengetuk "Diberikan".
 */
export function FreebieClaims({
  bankAccountId,
  name,
  onHand,
  pending,
}: {
  bankAccountId: string;
  name: string;
  onHand: number;
  pending: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FreebieClaimRow[] | null>(null);
  const [busy, start] = useTransition();
  // Konfirmasi ganda: ketukan pertama hanya meminta konfirmasi di baris itu; aksi baru jalan di ketukan kedua.
  const [confirm, setConfirm] = useState<{ id: string; action: "given" | "skipped" } | null>(null);

  function load() {
    setRows(null);
    start(async () => {
      const r = await listFreebieClaims(bankAccountId);
      if (!r.ok) {
        toast.error(r.error);
        setRows([]);
      } else setRows(r.data ?? []);
    });
  }

  function resolve(id: string, action: "given" | "skipped") {
    setConfirm(null);
    start(async () => {
      const r = await resolveFreebieClaim({ bankAccountId, feedbackId: id, action });
      if (!r.ok) {
        toast.error(r.error);
        load();
        return;
      }
      setRows((cur) => (cur ?? []).filter((x) => x.id !== id));
      toast.success(action === "given" ? "Freebies diberikan, stok berkurang 1" : "Dilewati");
      router.refresh();
    });
  }

  const soldOut = onHand <= 0;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setConfirm(null);
          load();
        }}
        aria-label={`${name}: ${soldOut ? "habis" : `sisa ${onHand}`}${pending > 0 ? `, ${pending} menunggu` : ""}`}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-foreground/30 bg-card/80 px-2.5 py-0.5 text-[11px] font-semibold text-foreground"
      >
        <Gift size={12} className="shrink-0" aria-hidden />
        <span className={`tabular-nums ${soldOut ? "text-destructive" : ""}`}>{soldOut ? "Freebies habis" : `Freebies ${onHand}`}</span>
        {pending > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums leading-4 text-primary-foreground">{pending}</span>
        )}
        <ChevronRight size={12} className="shrink-0 opacity-60" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-b-2xl"
        >
          <div>
            <DialogTitle className="font-display text-base font-extrabold">{name}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              Sisa {Math.max(0, onHand)}. Cocokkan kode dengan layar pelanggan, lalu ketuk Diberikan. Tawaran berakhir tengah malam.
            </DialogDescription>
          </div>
          {rows === null ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Memuat…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Tidak ada tawaran yang menunggu.</p>
          ) : (
            <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto">
              {rows.map((r) => {
                const asking = confirm?.id === r.id ? confirm.action : null;
                return (
                  <li key={r.id} className="space-y-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg font-extrabold leading-none tracking-wider tabular-nums">{r.code}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                          {r.time}
                          <span aria-hidden>·</span>
                          <Star size={11} className="fill-current" aria-hidden />
                          {r.rating}
                        </p>
                      </div>
                      {!asking && (
                        <>
                          <Button type="button" variant="outline" className="h-11 shrink-0" disabled={busy} onClick={() => setConfirm({ id: r.id, action: "skipped" })}>
                            Lewati
                          </Button>
                          <Button type="button" className="h-11 shrink-0" disabled={busy || soldOut} onClick={() => setConfirm({ id: r.id, action: "given" })}>
                            Diberikan
                          </Button>
                        </>
                      )}
                    </div>
                    {asking && (
                      <div className="space-y-2 rounded-xl bg-muted/60 p-2.5" role="alert">
                        <p className="text-xs font-semibold leading-snug">
                          {asking === "given"
                            ? `Yakin berikan freebies untuk kode ${r.code}? Stok berkurang 1.`
                            : `Yakin lewati kode ${r.code}? Pelanggan tidak akan mendapat freebies dan tawaran hilang dari daftar.`}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => setConfirm(null)}>
                            Batal
                          </Button>
                          <Button type="button" className="h-11" disabled={busy} onClick={() => resolve(r.id, asking)}>
                            {asking === "given" ? "Ya, berikan" : "Ya, lewati"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => setOpen(false)}>
            Tutup
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
