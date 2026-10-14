"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, UserRoundCog, X } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";
import { AccountSwitcher, type SwitcherViewer } from "@/components/auth/AccountSwitcher";

/**
 * Menu akun portal investor (layout-nya server component, jadi state buka/tutup
 * ada di sini). `sidebar`: tombol + popover ke atas. `bottom`: tab "Akun" di
 * bottom-nav yang membuka bottom sheet. Keduanya memuat pemilih akun + Keluar.
 */
export function InvestorAccountMenu({
  me,
  variant,
}: {
  me: SwitcherViewer;
  variant: "sidebar" | "bottom";
}) {
  const pathname = usePathname();
  // Dibuka per-path: berpindah halaman otomatis menutupnya (tanpa effect).
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (v: boolean) => setOpenPath(v ? pathname : null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPath(null);
    };
    const onDown = (e: MouseEvent) => {
      if (variant === "sidebar" && !rootRef.current?.contains(e.target as Node)) setOpenPath(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, variant]);

  const signOutForm = (
    <form action={signOut}>
      <button
        type="submit"
        className="press-feedback flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut size={16} strokeWidth={2} />
        Keluar
      </button>
    </form>
  );

  if (variant === "sidebar") {
    return (
      <div ref={rootRef} className="relative">
        {open && (
          <div
            role="menu"
            className="absolute bottom-full left-0 right-0 mb-2 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lg"
          >
            <AccountSwitcher me={me} />
            <div className="my-1 border-t border-border" />
            {signOutForm}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="press-feedback flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <UserRoundCog size={16} strokeWidth={2} />
          Akun &amp; ganti akun
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="press-feedback flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <UserRoundCog size={18} strokeWidth={2} />
        Akun
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="fixed bottom-0 left-0 right-0 z-[70] max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] shadow-lg md:hidden"
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <span className="text-base font-semibold">Akun</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-full border border-border bg-card"
                aria-label="Tutup"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-2 pb-3">
              <AccountSwitcher me={me} />
              <div className="my-1 border-t border-border" />
              {signOutForm}
            </div>
          </div>
        </>
      )}
    </>
  );
}
