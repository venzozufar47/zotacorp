"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, LogOut, Power, Receipt, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exitIncidentalSession, forceCloseShift } from "@/lib/actions/pos-shift.actions";
import { PosShiftWizard } from "./PosShiftWizard";

interface Props {
  mode: "shift" | "incidental";
  bankAccountId: string;
  accountName: string;
  basePath: string;
  /** Mode shift: kasir yang membuka shift. */
  cashier?: { id: string; name: string };
  /** Mode shift: jam buka, mis. "08.05". */
  openedAtLabel?: string;
  /** Mode insidentil: akun yang sedang login. */
  userName?: string;
  isAdmin: boolean;
}

/**
 * Kendali shift di top bar POS: status (siapa kasirnya / mode insidentil) + Tutup shift atau Keluar,
 * dan "Tutup paksa" khusus admin untuk shift yang lupa ditutup kasirnya.
 */
export function PosShiftControls({
  mode,
  bankAccountId,
  accountName,
  basePath,
  cashier,
  openedAtLabel,
  userName,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function exitIncidental() {
    startTransition(async () => {
      const res = await exitIncidentalSession(bankAccountId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (mode === "incidental") {
    return (
      <>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-warning/40 bg-warning/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground">
          <span className="size-1.5 rounded-full bg-warning" />
          <span className="hidden sm:inline">Insidentil · </span>
          {userName}
        </span>
        <button
          type="button"
          onClick={exitIncidental}
          disabled={pending}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          Keluar
        </button>
      </>
    );
  }

  return (
    <>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-success/30 bg-success/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-success">
        <span className="size-1.5 animate-pulse rounded-full bg-success" />
        <span className="hidden sm:inline">Shift · </span>
        {cashier?.name}
        {openedAtLabel ? <span className="hidden md:inline"> · {openedAtLabel}</span> : null}
      </span>
      {/* Pengeluaran uang laci: dicatat di Pengadaan & Pengeluaran (sumber uang: laci kasir). */}
      <Link
        href={`/pengadaan?tab=catat&bu=${encodeURIComponent(`Haengbocake ${accountName.includes("Semarang") ? "Semarang" : "Pare"}`)}`}
        prefetch={false}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
      >
        <Receipt size={13} />
        <span className="hidden sm:inline">Pengeluaran</span>
      </Link>
      <button
        type="button"
        onClick={() => setClosing(true)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        <Power size={13} />
        Tutup shift
      </button>
      {isAdmin && (
        <button
          type="button"
          onClick={() => setForceOpen(true)}
          className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 sm:inline-flex"
        >
          <ShieldAlert size={13} />
          Tutup paksa
        </button>
      )}

      {closing && cashier && (
        <PosShiftWizard
          mode="close"
          bankAccountId={bankAccountId}
          accountName={accountName}
          basePath={basePath}
          shiftCashier={cashier}
          onClose={() => setClosing(false)}
        />
      )}

      <ForceCloseDialog
        open={forceOpen}
        onOpenChange={setForceOpen}
        bankAccountId={bankAccountId}
        cashierName={cashier?.name ?? ""}
      />
    </>
  );
}

/** Dialog konfirmasi tutup paksa — dipakai juga oleh layar kunci (shift basi). */
export function ForceCloseDialog({
  open,
  onOpenChange,
  bankAccountId,
  cashierName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bankAccountId: string;
  cashierName: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await forceCloseShift({ bankAccountId, reason });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Shift ditutup paksa");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Tutup paksa shift {cashierName}?</DialogTitle>
          <DialogDescription>
            Dipakai bila kasir lupa menutup shift. Tanpa opname dan hitungan kas, jadi shift berikutnya tidak punya
            pembanding kas awal. Tindakan ini dicatat atas namamu.
          </DialogDescription>
        </DialogHeader>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="Alasan (opsional)"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="h-10 flex-1 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Tutup paksa
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
