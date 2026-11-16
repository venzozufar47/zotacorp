import Link from "next/link";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { EXPENSE_CATEGORIES, expenseCategory } from "@/lib/procurement/categories";
import { walletLabel } from "@/lib/procurement/wallet-label";
import type { MoneySource } from "@/lib/actions/procurement-purchases.actions";

export interface PurchaseFilterValues {
  /** YYYY-MM-DD, kosong = tanpa batas awal. */
  from: string;
  to: string;
  /** Nilai kategori buku kas, kosong = semua. */
  category: string;
  source: MoneySource | "";
}

const field = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";
const label = "space-y-0.5 text-[11px] font-semibold text-muted-foreground";

export function hasActiveFilter(f: PurchaseFilterValues): boolean {
  return !!(f.from || f.to || f.category || f.source);
}

const short = (ymd: string) =>
  new Date(ymd + "T00:00:00Z").toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Filter riwayat nota untuk petugas. Formulir GET biasa (tanpa JS klien): nilainya jadi parameter URL.
 * Tingkat 1: satu baris tertutup yang meringkas filter aktif. Dibuka: kategori dan tanggal. Sumber uang dilipat lagi.
 */
export function PurchaseFilters({
  brand,
  values,
  resetHref,
}: {
  brand: string;
  values: PurchaseFilterValues;
  resetHref: string;
}) {
  const active = hasActiveFilter(values);
  const summary = [
    values.category ? (expenseCategory(values.category)?.label ?? values.category) : null,
    values.from || values.to ? `${values.from ? short(values.from) : "awal"}–${values.to ? short(values.to) : "kini"}` : null,
    values.source ? (values.source === "shopee" ? walletLabel(brand) : values.source === "laci" ? "Uang laci" : "Uang pengadaan") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sources: { value: MoneySource; label: string }[] = [
    { value: "pengadaan", label: "Uang pengadaan" },
    { value: "laci", label: "Uang laci" },
    { value: "shopee", label: walletLabel(brand) },
  ];
  return (
    <details open={active} className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
        <SlidersHorizontal size={14} aria-hidden className="shrink-0" />
        <span className="shrink-0">Filter</span>
        {summary && <span className="min-w-0 flex-1 truncate text-xs font-normal text-primary">{summary}</span>}
      </summary>
      <form method="get" action="/pengadaan" className="space-y-2.5 border-t border-border px-3 py-2.5">
        <input type="hidden" name="tab" value="belanja" />
        <input type="hidden" name="bagian" value="riwayat" />
        <input type="hidden" name="bu" value={brand} />
        <label className={`block ${label}`}>
          Kategori
          <select name="kat" defaultValue={values.category} className={field}>
            <option value="">Semua</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            Dari
            <input type="date" name="dari" defaultValue={values.from} max={values.to || undefined} className={field} />
          </label>
          <label className={label}>
            Sampai
            <input type="date" name="sampai" defaultValue={values.to} min={values.from || undefined} className={field} />
          </label>
        </div>
        <details open={!!values.source} className="group/more">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight size={12} aria-hidden className="transition-transform group-open/more:rotate-90" /> Sumber uang
          </summary>
          <select name="sumber" defaultValue={values.source} aria-label="Sumber uang" className={`${field} mt-1`}>
            <option value="">Semua sumber</option>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </details>
        <div className="flex items-center gap-1">
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Terapkan
          </button>
          {active && (
            <Link href={resetHref} prefetch={false} className="inline-flex h-9 items-center px-3 text-sm font-semibold text-muted-foreground">
              Atur ulang
            </Link>
          )}
        </div>
      </form>
    </details>
  );
}
