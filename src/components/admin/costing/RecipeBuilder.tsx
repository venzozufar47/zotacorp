"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  computeHpp,
  type CostingMaterialLite,
  type OverheadMethod,
  type PriceMethod,
  type RoundingMode,
} from "@/lib/costing/calc";
import {
  addRecipeItem,
  updateRecipeItem,
  deleteRecipeItem,
  updateProduct,
  type CostingMaterial,
  type CostingProduct,
  type CostingRecipeItem,
} from "@/lib/actions/costing.actions";
import { fmtPercent, fmtRpPrecise } from "./format";
import { NumField, TextField, formatNum, parseDecimalId } from "./fields";

/** Ambil hanya key-key yang ada di `patch` dari `src` — untuk rollback
 *  per-field tanpa menyentuh field lain. */
function pickKeys<T extends object>(src: T, patch: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) out[k] = src[k];
  return out;
}

/**
 * Layar inti: susun resep + biaya + pricing, dengan breakdown HPP LIVE.
 * State disimpan optimistic (product + items lokal); tiap perubahan
 * commit ke server via startTransition, rollback bila gagal. Breakdown
 * dihitung ulang lewat useMemo (calc.ts) — angka layar == server.
 */
export function RecipeBuilder({
  product: initialProduct,
  initialItems,
  materials,
}: {
  product: CostingProduct;
  initialItems: CostingRecipeItem[];
  materials: CostingMaterial[];
}) {
  const [product, setProduct] = useState(initialProduct);
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();
  const [addMaterialId, setAddMaterialId] = useState("");
  const [addQty, setAddQty] = useState("");
  // Nama yang sudah tersimpan — dipakai untuk deteksi perubahan + revert
  // kalau field dikosongkan.
  const [savedName, setSavedName] = useState(initialProduct.name);

  const activeMaterials = useMemo(
    () => materials.filter((m) => m.is_active),
    [materials]
  );
  const materialsById = useMemo(() => {
    const m = new Map<string, CostingMaterialLite>();
    for (const x of materials)
      m.set(x.id, {
        id: x.id,
        name: x.name,
        purchase_price: x.purchase_price,
        content_per_purchase: x.content_per_purchase,
        usage_unit: x.usage_unit,
      });
    return m;
  }, [materials]);

  const breakdown = useMemo(
    () =>
      computeHpp(
        items.map((it) => ({
          material_id: it.material_id,
          qty: it.qty,
          shrink_factor: it.shrink_factor,
        })),
        product,
        materialsById
      ),
    [items, product, materialsById]
  );

  // ── commit helpers (optimistic + rollback) ──────────────────────────
  // Apply lewat FUNCTIONAL updater; rollback hanya kembalikan KEY yang
  // di-patch ke nilai lama (bukan snapshot penuh) supaya edit lain yang
  // sukses tidak ikut terhapus saat satu commit gagal di tengah burst.
  function commitProduct(patch: Partial<CostingProduct>) {
    const prevVals = pickKeys(product, patch);
    setProduct((p) => ({ ...p, ...patch }));
    startTransition(async () => {
      const res = await updateProduct({ id: product.id, ...patch });
      if (!res.ok) {
        toast.error(res.error);
        setProduct((p) => ({ ...p, ...prevVals }));
      }
    });
  }
  // Nama produk: input terikat langsung ke state (bukan draft), jadi
  // rollback butuh nilai tersimpan (savedName), dan savedName hanya maju
  // saat sukses.
  function commitName(v: string) {
    setProduct((p) => ({ ...p, name: v }));
    startTransition(async () => {
      const res = await updateProduct({ id: product.id, name: v });
      if (!res.ok) {
        toast.error(res.error);
        setProduct((p) => ({ ...p, name: savedName }));
      } else {
        setSavedName(v);
      }
    });
  }
  function commitItem(id: string, patch: Partial<CostingRecipeItem>) {
    const prevItem = items.find((x) => x.id === id);
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    startTransition(async () => {
      const res = await updateRecipeItem({ id, ...patch });
      if (!res.ok) {
        toast.error(res.error);
        if (prevItem) {
          const prevVals = pickKeys(prevItem, patch);
          setItems((xs) =>
            xs.map((x) => (x.id === id ? { ...x, ...prevVals } : x))
          );
        }
      }
    });
  }
  function removeItem(id: string) {
    const prevItem = items.find((x) => x.id === id);
    const prevIdx = items.findIndex((x) => x.id === id);
    setItems((xs) => xs.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await deleteRecipeItem(id);
      if (!res.ok) {
        toast.error(res.error);
        // Sisipkan kembali di posisi semula tanpa mengganggu edit lain.
        if (prevItem)
          setItems((xs) => {
            const next = xs.slice();
            next.splice(Math.min(prevIdx, next.length), 0, prevItem);
            return next;
          });
      }
    });
  }
  function addItem() {
    if (!addMaterialId) {
      toast.error("Pilih bahan dulu");
      return;
    }
    const qty = parseDecimalId(addQty) ?? 0;
    startTransition(async () => {
      const res = await addRecipeItem({
        product_id: product.id,
        material_id: addMaterialId,
        qty,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems((xs) => [
        ...xs,
        {
          id: res.data!.id,
          product_id: product.id,
          material_id: addMaterialId,
          qty,
          shrink_factor: 0,
          sort_order: xs.length,
        },
      ]);
      setAddMaterialId("");
      setAddQty("");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/admin/costing?bu=${encodeURIComponent(product.business_unit)}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={13} /> Semua produk
        </Link>
        <input
          value={product.name}
          onChange={(e) => setProduct({ ...product, name: e.target.value })}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v) {
              // Nama kosong tidak valid → kembalikan ke yang tersimpan.
              setProduct((p) => ({ ...p, name: savedName }));
              return;
            }
            if (v === savedName) return;
            commitName(v);
          }}
          className="font-display text-2xl md:text-3xl font-extrabold tracking-tight bg-transparent border-b-2 border-transparent focus:border-foreground outline-none w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {product.business_unit}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        {/* KIRI: resep + biaya + pricing */}
        <div className="space-y-4">
          {/* Yield + kategori */}
          <Card title="Produk">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <NumField
                label="Yield (hasil/batch)"
                value={product.yield_qty}
                onCommit={(v) => v > 0 && commitProduct({ yield_qty: v })}
                decimal
              />
              <TextField
                label="Satuan hasil"
                value={product.yield_unit ?? ""}
                placeholder="pcs / loyang"
                onCommit={(v) => commitProduct({ yield_unit: v || null })}
              />
              <TextField
                label="Kategori"
                value={product.category ?? ""}
                placeholder="cake / minuman"
                onCommit={(v) => commitProduct({ category: v || null })}
              />
            </div>
          </Card>

          {/* Resep */}
          <Card title="Resep (bahan)">
            {items.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Belum ada bahan. Tambahkan di bawah.
              </p>
            ) : (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const m = materialsById.get(it.material_id);
                  const comp = breakdown.components.find(
                    (c) => c.material_id === it.material_id
                  );
                  return (
                    <div
                      key={it.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">
                          {m ? m.name : "(bahan dihapus)"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {m ? `${fmtRpPrecise(m.purchase_price / m.content_per_purchase)}/${m.usage_unit}` : ""}
                        </div>
                      </div>
                      <InlineNum
                        value={it.qty}
                        onCommit={(v) => commitItem(it.id, { qty: v })}
                        suffix={m?.usage_unit}
                      />
                      <div className="w-20 text-right text-[13px] tabular-nums font-semibold">
                        {comp ? formatRp(comp.cost) : "—"}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        disabled={pending}
                        className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        title="Hapus bahan"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tambah bahan */}
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bahan
                </span>
                <select
                  value={addMaterialId}
                  onChange={(e) => setAddMaterialId(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  <option value="">— pilih bahan —</option>
                  {activeMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.usage_unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Qty
                </span>
                <input
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  inputMode="decimal"
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                onClick={addItem}
                disabled={pending}
                className="inline-flex items-center gap-1 h-9 rounded-lg bg-primary border-2 border-foreground px-3 text-sm font-bold disabled:opacity-60"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
            {activeMaterials.length === 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Belum ada bahan aktif untuk brand ini —{" "}
                <Link
                  href={`/admin/costing/bahan?bu=${encodeURIComponent(product.business_unit)}`}
                  className="underline"
                >
                  tambah di Master Bahan
                </Link>
                .
              </p>
            )}
          </Card>

          {/* Biaya lain */}
          <Card title="Tenaga kerja, kemasan & overhead">
            <div className="grid grid-cols-2 gap-3">
              <NumField
                label="TKL (per batch)"
                value={product.labor}
                onCommit={(v) => commitProduct({ labor: v })}
                money
              />
              <NumField
                label="Kemasan (per batch)"
                value={product.packaging}
                onCommit={(v) => commitProduct({ packaging: v })}
                money
              />
            </div>
            <div className="mt-3">
              <Segmented
                options={[
                  { value: "persen", label: "Overhead %" },
                  { value: "nominal", label: "Overhead Rp" },
                ]}
                value={product.overhead_method}
                onChange={(v) =>
                  commitProduct({ overhead_method: v as OverheadMethod })
                }
              />
              <div className="mt-2">
                {product.overhead_method === "persen" ? (
                  <NumField
                    label="Overhead (% dari bahan)"
                    value={product.overhead_percent * 100}
                    onCommit={(v) =>
                      commitProduct({ overhead_percent: v / 100 })
                    }
                    decimal
                    suffix="%"
                  />
                ) : (
                  <NumField
                    label="Overhead (Rp per batch)"
                    value={product.overhead_nominal}
                    onCommit={(v) => commitProduct({ overhead_nominal: v })}
                    money
                  />
                )}
              </div>
            </div>
          </Card>

          {/* Pricing */}
          <Card title="Harga jual">
            <Segmented
              options={[
                { value: "margin", label: "Margin (atas harga jual)" },
                { value: "markup", label: "Markup (atas HPP)" },
              ]}
              value={product.price_method}
              onChange={(v) =>
                commitProduct({ price_method: v as PriceMethod })
              }
            />
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <NumField
                label={product.price_method === "margin" ? "Target margin" : "Target markup"}
                value={product.target_percent * 100}
                onCommit={(v) => commitProduct({ target_percent: v / 100 })}
                decimal
                suffix="%"
              />
              <NumField
                label="Pembulatan (Rp)"
                value={product.rounding_unit}
                onCommit={(v) =>
                  commitProduct({ rounding_unit: Math.max(1, Math.round(v)) })
                }
              />
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Arah bulat
                </span>
                <select
                  value={product.rounding_mode}
                  onChange={(e) =>
                    commitProduct({ rounding_mode: e.target.value as RoundingMode })
                  }
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  <option value="nearest">Terdekat</option>
                  <option value="ceil">Ke atas</option>
                  <option value="floor">Ke bawah</option>
                </select>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Margin dihitung atas harga jual, markup atas HPP — angka
              keduanya beda. Margin 40% ≠ markup 40%.
            </p>
          </Card>
        </div>

        {/* KANAN: breakdown live (sticky) */}
        <div className="lg:sticky lg:top-4 self-start">
          <BreakdownPanel breakdown={breakdown} product={product} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── sub-komponen ───────────────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
      <h2 className="font-display font-bold text-sm uppercase tracking-wide text-muted-foreground mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function BreakdownPanel({
  breakdown: b,
  product,
}: {
  breakdown: ReturnType<typeof computeHpp>;
  product: CostingProduct;
}) {
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex items-center justify-between gap-3 py-1 ${strong ? "font-bold" : ""}`}>
      <span className={strong ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  const marginTone =
    b.error || b.marginPercent == null || b.marginPercent <= 0
      ? "text-destructive"
      : b.marginPercent < 0.2
        ? "text-warning"
        : "text-success";
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard text-sm">
      <h2 className="font-display font-extrabold text-lg mb-2">Breakdown HPP</h2>
      <Row label="Total bahan" value={formatRp(b.totalMaterial)} />
      <Row label="Kemasan" value={formatRp(b.packaging)} />
      <Row label="TKL" value={formatRp(b.labor)} />
      <Row
        label={`Overhead${product.overhead_method === "persen" ? ` (${fmtPercent(product.overhead_percent)})` : ""}`}
        value={formatRp(b.overhead)}
      />
      <div className="border-t border-border my-1.5" />
      <Row label={`HPP / batch`} value={formatRp(b.hppBatch)} strong />
      <Row
        label={`HPP / unit (yield ${product.yield_qty})`}
        value={b.error === "yield_invalid" ? "—" : formatRp(b.hppUnit)}
        strong
      />
      <div className="border-t-2 border-foreground my-2" />
      {b.error === "margin_too_high" ? (
        <p className="text-[13px] text-destructive font-semibold">
          Target margin harus &lt; 100% (margin dihitung atas harga jual).
        </p>
      ) : b.error === "yield_invalid" ? (
        <p className="text-[13px] text-destructive font-semibold">
          Yield harus &gt; 0.
        </p>
      ) : (
        <>
          <Row
            label="Harga jual"
            value={b.finalPrice != null ? formatRp(b.finalPrice) : "—"}
            strong
          />
          {b.sellingPrice != null && b.finalPrice !== b.sellingPrice && (
            <div className="text-[11px] text-muted-foreground text-right -mt-0.5">
              sebelum bulat {fmtRpPrecise(b.sellingPrice)}
            </div>
          )}
          <div className={`flex items-center justify-between gap-3 py-1 font-bold ${marginTone}`}>
            <span>Margin</span>
            <span className="tabular-nums">
              {b.marginRupiah != null ? formatRp(b.marginRupiah) : "—"}
              {b.marginPercent != null ? ` · ${fmtPercent(b.marginPercent)}` : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border-2 border-foreground overflow-hidden text-[12px] font-semibold">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            "px-3 py-1.5 transition " +
            (value === o.value
              ? "bg-primary text-foreground"
              : "bg-card text-muted-foreground hover:bg-muted")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function InlineNum({
  value,
  onCommit,
  suffix,
}: {
  value: number;
  onCommit: (v: number) => void;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="relative w-24">
      <input
        value={draft ?? formatNum(value, true)}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft == null) return;
          const parsed = parseDecimalId(draft);
          setDraft(null);
          if (parsed != null && parsed >= 0 && parsed !== value)
            onCommit(parsed);
        }}
        className="h-8 w-full rounded-lg border border-border bg-background pl-2 pr-8 text-sm tabular-nums text-right"
      />
      {suffix && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

