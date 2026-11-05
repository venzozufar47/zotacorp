"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreVertical, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/** Tombol refresh top bar POS: muat ulang data server (produk, stok, shift, penjualan) tanpa reload halaman. */
export function PosRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) toast.success("Data diperbarui");
    wasPending.current = pending;
  }, [pending]);

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted disabled:opacity-60"
      aria-label="Muat ulang data"
      title="Muat ulang data"
    >
      <RefreshCw size={16} className={pending ? "animate-spin" : undefined} />
    </button>
  );
}

export interface PosMenuItem {
  icon: ReactNode;
  label: string;
  /** Salah satu: href (tautan) atau onSelect (aksi). */
  href?: string;
  onSelect?: () => void;
  /** Aksi berisiko: diberi warna destruktif. */
  danger?: boolean;
}

/** Menu titik tiga: aksi jarang/berisiko dilipat di sini, satu ketukan dari tingkat 1. */
export function PosTopbarMenu({ items, disabled }: { items: PosMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = (danger?: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-muted disabled:opacity-50 ${
      danger ? "text-destructive" : "text-foreground"
    }`;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted disabled:opacity-60"
        aria-label="Menu lainnya"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu lainnya"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {items.map((it) =>
            it.href ? (
              <Link
                key={it.label}
                href={it.href}
                prefetch={false}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass(it.danger)}
              >
                {it.icon}
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onSelect?.();
                }}
                className={itemClass(it.danger)}
              >
                {it.icon}
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
