"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink, X } from "lucide-react";
import { NewCakeOrderForm } from "./NewCakeOrderForm";
import type { CakeOptionsByKind } from "@/lib/cake-orders/types";

/**
 * Header trigger that opens the new-order form in a right-side panel
 * instead of routing to /cake-orders/new. Inside the panel an
 * "Open in new tab" link is provided so admin can pop the form into
 * a fresh tab (uses the existing standalone route).
 *
 * On mobile (< md) the panel takes the whole screen as a modal
 * overlay since splitting alongside the kanban isn't realistic.
 */
export function NewOrderQuickButton({
  optionsByKind,
}: {
  optionsByKind: CakeOptionsByKind | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-3 py-2 text-sm font-medium hover:opacity-90 active:scale-95 transition-transform"
      >
        <Plus size={14} strokeWidth={2.5} />
        <span className="hidden sm:inline">Pesanan baru</span>
        <span className="sm:hidden">Baru</span>
      </button>

      {open && (
        <Panel
          optionsByKind={optionsByKind}
          onClose={close}
          onSuccess={() => {
            // Stay on the kanban — refresh so the new card appears in
            // the "Baru" column instead of pushing to a dedicated
            // detail page.
            close();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Panel({
  optionsByKind,
  onClose,
  onSuccess,
}: {
  optionsByKind: CakeOptionsByKind | null;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}) {
  const Header = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b-2 border-foreground">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
        Pesanan baru
      </h2>
      <div className="flex items-center gap-1">
        <Link
          href="/cake-orders/new"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
        >
          <ExternalLink size={11} strokeWidth={2.5} />
          Buka di tab baru
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Tutup"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  const Body = (
    <div className="px-3 py-3">
      {optionsByKind ? (
        <NewCakeOrderForm
          optionsByKind={optionsByKind}
          singleColumn
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      ) : (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Opsi belum termuat — refresh halaman.
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: sticky panel pinned to the right edge of the viewport.
          Doesn't push the kanban — overlays so the helicopter view
          stays mostly visible. */}
      <aside className="hidden md:flex fixed top-4 right-4 bottom-4 w-[440px] xl:w-[520px] z-50 rounded-2xl border-2 border-foreground bg-card shadow-2xl overflow-hidden flex-col">
        {Header}
        <div className="flex-1 overflow-y-auto">{Body}</div>
      </aside>
      {/* Mobile: full-screen modal */}
      <div
        className="fixed inset-0 z-50 bg-background md:hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {Header}
        <div className="flex-1 overflow-y-auto">{Body}</div>
      </div>
    </>
  );
}
