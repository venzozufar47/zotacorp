"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { setPosPin, clearPosPin } from "@/lib/actions/pos-pin.actions";
import { isValidPinFormat } from "@/lib/pos-pin-format";
import { cn } from "@/lib/utils";

interface Props {
  hasPin: boolean;
}

type Mode = null | "set" | "change" | "clear";

/**
 * Self-service POS PIN management on the employee profile page. Used
 * by anyone who might be designated as a POS operation authorizer
 * (production / withdrawal / opname). PIN is 4–6 digits.
 */
export function PosPinCard({ hasPin }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          {hasPin ? (
            <ShieldCheck size={16} className="text-success" />
          ) : (
            <ShieldOff size={16} className="text-muted-foreground" />
          )}
          <h2 className="font-display font-semibold text-foreground">
            PIN POS
          </h2>
        </div>
        <span
          className={cn(
            "text-[10.5px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full",
            hasPin ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          )}
        >
          {hasPin ? "Aktif" : "Belum set"}
        </span>
      </div>
      <p className="text-[12.5px] text-muted-foreground mb-4">
        PIN 4–6 digit untuk otorisasi operasi POS (produksi, penarikan,
        opname). Admin akan menetapkan kamu sebagai penanggungjawab operasi
        tertentu di rekening yang relevan.
      </p>

      {mode === null && (
        <div className="flex flex-wrap items-center gap-2">
          {hasPin ? (
            <>
              <button
                type="button"
                onClick={() => setMode("change")}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-110"
              >
                Ganti PIN
              </button>
              <button
                type="button"
                onClick={() => setMode("clear")}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border/70 bg-card text-[13px] text-muted-foreground hover:text-destructive hover:border-destructive/50"
              >
                Hapus PIN
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode("set")}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-110"
            >
              Set PIN
            </button>
          )}
        </div>
      )}

      {mode === "set" && (
        <SetPinForm
          requireCurrent={false}
          onCancel={() => setMode(null)}
          onSuccess={() => {
            setMode(null);
            router.refresh();
          }}
        />
      )}
      {mode === "change" && (
        <SetPinForm
          requireCurrent
          onCancel={() => setMode(null)}
          onSuccess={() => {
            setMode(null);
            router.refresh();
          }}
        />
      )}
      {mode === "clear" && (
        <ClearPinForm
          onCancel={() => setMode(null)}
          onSuccess={() => {
            setMode(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function SetPinForm({
  requireCurrent,
  onCancel,
  onSuccess,
}: {
  requireCurrent: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPinFormat(pin)) {
      setError("PIN baru harus 4–6 digit angka.");
      return;
    }
    if (pin !== confirm) {
      setError("Konfirmasi PIN tidak cocok.");
      return;
    }
    startTransition(async () => {
      const res = await setPosPin({
        pin,
        currentPin: requireCurrent ? currentPin : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("PIN POS tersimpan.");
      onSuccess();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      {requireCurrent && (
        <PinField
          label="PIN saat ini"
          value={currentPin}
          onChange={setCurrentPin}
          autoFocus
        />
      )}
      <PinField
        label="PIN baru"
        value={pin}
        onChange={setPin}
        autoFocus={!requireCurrent}
      />
      <PinField label="Konfirmasi PIN baru" value={confirm} onChange={setConfirm} />
      {error && (
        <p className="text-[12px] text-destructive font-medium">{error}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:brightness-110 disabled:opacity-50"
        >
          {pending && <Loader2 size={13} className="animate-spin" />}
          Simpan
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center h-9 px-4 rounded-full text-[13px] text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          Batal
        </button>
      </div>
    </form>
  );
}

function ClearPinForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [currentPin, setCurrentPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await clearPosPin({ currentPin });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("PIN POS dihapus.");
      onSuccess();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <p className="text-[12.5px] text-muted-foreground">
        Setelah dihapus, kamu tidak bisa lagi dipakai sebagai authorizer
        sampai set PIN baru.
      </p>
      <PinField
        label="PIN saat ini"
        value={currentPin}
        onChange={setCurrentPin}
        autoFocus
      />
      {error && (
        <p className="text-[12px] text-destructive font-medium">{error}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-destructive text-white text-[13px] font-medium hover:brightness-110 disabled:opacity-50"
        >
          {pending && <Loader2 size={13} className="animate-spin" />}
          Hapus PIN
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center h-9 px-4 rounded-full text-[13px] text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          Batal
        </button>
      </div>
    </form>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        className="mt-1 w-full h-10 rounded-lg border border-border/70 bg-card px-3 text-[15px] tracking-[0.5em] tabular-nums"
      />
    </label>
  );
}
