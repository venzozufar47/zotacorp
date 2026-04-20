"use client";

import { useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBankAccount } from "@/lib/actions/cashflow.actions";
import type { BankCode } from "@/lib/cashflow/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessUnit: string;
}

// `hasParser: true` = bank has an upload+auto-parse path (Jago PDF
// via Gemini, Mandiri Excel deterministic). Others are fully
// selectable but flagged "manual only" — admin uses the Input manual
// flow for those. Cash is intentionally parser-less since there's no
// statement to upload for physical cash.
const BANK_OPTIONS: Array<{ value: BankCode; label: string; hasParser: boolean }> = [
  { value: "mandiri", label: "Bank Mandiri", hasParser: true },
  { value: "jago", label: "Bank Jago", hasParser: true },
  { value: "bca", label: "BCA", hasParser: false },
  { value: "cash", label: "Cash", hasParser: false },
  { value: "bri", label: "BRI", hasParser: false },
  { value: "bni", label: "BNI", hasParser: false },
  { value: "other", label: "Lainnya", hasParser: false },
];

export function BankAccountFormDialog({ open, onOpenChange, businessUnit }: Props) {
  const router = useRouter();
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bank, setBank] = useState<BankCode>("mandiri");
  // Sheet-source fields — only relevant for cash rekening today.
  // Collapsible panel so it doesn't clutter the form for the common
  // non-sheet case.
  const [useSheetSource, setUseSheetSource] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceSheet, setSourceSheet] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setAccountName("");
    setAccountNumber("");
    setBank("mandiri");
    setUseSheetSource(false);
    setSourceUrl("");
    setSourceSheet("");
    setDefaultBranch("");
  }

  function handleSubmit() {
    if (!accountName.trim()) {
      toast.error("Nama rekening wajib diisi");
      return;
    }
    if (useSheetSource) {
      if (!sourceUrl.trim() || !sourceSheet.trim()) {
        toast.error("URL sheet + nama tab wajib diisi saat pakai source");
        return;
      }
    }
    startTransition(async () => {
      const res = await createBankAccount({
        businessUnit,
        bank,
        accountName,
        accountNumber: accountNumber || undefined,
        sourceUrl: useSheetSource ? sourceUrl : undefined,
        sourceSheet: useSheetSource ? sourceSheet : undefined,
        defaultBranch:
          useSheetSource && defaultBranch ? defaultBranch : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Rekening ditambahkan");
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah rekening</DialogTitle>
          <DialogDescription>
            Business unit: <strong>{businessUnit}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="accountName">Nama rekening</Label>
            <Input
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Contoh: Haengbocake Operasional"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bank">Bank</Label>
            <Select value={bank} onValueChange={(v) => setBank(v as BankCode)}>
              <SelectTrigger id="bank">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANK_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                    {!opt.hasParser && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        · manual only
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Bank dengan label "manual only" bisa dibuat rekeningnya, tapi
              transaksi harus diinput manual (parser PDF belum tersedia).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accountNumber">No rekening (opsional)</Label>
            <Input
              id="accountNumber"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Contoh: 1234567890"
              inputMode="numeric"
            />
          </div>

          {/* Sheet-source toggle + fields. Cash rekening has its own
              fully-manual workflow — hide this option for bank=cash
              to avoid surfacing a feature that's explicitly disabled
              for that profile. */}
          {bank !== "cash" && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useSheetSource}
                onChange={(e) => setUseSheetSource(e.target.checked)}
                className="rounded border-border"
              />
              <span className="font-semibold">
                Sumber data dari Google Sheet
              </span>
            </label>
            {useSheetSource && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="sourceUrl" className="text-[11px]">
                    URL Google Sheet
                  </Label>
                  <Input
                    id="sourceUrl"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sourceSheet" className="text-[11px]">
                    Nama tab
                  </Label>
                  <Input
                    id="sourceSheet"
                    value={sourceSheet}
                    onChange={(e) => setSourceSheet(e.target.value)}
                    placeholder="Contoh: CF SMG"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="defaultBranch" className="text-[11px]">
                    Cabang default (opsional)
                  </Label>
                  <Input
                    id="defaultBranch"
                    value={defaultBranch}
                    onChange={(e) => setDefaultBranch(e.target.value)}
                    placeholder="Contoh: Semarang"
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Semua row dari sheet akan di-tag cabang ini (sheet
                    biasanya tidak punya kolom cabang).
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Sheet harus di-share "anyone with link can view". Auto-sync
                  jalan setiap hari + kamu bisa sync manual lewat tombol di
                  halaman rekening.
                </p>
              </div>
            )}
          </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
