"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ArrowLeftRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { parseMoneyId } from "@/lib/utils/parse-number";
import { NumberHint } from "@/components/shared/NumberHint";
import {
  deletePocketTransfer,
  listPocketTransfers,
  transferPocketMoney,
  type PocketTransferView,
} from "@/lib/actions/procurement-transfer.actions";
import type { Pocket } from "@/lib/procurement/pocket-transfers";

interface Props {
  businessUnit: string;
  /** Saldo tiap kantong sekarang; null = belum bisa dihitung. */
  balances: Record<Pocket, number | null>;
  /** Nama kantong ketiga: "Shopee" / "Seabank". */
  walletName: string;
}

const ORDER: Pocket[] = ["pengadaan", "laci", "dompet"];

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Pindahkan uang antar kantong pengadaan: pengadaan, laci, dan dompet. Riwayat terlipat di bawah form. */
export function PocketTransferButton({ businessUnit, balances, walletName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Pocket>("pengadaan");
  const [to, setTo] = useState<Pocket>("laci");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<PocketTransferView[] | null>(null);
  const [pending, start] = useTransition();
  const n = parseMoneyId(amount);
  const label = (p: Pocket) => (p === "dompet" ? walletName : p === "laci" ? "Laci" : "Pengadaan");
  const available = balances[from];
  const tooMuch = available !== null && n > available;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listPocketTransfers(businessUnit, 8).then((r) => {
      if (alive && r.ok) setHistory(r.data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [open, businessUnit]);

  function pickFrom(p: Pocket) {
    setFrom(p);
    if (p === to) setTo(ORDER.find((x) => x !== p) ?? "laci");
  }
  function pickTo(p: Pocket) {
    setTo(p);
    if (p === from) setFrom(ORDER.find((x) => x !== p) ?? "pengadaan");
  }
  function swap() {
    setFrom(to);
    setTo(from);
  }

  function submit() {
    start(async () => {
      const res = await transferPocketMoney({ businessUnit, from, to, amount: n, note });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${formatRp(n)} dipindah: ${label(from)} → ${label(to)}`);
      setAmount("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  function undo(id: string) {
    if (!confirm("Batalkan pemindahan ini? Saldo kedua kantong dikembalikan.")) return;
    start(async () => {
      const res = await deletePocketTransfer(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pemindahan dibatalkan");
      setOpen(false);
      router.refresh();
    });
  }

  const chips = (value: Pocket, onPick: (p: Pocket) => void, name: string) => (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-3 gap-1.5">
      {ORDER.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          onClick={() => onPick(p)}
          className={cn(
            "min-h-11 rounded-lg border px-1.5 py-1 text-center transition-colors",
            value === p ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"
          )}
        >
          <span className="block text-xs">{label(p)}</span>
          <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
            {balances[p] === null ? "—" : formatRp(balances[p] as number)}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowLeftRight size={14} className="mr-1" /> Pindah uang
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Pindah uang antar kantong</DialogTitle>
            <DialogDescription>Uang tetap milik cabang; hanya pindah kantong. Tidak masuk buku kas.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dari</p>
              {chips(from, pickFrom, "Kantong asal")}
            </div>
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={swap}
                aria-label="Tukar asal dan tujuan"
                className="inline-flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
              >
                <ArrowRight size={14} className="rotate-90" />
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ke</p>
              {chips(to, pickTo, "Kantong tujuan")}
            </div>

            <div className="space-y-0.5">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="Nominal (Rp)"
                aria-label="Nominal"
                className="text-right text-base font-semibold tabular-nums"
              />
              <NumberHint value={amount} />
              {tooMuch && (
                <p className="text-right text-[11px] font-semibold text-destructive">
                  Melebihi saldo {label(from)} ({formatRp(available as number)})
                </p>
              )}
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" maxLength={120} />

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={pending} onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="button" className="flex-1" disabled={!(n > 0) || tooMuch || pending} loading={pending} onClick={submit}>
                Pindahkan
              </Button>
            </div>

            {history && history.length > 0 && (
              <details className="group border-t border-border pt-2">
                <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span> Riwayat pindah uang ({history.length})
                </summary>
                <ul className="mt-1 divide-y divide-border text-xs">
                  {history.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {timeLabel(t.createdAt)} · {label(t.from)} → {label(t.to)} · {t.createdByName ?? "—"}
                        {t.note ? ` · ${t.note}` : ""}
                      </span>
                      <span className="font-semibold tabular-nums">{formatRp(t.amount)}</span>
                      {t.canDelete && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => undo(t.id)}
                          aria-label="Batalkan pemindahan"
                          className="inline-flex size-8 items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
