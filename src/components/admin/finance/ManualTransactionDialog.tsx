"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualTransaction } from "@/lib/actions/cashflow.actions";
import type { CategoryPresets } from "@/lib/cashflow/categories";

interface Account {
  id: string;
  accountName: string;
  /** Bank type drives which fields this dialog shows. Cash rekening
   *  hides Sumber/Tujuan + Detail Transaksi (only Catatan stays for
   *  free-text). */
  bank: string;
  /** When set (typically for cash rekening), the branch is inherited
   *  from the rekening and its picker is hidden. */
  defaultBranch: string | null;
}

interface Props {
  account: Account | null;
  presets: CategoryPresets;
  onOpenChange: (open: boolean) => void;
}

/**
 * Single-row transaction entry. Replaces the old "create blank
 * statement" flow — admin said they'd rather add one tx at a time
 * with the same column semantics as the lifetime table than create
 * an empty monthly bucket first. Statement bucket is auto-created
 * on submit based on the tx's date.
 */
export function ManualTransactionDialog({
  account,
  presets,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [sourceDestination, setSourceDestination] = useState("");
  const [transactionDetails, setTransactionDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [side, setSide] = useState<"debit" | "kredit">("kredit");
  const [amount, setAmount] = useState<string>("");
  const [runningBalance, setRunningBalance] = useState<string>("");
  const [category, setCategory] = useState("");
  const [branch, setBranch] = useState("");
  const [addAnother, setAddAnother] = useState(false);

  // Per-rekening profile — cash hides sumber/detail + branch picker,
  // and inherits branch from the rekening's default.
  const isCash = account?.bank === "cash";
  const effectiveBranch = isCash
    ? account?.defaultBranch ?? ""
    : branch;

  const categoryList =
    side === "kredit" ? presets.credit : side === "debit" ? presets.debit : [];

  function reset(keep: "all" | "most" = "all") {
    if (keep === "most") {
      // Keep date, side, category, branch (common for batch entry),
      // clear tx-specific fields.
      setSourceDestination("");
      setTransactionDetails("");
      setNotes("");
      setAmount("");
      setRunningBalance("");
    } else {
      setDate(today);
      setTime("");
      setSourceDestination("");
      setTransactionDetails("");
      setNotes("");
      setSide("kredit");
      setAmount("");
      setRunningBalance("");
      setCategory("");
      setBranch("");
      setAddAnother(false);
    }
  }

  // Reset when dialog opens for a different account.
  useEffect(() => {
    if (!account) return;
    reset("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  // When side flips between debit/kredit, the old category may no
  // longer belong to the new side's preset — clear it.
  useEffect(() => {
    if (category && !categoryList.includes(category)) setCategory("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  function handleSubmit() {
    if (!account) return;
    if (!date) {
      toast.error("Tanggal wajib diisi");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nominal harus angka positif");
      return;
    }
    const rb = runningBalance.trim() ? Number(runningBalance) : null;
    if (runningBalance.trim() && !Number.isFinite(rb as number)) {
      toast.error("Saldo harus angka");
      return;
    }

    startTransition(async () => {
      const res = await createManualTransaction({
        bankAccountId: account.id,
        date,
        time: time.trim() || null,
        sourceDestination: isCash ? null : sourceDestination.trim() || null,
        transactionDetails: isCash ? null : transactionDetails.trim() || null,
        notes: notes.trim() || null,
        debit: side === "debit" ? amt : 0,
        credit: side === "kredit" ? amt : 0,
        runningBalance: rb,
        category: category || null,
        branch: effectiveBranch || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Transaksi ditambahkan");
      router.refresh();
      if (addAnother) {
        reset("most");
      } else {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog
      open={Boolean(account)}
      onOpenChange={(next) => onOpenChange(next)}
    >
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Input manual — tambah transaksi</DialogTitle>
          <DialogDescription>
            Rekening: <strong>{account?.accountName}</strong>. Satu form = satu
            baris transaksi. Bucket statement bulanan dibuat otomatis sesuai
            tanggal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Tanggal & Jam */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="manual-date" className="text-xs">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input
                id="manual-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-time" className="text-xs">
                Jam (opsional)
              </Label>
              <Input
                id="manual-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="HH:mm"
              />
            </div>
          </div>

          {/* Source / Details — hidden for cash rekening (those
              only capture free-text Catatan). */}
          {!isCash && (
            <>
              <div className="space-y-1">
                <Label htmlFor="manual-source" className="text-xs">
                  Sumber / Tujuan
                </Label>
                <Input
                  id="manual-source"
                  value={sourceDestination}
                  onChange={(e) => setSourceDestination(e.target.value)}
                  placeholder="mis. Mandiri 1350019865748, GoPay, Main Pocket"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-details" className="text-xs">
                  Detail transaksi
                </Label>
                <Input
                  id="manual-details"
                  value={transactionDetails}
                  onChange={(e) => setTransactionDetails(e.target.value)}
                  placeholder="mis. Outgoing Transfer, QRIS Payment"
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="manual-notes" className="text-xs">
              Catatan
            </Label>
            <Input
              id="manual-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isCash
                  ? "Deskripsi transaksi (mis. ongkir clarisya)"
                  : "Memo bebas — dipakai untuk auto-kategorisasi"
              }
            />
          </div>

          {/* Side + amount */}
          <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Tipe</Label>
              <div
                role="radiogroup"
                className="inline-flex rounded-md border border-border overflow-hidden"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={side === "kredit"}
                  onClick={() => setSide("kredit")}
                  className={
                    "px-3 h-9 text-xs font-semibold transition border-r border-border " +
                    (side === "kredit"
                      ? "bg-success text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted")
                  }
                >
                  + Kredit
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={side === "debit"}
                  onClick={() => setSide("debit")}
                  className={
                    "px-3 h-9 text-xs font-semibold transition " +
                    (side === "debit"
                      ? "bg-destructive text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted")
                  }
                >
                  − Debit
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-amount" className="text-xs">
                Nominal (Rp) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="manual-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="text-right tabular-nums"
                required
              />
            </div>
          </div>

          {/* Saldo */}
          <div className="space-y-1">
            <Label htmlFor="manual-balance" className="text-xs">
              Saldo setelah tx (opsional)
            </Label>
            <Input
              id="manual-balance"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={runningBalance}
              onChange={(e) => setRunningBalance(e.target.value)}
              placeholder="Saldo yang tercetak di rekening koran"
              className="text-right tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Isi kalau tahu — saldo dipakai untuk verifikasi konsistensi
              urutan + deteksi duplikat yang lebih ketat.
            </p>
          </div>

          {/* Kategori + Cabang — cash rekening hides the branch
              picker since every tx inherits account.defaultBranch. */}
          <div className={isCash ? "space-y-1" : "grid grid-cols-2 gap-3"}>
            <div className="space-y-1">
              <Label className="text-xs">Kategori</Label>
              {categoryList.length > 0 ? (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— (tidak set)</option>
                  {categoryList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="—"
                />
              )}
            </div>
            {!isCash && (
              <div className="space-y-1">
                <Label className="text-xs">Cabang</Label>
                {presets.branches.length > 0 ? (
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— (tidak set)</option>
                    {presets.branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="—"
                  />
                )}
              </div>
            )}
          </div>
          {isCash && account?.defaultBranch && (
            <p className="text-[11px] text-muted-foreground">
              Cabang <strong className="text-foreground">{account.defaultBranch}</strong>{" "}
              otomatis di-tag (ikut rekening ini).
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={addAnother}
              onChange={(e) => setAddAnother(e.target.checked)}
              className="rounded border-border"
            />
            Tambah lagi setelah simpan (pertahankan tanggal + tipe + kategori + cabang)
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending} loading={pending}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending} loading={pending}>
            {pending ? "Menyimpan…" : addAnother ? "Simpan & lanjut" : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
