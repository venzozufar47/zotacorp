"use client";

import { X } from "lucide-react";
import {
  REGISTRY_BUSINESS_UNITS,
  branchesFor,
  buLabel,
} from "@/lib/admin-registry/taxonomy";

export const inputCls =
  "mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm";

/** Dialog sederhana (bottom-sheet di HP, kartu di desktop) — gaya sama dgn Kartu SIM. */
export function Shell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-4 space-y-3 max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>}
    </label>
  );
}

/** Pilih business unit; dropdown cabang muncul hanya kalau BU-nya punya cabang. */
export function BuBranchSelect({
  bu,
  branch,
  onChange,
}: {
  bu: string;
  branch: string | null;
  onChange: (bu: string, branch: string | null) => void;
}) {
  const branches = branchesFor(bu);
  return (
    <div className={`grid gap-2 ${branches.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
      <select
        className={inputCls + " !mt-0"}
        value={bu}
        aria-label="Business unit"
        onChange={(e) => {
          const next = e.target.value;
          const keep = branch && branchesFor(next).includes(branch) ? branch : null;
          onChange(next, keep);
        }}
      >
        {REGISTRY_BUSINESS_UNITS.map((b) => (
          <option key={b} value={b}>
            {buLabel(b)}
          </option>
        ))}
      </select>
      {branches.length > 0 && (
        <select
          className={inputCls + " !mt-0"}
          value={branch ?? ""}
          aria-label="Cabang"
          onChange={(e) => onChange(bu, e.target.value || null)}
        >
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Input nominal rupiah: hanya angka, tampil dengan titik ribuan. */
export function RupiahInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      className={className ?? inputCls}
      inputMode="numeric"
      placeholder={placeholder ?? "0"}
      value={value == null ? "" : new Intl.NumberFormat("id-ID").format(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
        onChange(digits === "" ? null : Number(digits));
      }}
    />
  );
}

export const primaryBtn =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50";

export const smallBtn =
  "inline-flex items-center gap-1 rounded-lg border border-border px-2.5 h-8 text-xs font-medium hover:bg-muted disabled:opacity-50";
