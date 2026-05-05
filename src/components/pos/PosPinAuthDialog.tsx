"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Delete, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  /** Display name of the designated authorizer (e.g. "Mas Boles"). */
  authorizerName: string | null;
  /** Operation label shown in the modal header (e.g. "Produksi"). */
  operationLabel: string;
  /** One-line summary of what's being submitted (e.g. "BCB +10"). */
  preview: string;
  pending?: boolean;
  /** Reset to null after a successful retry round-trip. */
  error?: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

const PIN_MIN = 4;
const PIN_MAX = 6;

/**
 * ATM-style PIN entry. Caller is expected to:
 *  - keep `open` controlled
 *  - pass `error` from server response so the modal can shake + clear
 *  - pass `pending` while the server action is in flight
 *  - call `onClose` from anywhere (X button, ESC, or post-success)
 */
export function PosPinAuthDialog({
  open,
  authorizerName,
  operationLabel,
  preview,
  pending,
  error,
  onSubmit,
  onClose,
}: Props) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) setPin("");
  }, [open]);

  // When a new error arrives, clear PIN and shake the panel.
  useEffect(() => {
    if (!error || error === lastErrorRef.current) return;
    lastErrorRef.current = error;
    setPin("");
    setShake(true);
    const t = window.setTimeout(() => setShake(false), 500);
    return () => window.clearTimeout(t);
  }, [error]);

  // Reset error tracking on close so re-opening doesn't immediately shake.
  useEffect(() => {
    if (!open) lastErrorRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Backspace") {
        setPin((p) => p.slice(0, -1));
        return;
      }
      if (e.key === "Enter") {
        if (pin.length >= PIN_MIN) onSubmit(pin);
        return;
      }
      if (/^\d$/.test(e.key)) {
        setPin((p) => (p.length >= PIN_MAX ? p : p + e.key));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pin, onSubmit, onClose]);

  // Portal to <body> so the dialog escapes any parent click-to-close
  // zone (StockMovementDialog wraps its content in such a div). Without
  // this, every keypad click bubbled up to onClose and dismissed the
  // parent before the server action could complete.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  function tap(d: string) {
    setPin((p) => (p.length >= PIN_MAX ? p : p + d));
  }
  function backspace() {
    setPin((p) => p.slice(0, -1));
  }
  function submit() {
    if (pin.length < PIN_MIN || pending) return;
    onSubmit(pin);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4 animate-fade-up"
      role="dialog"
      aria-modal="true"
      aria-label={`Otorisasi ${operationLabel}`}
      onClick={(e) => {
        // React events bubble through the component tree, not the DOM
        // tree — so even though createPortal moves us under <body>, a
        // click here still reaches the parent StockMovementDialog's
        // onClose via React. Stop propagation so any keypad / backdrop
        // click stays inside the PIN modal's subtree.
        e.stopPropagation();
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        className={cn(
          "w-[320px] max-w-full bg-card rounded-2xl border border-border/70 shadow-2xl overflow-hidden",
          shake && "animate-shake-x"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="font-display font-semibold text-foreground text-[15px]">
            Otorisasi {operationLabel}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="grid place-items-center size-8 rounded-full hover:bg-muted transition disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preview + authorizer */}
        <div className="px-4 pt-3 pb-4 space-y-2">
          <div className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
              Akan disimpan
            </div>
            <div className="text-[13px] font-medium text-foreground mt-0.5">
              {preview}
            </div>
          </div>
          <div className="text-[12px] text-muted-foreground">
            {authorizerName
              ? `Masukkan PIN dari ${authorizerName}`
              : "Masukkan PIN"}
          </div>
        </div>

        {/* PIN dots */}
        <div className="flex items-center justify-center gap-2.5 px-4 pb-3">
          {Array.from({ length: PIN_MAX }).map((_, i) => {
            const filled = i < pin.length;
            return (
              <span
                key={i}
                className={cn(
                  "size-2.5 rounded-full transition",
                  filled
                    ? "bg-foreground"
                    : "bg-muted border border-border/70"
                )}
              />
            );
          })}
        </div>

        {error && (
          <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-[12px] font-medium">
            {error}
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-1.5 px-4 pb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <KeypadButton key={d} onClick={() => tap(d)} disabled={pending}>
              {d}
            </KeypadButton>
          ))}
          <KeypadButton onClick={backspace} disabled={pending} aria-label="Backspace">
            <Delete size={18} />
          </KeypadButton>
          <KeypadButton onClick={() => tap("0")} disabled={pending}>
            0
          </KeypadButton>
          <KeypadButton
            onClick={submit}
            disabled={pending || pin.length < PIN_MIN}
            tone="primary"
            aria-label="Submit"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : "OK"}
          </KeypadButton>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake-x {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-shake-x { animation: shake-x 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97); }
      `}</style>
    </div>,
    document.body
  );
}

function KeypadButton({
  children,
  onClick,
  disabled,
  tone,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-12 rounded-xl text-[18px] font-medium tabular-nums transition disabled:opacity-50 grid place-items-center",
        tone === "primary"
          ? "bg-primary text-primary-foreground hover:brightness-110"
          : "bg-muted hover:bg-muted/80 text-foreground"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
