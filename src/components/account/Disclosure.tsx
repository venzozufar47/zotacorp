"use client";

import { useId, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pola progressive disclosure untuk halaman Akun: baris ringkas (judul +
 * satu baris ringkasan), detail baru terbuka saat diketuk.
 *
 * `DisclosureGroup` membungkus beberapa `Disclosure` jadi satu kartu datar
 * dengan garis pemisah, supaya daftar bagian terbaca sebagai satu daftar,
 * bukan tumpukan kartu.
 */
export function DisclosureGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card",
        className
      )}
    >
      {children}
    </div>
  );
}

interface DisclosureProps {
  title: string;
  /** Satu baris ringkasan di bawah judul saat tertutup. */
  summary?: React.ReactNode;
  icon?: LucideIcon;
  /** `warn` memberi penanda kuning (perlu perhatian). `ok` memberi penanda hijau. */
  status?: "ok" | "warn";
  /** Teks pembaca layar untuk penanda status. */
  statusLabel?: string;
  /** Mode terkendali. Tanpa ini, komponen mengelola dirinya sendiri. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Disclosure({
  title,
  summary,
  icon: Icon,
  status,
  statusLabel,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: DisclosureProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const open = openProp ?? innerOpen;
  const id = useId();

  function toggle() {
    const next = !open;
    if (openProp === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }

  return (
    <section>
      <h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
        >
          {Icon && (
            <Icon
              size={18}
              strokeWidth={1.75}
              aria-hidden
              className="shrink-0 text-muted-foreground"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-sm font-semibold text-foreground">
              {title}
            </span>
            {summary != null && summary !== "" && !open && (
              <span className="mt-0.5 block truncate font-sans text-xs font-normal text-muted-foreground">
                {summary}
              </span>
            )}
          </span>
          {status && (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                status === "warn" ? "bg-warning" : "bg-success"
              )}
            >
              {statusLabel && <span className="sr-only">{statusLabel}</span>}
            </span>
          )}
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </button>
      </h3>
      <div
        id={id}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
