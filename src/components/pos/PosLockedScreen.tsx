"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { startIncidentalSession } from "@/lib/actions/pos-shift.actions";
import { PosLogo } from "./PosLogo";
import { posPalette } from "@/lib/pos/branch";
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
}

/** "Cash Haengbocake Pare" → "POS Haengbocake Pare". */
function posTitle(accountName: string): string {
  const base = accountName.replace(/^cash\s+/i, "").trim();
  return `POS ${base}`;
}

/**
 * Layar kunci POS — sengaja minimal. Semua fitur POS tertutup sampai kasir membuka shift, kecuali
 * "Pakai tanpa shift" untuk pemakaian insidentil (tanpa PIN/opname/kas).
 */
export function PosLockedScreen({ mode, bankAccountId, accountName, basePath, isAdmin, stale }: Props) {
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

  const primary =
    "inline-flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition hover:opacity-90";
  const secondary =
    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50";

  return (
    <div data-pos-shell data-pos-palette={posPalette(basePath)} className="relative flex min-h-screen flex-col bg-background">
      <Link
        prefetch={false}
        href="/"
        className="absolute left-4 top-4 inline-flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
        aria-label="Kembali ke beranda Zota"
        title="Kembali ke beranda Zota"
      >
        <ArrowLeft size={16} />
      </Link>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
        <div className="space-y-5">
          <PosLogo size={96} className="mx-auto" palette={posPalette(basePath)} />
          {mode === "stale" && stale ? (
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Shift {stale.cashierName} belum ditutup
              </h1>
              <p className="text-sm text-muted-foreground">Dibuka {stale.openedAtLabel}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Selamat datang di</p>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{posTitle(accountName)}</h1>
            </div>
          )}
        </div>

        <div className="w-full space-y-2">
          {mode === "locked" ? (
            <>
              <button type="button" onClick={() => setWizard("open")} className={primary}>
                Mulai shift
              </button>
              <button type="button" onClick={startIncidental} disabled={pending} className={secondary}>
                {pending && <Loader2 size={14} className="animate-spin" />}
                Pakai tanpa shift
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setWizard("close")} className={primary}>
                Tutup shift
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setForceOpen(true)}
                  className={`${secondary} text-destructive hover:text-destructive`}
                >
                  <ShieldAlert size={14} />
                  Tutup paksa
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
