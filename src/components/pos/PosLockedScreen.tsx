"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LockKeyhole, Play, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { startIncidentalSession } from "@/lib/actions/pos-shift.actions";
import { ForceCloseDialog } from "./PosShiftControls";
import { PosShiftWizard } from "./PosShiftWizard";
import "./workstation.css";

interface Props {
  /** locked = tidak ada shift; stale = ada shift terbuka yang lupa ditutup (POS tetap terkunci). */
  mode: "locked" | "stale";
  bankAccountId: string;
  accountName: string;
  basePath: string;
  isAdmin: boolean;
  /** Mode stale: kasir & jam buka shift yang menggantung. */
  stale?: { cashierId: string; cashierName: string; openedAtLabel: string };
  /** Mode locked: kapan shift terakhir ditutup (informasi). */
  lastClosedLabel?: string | null;
}

/**
 * Layar kunci POS. Semua fitur POS tertutup sampai kasir membuka shift (PIN + opname + hitung kas), kecuali
 * "Pakai tanpa shift" untuk pemakaian insidentil: tanpa PIN/opname/kas, transaksi tercatat atas akun login,
 * dan dilaporkan ke kasir shift berikutnya.
 */
export function PosLockedScreen({
  mode,
  bankAccountId,
  accountName,
  basePath,
  isAdmin,
  stale,
  lastClosedLabel,
}: Props) {
  const router = useRouter();
  const [wizard, setWizard] = useState<"open" | "close" | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function startIncidental() {
    startTransition(async () => {
      const res = await startIncidentalSession(bankAccountId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div data-pos-shell data-pos-palette="pink" className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
        <Link
          prefetch={false}
          href="/"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
          aria-label="Kembali ke beranda Zota"
          title="Kembali ke beranda Zota"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
          Z
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">POS</p>
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{accountName}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <LockKeyhole size={11} />
          Terkunci
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-10">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LockKeyhole size={28} />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {mode === "stale" ? "Shift belum ditutup" : "POS terkunci"}
          </h1>
          {mode === "stale" && stale ? (
            <p className="text-sm text-muted-foreground">
              Shift <strong className="text-foreground">{stale.cashierName}</strong> dibuka {stale.openedAtLabel} dan
              belum ditutup. Kasir yang sama harus menutupnya dulu (opname + hitung kas), atau admin menutup paksa.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mulai shift untuk membuka POS: pilih nama kasir, masukkan PIN, lalu opname stok dan hitung kas.
              {lastClosedLabel ? ` Shift terakhir ditutup ${lastClosedLabel}.` : ""}
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          {mode === "locked" ? (
            <>
              <button
                type="button"
                onClick={() => setWizard("open")}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:opacity-90"
              >
                <Play size={18} />
                Mulai shift
              </button>
              <button
                type="button"
                onClick={startIncidental}
                disabled={pending}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
                Pakai tanpa shift (insidentil)
              </button>
              <p className="px-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                Insidentil: tanpa PIN, opname, dan hitung kas. Transaksi tercatat atas akunmu dan dilaporkan ke kasir
                shift berikutnya.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setWizard("close")}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:opacity-90"
              >
                Tutup shift {stale?.cashierName}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setForceOpen(true)}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 text-sm font-semibold text-destructive hover:bg-destructive/10"
                >
                  <ShieldAlert size={15} />
                  Tutup paksa (admin)
                </button>
              )}
            </>
          )}
        </div>
      </main>

      {wizard === "open" && (
        <PosShiftWizard
          mode="open"
          bankAccountId={bankAccountId}
          accountName={accountName}
          basePath={basePath}
          onClose={() => setWizard(null)}
        />
      )}
      {wizard === "close" && stale && (
        <PosShiftWizard
          mode="close"
          bankAccountId={bankAccountId}
          accountName={accountName}
          basePath={basePath}
          shiftCashier={{ id: stale.cashierId, name: stale.cashierName }}
          onClose={() => setWizard(null)}
        />
      )}

      <ForceCloseDialog
        open={forceOpen}
        onOpenChange={setForceOpen}
        bankAccountId={bankAccountId}
        cashierName={stale?.cashierName ?? ""}
      />
    </div>
  );
}
