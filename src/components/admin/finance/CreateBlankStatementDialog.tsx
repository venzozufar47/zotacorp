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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBlankStatement } from "@/lib/actions/cashflow.actions";

interface Account {
  id: string;
  accountName: string;
}

interface Props {
  account: Account | null;
  onOpenChange: (open: boolean) => void;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function CreateBlankStatementDialog({ account, onOpenChange }: Props) {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [pending, startTransition] = useTransition();

  // Reset month/year whenever the dialog opens for a different account.
  useEffect(() => {
    if (!account) return;
    setMonth(now.getMonth() + 1);
    setYear(now.getFullYear());
    // Depending on `account.id` only — dropping `now` avoids re-running
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  function handleSubmit() {
    if (!account) return;
    startTransition(async () => {
      const res = await createBlankStatement({
        bankAccountId: account.id,
        periodMonth: month,
        periodYear: year,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Statement kosong dibuat. Isi transaksinya di halaman berikut.");
      onOpenChange(false);
      if (res.data?.id) {
        router.push(`/admin/finance/statements/${res.data.id}`);
      }
    });
  }

  return (
    <Dialog
      open={Boolean(account)}
      onOpenChange={(next) => onOpenChange(next)}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Input manual</DialogTitle>
          <DialogDescription>
            Rekening: <strong>{account?.accountName}</strong>. Buat statement
            kosong lalu isi baris transaksinya sendiri.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-month">Bulan</Label>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
            >
              <SelectTrigger id="manual-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, idx) => (
                  <SelectItem key={idx + 1} value={String(idx + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-year">Tahun</Label>
            <Input
              id="manual-year"
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending} loading={pending}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending} loading={pending}>
            {pending ? "Membuat…" : "Buat & edit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
