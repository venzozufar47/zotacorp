"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Copy,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import {
  captureHppSnapshots,
  createProduct,
  deleteProduct,
  duplicateProduct,
  type CostingDashboard,
  type CostingDashboardRow,
} from "@/lib/actions/costing.actions";
import { downloadHppExcel } from "@/lib/costing/exportHppExcel";
import { downloadQuotePdf } from "@/lib/costing/downloadQuotePdf";
import { fmtPercent } from "../format";
import { parseDecimalId } from "../fields";
import { Menu } from "./Menu";

type Tone = "bad" | "warn" | "ok" | "none";
type Filter = "all" | "thin" | "rise";
type SortKey = "name" | "hpp" | "price" | "margin" | "rise";

const RISE_THRESHOLD = 0.05;

/**
 * Baris yang memang tidak dijual, jadi margin tidak berlaku:
 * - "internal": bahan setengah jadi (dipakai di resep lain, HPP-nya yang diteruskan).
 * - "gratis": harga manual Rp 0 (freebies/promosi, HPP = biaya promosi).
 */
function nonSaleKind(r: CostingDashboardRow): "internal" | "gratis" | null {
  if (r.product.category === "Bahan setengah jadi") return "internal";
  if (r.product.price_method === "manual" && Number(r.product.manual_price) === 0) return "gratis";
  return null;
}

/** Nada margin: merah bila rugi/tak valid, kuning bila di bawah target atau < 20%, abu-abu bila tidak dijual. */
function toneOf(r: CostingDashboardRow): Tone {
  if (nonSaleKind(r)) return "none";
  const mp = r.breakdown.marginPercent;
  if (r.breakdown.error || mp == null || mp <= 0) return "bad";
  const below = r.product.price_method === "margin" && mp < r.product.target_percent;
  return below || mp < 0.2 ? "warn" : "ok";
}

const TONE_TEXT: Record<Tone, string> = {
  bad: "text-destructive",
  warn: "text-warning",
  ok: "text-success",
  none: "text-muted-foreground",
};
const TONE_DOT: Record<Tone, string> = {
  bad: "bg-destructive",
  warn: "bg-warning",
  ok: "bg-success",
  none: "bg-muted-foreground/40",
};

const val = (r: CostingDashboardRow, k: SortKey): number | string | null => {
  switch (k) {
    case "name":
      return r.product.name;
    case "hpp":
      return r.breakdown.hppUnit;
    case "price":
      return r.breakdown.finalPrice ?? null;
    case "margin":
      return r.breakdown.marginPercent;
    case "rise":
      return r.hppRosePct;
  }
};

/**
 * Tab Produk: satu tabel yang menggantikan daftar produk dan dashboard margin.
 * Urutan awal margin terendah dulu, jadi produk yang perlu perhatian ada di atas
 * tanpa membuka halaman lain.
 */
export function ProductsTab({
  brand,
  data,
}: {
  brand: string;
  data: CostingDashboard;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "margin", dir: 1 });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newYield, setNewYield] = useState("1");
  const [newType, setNewType] = useState<"resep" | "paket_jasa">("resep");

  const counts = useMemo(() => {
    let thin = 0;
    let rise = 0;
    for (const r of data.rows) {
      const t = toneOf(r);
      if (t !== "ok" && t !== "none") thin++;
      if (r.hppRosePct != null && r.hppRosePct > RISE_THRESHOLD) rise++;
    }
    return { thin, rise };
  }, [data.rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.rows.filter((r) => {
      // Pencarian menembus filter: produk yang dicari tidak boleh hilang karena chip lain aktif.
      if (q) return r.product.name.toLowerCase().includes(q) || (r.product.category ?? "").toLowerCase().includes(q);
      if (filter === "thin") {
        const t = toneOf(r);
        return t !== "ok" && t !== "none";
      }
      if (filter === "rise") return r.hppRosePct != null && r.hppRosePct > RISE_THRESHOLD;
      return true;
    });
    return [...list].sort((a, b) => {
      // Baris tidak dijual (bahan internal/gratis) selalu di bawah saat urut margin, supaya tak menutupi produk yang perlu perhatian.
      if (sort.key === "margin") {
        const an = toneOf(a) === "none";
        const bn = toneOf(b) === "none";
        if (an !== bn) return an ? 1 : -1;
      }
      const x = val(a, sort.key);
      const y = val(b, sort.key);
      // Nilai kosong: di awal untuk margin (tak valid perlu dilihat dulu), di akhir untuk kolom lain.
      if (x == null || y == null) {
        if (x == null && y == null) return a.product.name.localeCompare(b.product.name, "id");
        const nullFirst = sort.key === "margin" && sort.dir === 1;
        return (x == null ? -1 : 1) * (nullFirst ? 1 : -1);
      }
      const c =
        typeof x === "string"
          ? x.localeCompare(String(y), "id", { sensitivity: "base" })
          : (x as number) - (y as number);
      return c * sort.dir || a.product.name.localeCompare(b.product.name, "id");
    });
  }, [data.rows, query, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "margin" ? 1 : -1 }));
  }

  function submitCreate() {
    const name = newName.trim();
    if (!name) return toast.error("Nama produk wajib diisi");
    const yieldQty = parseDecimalId(newYield);
    if (yieldQty == null || !(yieldQty > 0)) return toast.error("Yield harus lebih dari 0");
    startTransition(async () => {
      const res = await createProduct({ business_unit: brand, name, yield_qty: yieldQty, type: newType });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/admin/costing/${res.data!.id}`);
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  const hasRows = data.rows.length > 0;

  return (
    <div className="space-y-3">
      {/* Satu baris: ringkasan yang bisa diketuk jadi filter, cari, dan aksi */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Semua <b className="tabular-nums">{data.rows.length}</b>
        </FilterChip>
        <FilterChip active={filter === "thin"} onClick={() => setFilter("thin")} tone={counts.thin ? "warn" : undefined}>
          Margin tipis <b className="tabular-nums">{counts.thin}</b>
        </FilterChip>
        <FilterChip active={filter === "rise"} onClick={() => setFilter("rise")} tone={counts.rise ? "bad" : undefined}>
          HPP naik &gt;5% <b className="tabular-nums">{counts.rise}</b>
        </FilterChip>
        {data.avgMarginPercent != null && (
          <span className="ml-1 text-xs text-muted-foreground">
            Rata-rata margin <b className="tabular-nums text-foreground">{fmtPercent(data.avgMarginPercent)}</b>
          </span>
        )}

        <label className="relative ml-auto block w-56">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk…"
            aria-label="Cari produk"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-7 text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X size={13} />
            </button>
          )}
        </label>
        <Menu
          items={[
            {
              label: "Ambil snapshot HPP semua produk",
              icon: <Camera size={15} />,
              disabled: pending || !hasRows,
              onSelect: () =>
                startTransition(async () => {
                  const res = await captureHppSnapshots(brand);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success(`Snapshot ${res.data?.count ?? 0} produk diambil`);
                  router.refresh();
                }),
            },
            {
              label: "Ekspor ke Excel",
              icon: <FileSpreadsheet size={15} />,
              disabled: !hasRows,
              onSelect: async () => {
                try {
                  await downloadHppExcel({ brand, rows: data.rows });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Gagal ekspor");
                }
              },
            },
          ]}
        />
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus size={15} /> Produk
          </button>
        )}
      </div>

      {creating && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          <Field label="Nama produk" className="min-w-52 flex-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCreate()}
              placeholder="mis. Red Velvet"
              className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm"
            />
          </Field>
          <Field label="Yield" className="w-24">
            <input
              value={newYield}
              onChange={(e) => setNewYield(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCreate()}
              inputMode="decimal"
              className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm tabular-nums"
            />
          </Field>
          <Field label="Tipe">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "resep" | "paket_jasa")}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="resep">Resep (bahan)</option>
              <option value="paket_jasa">Paket jasa</option>
            </select>
          </Field>
          <button
            type="button"
            disabled={pending}
            onClick={submitCreate}
            className="h-9 cursor-pointer rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Buat &amp; susun resep
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="h-9 cursor-pointer rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Batal
          </button>
        </div>
      )}

      {!hasRows ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <FlaskConical size={26} aria-hidden className="mx-auto mb-2 opacity-60" />
          Belum ada produk untuk {brand}. Klik “Produk” untuk mulai.
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {query ? <>Tidak ada produk cocok “{query.trim()}”.</> : "Tidak ada produk di filter ini."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <Th k="name" sort={sort} onSort={toggleSort} className="text-left">Produk</Th>
                <Th k="hpp" sort={sort} onSort={toggleSort}>HPP / unit</Th>
                <Th k="price" sort={sort} onSort={toggleSort}>Harga jual</Th>
                <Th k="margin" sort={sort} onSort={toggleSort}>Margin</Th>
                <Th k="rise" sort={sort} onSort={toggleSort}>vs snapshot</Th>
                <th className="w-28" aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const tone = toneOf(r);
                const b = r.breakdown;
                const mp = b.marginPercent;
                const rise = r.hppRosePct;
                return (
                  <tr
                    key={r.product.id}
                    onClick={() => router.push(`/admin/costing/${r.product.id}`)}
                    className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/admin/costing/${r.product.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold hover:underline"
                      >
                        {r.product.name}
                      </Link>
                      {(r.product.category || r.product.type === "paket_jasa") && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[r.product.type === "paket_jasa" ? "paket jasa" : null, r.product.category]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatRp(b.hppUnit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {b.finalPrice != null ? formatRp(b.finalPrice) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn("inline-flex items-center gap-1.5 font-semibold tabular-nums", TONE_TEXT[tone])}>
                        <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT[tone])} />
                        {nonSaleKind(r) === "internal"
                          ? "bahan internal"
                          : nonSaleKind(r) === "gratis"
                            ? "gratis"
                            : b.error === "margin_too_high"
                              ? "target >100%"
                              : b.error === "yield_invalid"
                                ? "yield 0"
                                : mp != null
                                  ? fmtPercent(mp)
                                  : "—"}
                        <span className="sr-only">
                          {tone === "none"
                            ? " (tidak dijual, margin tidak berlaku)"
                            : tone === "bad"
                              ? " (rugi atau tidak valid)"
                              : tone === "warn"
                                ? " (tipis)"
                                : " (sehat)"}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                      {rise == null ? (
                        <span className="text-muted-foreground" title="Belum ada snapshot pembanding">—</span>
                      ) : Math.abs(rise) < 0.005 ? (
                        <span className="text-muted-foreground">sama</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 font-semibold",
                            rise > RISE_THRESHOLD ? "text-destructive" : rise > 0 ? "text-warning" : "text-success"
                          )}
                        >
                          {rise > 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
                          {rise > 0 ? "+" : "−"}
                          {fmtPercent(Math.abs(rise))}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <IconBtn label="Duplikat" disabled={pending} onClick={() => act(() => duplicateProduct(r.product.id), "Produk diduplikat")}>
                          <Copy size={15} />
                        </IconBtn>
                        <IconBtn
                          label="Kutipan PDF"
                          onClick={async () => {
                            try {
                              await downloadQuotePdf({ brand: r.product.business_unit, row: r });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Gagal membuat PDF");
                            }
                          }}
                        >
                          <FileText size={15} />
                        </IconBtn>
                        <IconBtn
                          label="Hapus"
                          danger
                          disabled={pending}
                          onClick={() => {
                            if (!confirm(`Hapus produk "${r.product.name}"?`)) return;
                            act(() => deleteProduct(r.product.id), "Produk dihapus");
                          }}
                        >
                          <Trash2 size={15} />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  k,
  sort,
  onSort,
  children,
  className,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const on = sort.key === k;
  return (
    <th
      aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2 text-right font-medium", className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex cursor-pointer items-center gap-1 hover:text-foreground", on && "text-foreground")}
      >
        {children}
        {on && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  );
}

function FilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "warn" | "bad";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
        !active && tone === "warn" && "text-warning",
        !active && tone === "bad" && "text-destructive"
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
        danger && "hover:bg-destructive/10 hover:text-destructive"
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
