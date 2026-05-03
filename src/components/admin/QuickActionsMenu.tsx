"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, FileUp, Plus, Receipt, UserPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { listBankAccounts } from "@/lib/actions/cashflow.actions";
import { getCategoryPresets } from "@/lib/cashflow/categories";
import { UploadStatementDialog } from "@/components/admin/finance/UploadStatementDialog";
import type { BankCode } from "@/lib/cashflow/types";

interface BankAccountRow {
  id: string;
  business_unit: string;
  bank: BankCode;
  account_number: string | null;
  account_name: string;
  is_active: boolean;
  pos_enabled: boolean;
  created_at: string;
  /** Hydrated lazily from /api/admin/cashflow/account-passwords (TBD); we
   *  read from upload-dialog Account.pdfPassword which we don't have here.
   *  For now pass null — UploadStatementDialog handles "no saved password"
   *  by prompting the admin. */
  pdfPassword?: string | null;
}

const BANK_LABEL: Record<BankCode, string> = {
  mandiri: "Mandiri",
  jago: "Jago",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  cash: "Cash",
  other: "Other",
};

/**
 * Topbar "Quick" button — a "+ New" dropdown with high-frequency admin
 * shortcuts. Currently wires:
 *   - Upload financial statement → rekening picker → UploadStatementDialog
 *
 * Other items render disabled with a "Soon" tag so the menu shape is
 * stable; future items only need to flip the `enabled` flag.
 */
export function QuickActionsMenu() {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accounts, setAccounts] = useState<BankAccountRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BankAccountRow | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside-click + ESC for the menu (the picker dialog manages its own).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openUploadPicker() {
    setOpen(false);
    setPickerOpen(true);
    if (accounts === null) {
      setLoading(true);
      const res = await listBankAccounts();
      setAccounts(res.ok ? (res.data as BankAccountRow[]) : []);
      setLoading(false);
    }
  }

  function pickAccount(a: BankAccountRow) {
    setPickerOpen(false);
    setSelected(a);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, BankAccountRow[]>();
    for (const a of accounts ?? []) {
      if (!a.is_active) continue;
      const bu = a.business_unit || "—";
      const arr = map.get(bu) ?? [];
      arr.push(a);
      map.set(bu, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [accounts]);

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-medium text-white shadow-sm transition hover:brightness-110"
          style={{
            background: "var(--grad-teal)",
            boxShadow: "0 2px 10px rgba(17, 122, 140, 0.32)",
          }}
          title="Quick actions"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Sparkles size={13} strokeWidth={1.8} />
          <span>Quick</span>
        </button>

        {open && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-2xl bg-card border border-border/70 overflow-hidden"
            style={{
              boxShadow:
                "0 12px 40px rgba(8, 49, 46, 0.16), 0 2px 6px rgba(8,49,46,0.08)",
            }}
          >
            <div className="px-4 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Plus size={11} className="inline mr-1 -mt-0.5" /> New
            </div>
            <div className="pb-2">
              <MenuItem
                icon={<FileUp size={14} />}
                label="Upload financial statement"
                hint="Pick a rekening, then upload"
                onClick={openUploadPicker}
                enabled
              />
              <MenuItem
                icon={<Receipt size={14} />}
                label="Add cashflow entry"
                hint="Manual transaction"
                enabled={false}
              />
              <MenuItem
                icon={<Sparkles size={14} />}
                label="New POS sale"
                hint="Cashier flow"
                enabled={false}
              />
              <MenuItem
                icon={<UserPlus size={14} />}
                label="New employee"
                hint="Add user"
                enabled={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Rekening picker */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(o) => !o && setPickerOpen(false)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih rekening</DialogTitle>
            <DialogDescription>
              Statement yang di-upload akan masuk ke rekening yang kamu pilih
              di bawah.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-10 grid place-items-center text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-muted-foreground">
              Belum ada rekening. Buat dulu di{" "}
              <a className="underline" href="/admin/finance">
                /admin/finance
              </a>
              .
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6 space-y-3">
              {grouped.map(([bu, rows]) => (
                <div key={bu}>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground pb-1.5">
                    {bu}
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => pickAccount(a)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-muted border border-border/60 transition text-left"
                      >
                        <span
                          className="grid place-items-center size-8 rounded-lg text-[10.5px] font-semibold uppercase tracking-wider text-white shrink-0"
                          style={{ background: "var(--grad-teal)" }}
                        >
                          {BANK_LABEL[a.bank].slice(0, 3)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-medium text-foreground truncate">
                            {a.account_name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {BANK_LABEL[a.bank]}
                            {a.account_number ? ` · ${a.account_number}` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload dialog — re-mounts when `selected` flips. */}
      <UploadStatementDialog
        account={
          selected
            ? {
                id: selected.id,
                accountName: selected.account_name,
                bank: selected.bank,
                businessUnit: selected.business_unit,
                pdfPassword: selected.pdfPassword ?? null,
              }
            : null
        }
        presets={
          selected
            ? getCategoryPresets(selected.business_unit, selected.bank)
            : { credit: [], debit: [], branches: [] }
        }
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick?: () => void;
  enabled: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition",
        enabled
          ? "hover:bg-muted text-foreground cursor-pointer"
          : "text-muted-foreground/60 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "grid place-items-center size-8 rounded-lg shrink-0",
          enabled
            ? "bg-accent text-[var(--teal-600)]"
            : "bg-muted text-muted-foreground/60"
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium leading-tight">
          {label}
        </span>
        <span className="block text-[11px] text-muted-foreground/80 mt-0.5">
          {hint}
        </span>
      </span>
      {!enabled && (
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70">
          Soon
        </span>
      )}
    </button>
  );
}
