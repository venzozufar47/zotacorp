"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { parseMoneyId } from "@/lib/utils/parse-number";
import { NumberHint } from "@/components/shared/NumberHint";
import { addShopeeTopup, deleteShopeeTopup, type ShopeeWallet } from "@/lib/actions/procurement-shopee.actions";
import { walletLabel, walletName } from "@/lib/procurement/wallet-label";

const dateLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/** Saldo Shopee cabang + tambah saldo saat menerima transferan dari owner (tanpa bukti transfer). */
export function ShopeeWalletCard({ wallet }: { wallet: ShopeeWallet }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const n = parseMoneyId(amount);
  const negative = wallet.balance < 0;

  function submit() {
    start(async () => {
      const res = await addShopeeTopup({ businessUnit: wallet.businessUnit, amount: n, note });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${walletLabel(wallet.businessUnit)} bertambah ${formatRp(n)}`);
      setAmount("");
      setNote("");
      setAdding(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm(`Hapus tambah saldo ini? ${walletLabel(wallet.businessUnit)} akan berkurang sebesar nominalnya.`)) return;
    start(async () => {
      const res = await deleteShopeeTopup(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tambah saldo dihapus");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ShoppingBag size={12} /> {walletLabel(wallet.businessUnit)}
          </p>
          <p className={cn("mt-0.5 font-display text-2xl font-extrabold tabular-nums", negative && "text-destructive")}>
            {formatRp(wallet.balance)}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            {walletName(wallet.businessUnit) === "Seabank" ? "Untuk belanja memakai saldo Seabank." : "Untuk belanja lewat Shopee."} Tambah saldo setiap menerima
            transferan dari owner.
          </p>
          {negative && (
            <p className="mt-1 text-[11.5px] font-semibold text-destructive">
              Negatif: ada belanja yang melebihi saldo. Cek apakah ada transferan owner yang belum ditambahkan.
            </p>
          )}
        </div>
        {!adding && (
          <Button type="button" size="sm" onClick={() => setAdding(true)} className="shrink-0">
            <Plus size={14} className="mr-1" /> Tambah saldo
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
          <div className="space-y-0.5">
            <Input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="Nominal transferan (Rp)"
              className="text-right text-base font-semibold tabular-nums"
            />
            <NumberHint value={amount} />
            {n > 0 && <p className="text-right text-[11px] tabular-nums text-muted-foreground">= {formatRp(n)}</p>}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" maxLength={120} />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setAdding(false);
                setAmount("");
                setNote("");
              }}
            >
              Batal
            </Button>
            <Button type="button" className="flex-1" disabled={!(n > 0) || pending} loading={pending} onClick={submit}>
              Simpan
            </Button>
          </div>
        </div>
      )}

      {wallet.topups.length > 0 && (
        <ul className="divide-y divide-border text-xs">
          {wallet.topups.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {dateLabel(t.date)}
                {t.time ? ` ${t.time}` : ""} · {t.createdByName ?? "—"}
                {t.note ? ` · ${t.note}` : ""}
              </span>
              <span className="font-semibold tabular-nums text-success">+{formatRp(t.amount)}</span>
              {t.canDelete && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(t.id)}
                  aria-label="Hapus tambah saldo"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
