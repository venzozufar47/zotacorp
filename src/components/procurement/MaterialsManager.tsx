"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Plus, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDecimalId, parseMoneyId } from "@/lib/utils/parse-number";
import { NumberHint } from "@/components/shared/NumberHint";
import { PURCHASE_UNITS, unitOptions } from "@/lib/costing/unit-options";
import { formatRp } from "@/lib/cashflow/format";
import {
  saveMaterial,
  setMaterialActive,
  type MaterialDetail,
} from "@/lib/actions/procurement-materials.actions";
import type { BrandQueueItem } from "@/lib/actions/procurement-brands.actions";
import { BrandPanel, type BrandPanelMaterial } from "./BrandPanel";

const USAGE_UNITS = ["gram", "ml", "pcs", "meter"] as const;

interface Draft {
  id?: string;
  name: string;
  category: string;
  purchaseUnit: string;
  content: string;
  usageUnit: string;
  shopeeUrl: string;
  price: string;
}

/** Nilai semu pilihan "kategori baru" di dropdown kategori. */
const NEW_CATEGORY = "__new__";

const EMPTY: Draft = { name: "", category: "", purchaseUnit: "", content: "", usageUnit: "gram", shopeeUrl: "", price: "" };

const inputCls =
  "w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-base outline-none focus:border-foreground md:text-sm";

/** Tab "Bahan": petugas menambah bahan baru dan merapikan detailnya sendiri (owner diberi tahu, bisa mengurungkan). */
export function MaterialsManager({
  businessUnit,
  materials,
  queue = [],
  queueTotal = 0,
}: {
  businessUnit: string;
  materials: MaterialDetail[];
  /** Antrean "Perlu dilengkapi" (data halal merek yang kurang, sertifikat habis, bahan dibeli tanpa merek). */
  queue?: BrandQueueItem[];
  queueTotal?: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [brandFor, setBrandFor] = useState<{ material: BrandPanelMaterial; startAdding: boolean } | null>(null);
  const openBrands = (m: MaterialDetail, startAdding = false) =>
    setBrandFor({ material: { id: m.id, name: m.name, category: m.category, halalKind: m.halalKind, inHalalList: m.inHalalList }, startAdding });
  /** true = mengetik nama kategori baru (bukan memilih dari daftar). */
  const [newCategory, setNewCategory] = useState(false);
  const [pending, start] = useTransition();

  const categories = useMemo(
    () => [...new Set(materials.map((m) => m.category).filter((c): c is string => !!c))].sort(),
    [materials]
  );
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return materials.filter((m) => (showInactive || m.isActive) && (!needle || m.name.toLowerCase().includes(needle)));
  }, [materials, q, showInactive]);
  const inactiveCount = materials.filter((m) => !m.isActive).length;
  const editing = !!draft?.id;
  const current = draft?.id ? materials.find((m) => m.id === draft.id) : undefined;
  // Isi per kemasan / satuan beli berubah → harga lama per satuan beli tak berlaku lagi: harga baru wajib.
  const packChanged =
    !!draft && !!current &&
    ((parseDecimalId(draft.content) ?? NaN) !== current.contentPerPurchase ||
      draft.purchaseUnit.trim().toLowerCase() !== current.purchaseUnit.trim().toLowerCase());
  const newContent = draft ? (parseDecimalId(draft.content) ?? 0) : 0;
  const newPrice = draft ? parseMoneyId(draft.price) : 0;

  function open(m?: MaterialDetail) {
    setNewCategory(false);
    setDraft(
      m
        ? {
            id: m.id,
            name: m.name,
            category: m.category ?? "",
            purchaseUnit: m.purchaseUnit,
            content: String(m.contentPerPurchase),
            usageUnit: m.usageUnit,
            shopeeUrl: m.shopeeUrl ?? "",
            // Harga hanya diminta lagi bila isi/satuan beli diubah; kosongkan supaya petugas mengetik harga yang baru.
            price: "",
          }
        : { ...EMPTY }
    );
  }

  function submit() {
    if (!draft) return;
    const content = parseDecimalId(draft.content) ?? NaN;
    const price = parseMoneyId(draft.price);
    start(async () => {
      const res = await saveMaterial({
        businessUnit,
        id: draft.id,
        name: draft.name,
        category: draft.category,
        purchaseUnit: draft.purchaseUnit,
        contentPerPurchase: content,
        usageUnit: draft.usageUnit,
        shopeeUrl: draft.shopeeUrl,
        purchasePrice: draft.id && !packChanged ? undefined : price,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(draft.id ? "Perubahan disimpan" : "Bahan ditambahkan — owner akan meninjau");
      setDraft(null);
      router.refresh();
    });
  }

  function toggleActive(m: MaterialDetail) {
    start(async () => {
      const res = await setMaterialActive({ id: m.id, active: !m.isActive });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(m.isActive ? "Bahan dinonaktifkan" : "Bahan diaktifkan lagi");
      setDraft(null);
      router.refresh();
    });
  }

  const set = (k: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Tambah bahan baru atau rapikan detailnya di sini. Owner otomatis mendapat catatan setiap perubahan. Harga acuan
        berubah sendiri dari nota belanja.
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari bahan…"
            className={cn(inputCls, "pl-9")}
          />
        </div>
        <button
          type="button"
          onClick={() => open()}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border-2 border-foreground bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
        >
          <Plus size={16} /> Baru
        </button>
      </div>

      {queueTotal > 0 && (
        <section className="space-y-1.5 rounded-2xl border border-warning/50 bg-warning/10 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <AlertTriangle size={14} className="text-warning" /> Merek perlu dilengkapi ({queueTotal})
          </h3>
          <p className="text-[11.5px] text-muted-foreground">Untuk Daftar Bahan Halal. Boleh dicicil; yang paling banyak dipakai di atas.</p>
          <ul className="divide-y divide-border/60">
            {queue.slice(0, 6).map((it) => {
              const m = materials.find((x) => x.id === it.materialId);
              if (!m) return null;
              return (
                <li key={`${it.materialId}-${it.brand?.id ?? "none"}`}>
                  <button type="button" onClick={() => openBrands(m, !it.brand)} className="flex w-full items-center gap-2 py-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {it.materialName}
                        {it.brand && <span className="font-normal text-muted-foreground"> · {it.brand.name}</span>}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {it.expiry === "habis" ? "Sertifikat habis" : it.expiry === "segera" ? "Sertifikat segera habis" : `Kurang: ${it.missing.join(", ")}`}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-primary">Lengkapi</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {inactiveCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Tampilkan yang nonaktif ({inactiveCount})
        </label>
      )}

      <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Tidak ada bahan.</li>}
        {rows.map((m) => (
          <li key={m.id} className="flex items-center">
            <button type="button" onClick={() => open(m)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left active:bg-muted">
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-semibold", !m.isActive && "text-muted-foreground line-through")}>
                  {m.name}
                  {m.pending && (
                    <span className="ml-2 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold no-underline">baru</span>
                  )}
                </p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {formatRp(m.purchasePrice)} / {m.purchaseUnit} · isi {m.contentPerPurchase.toLocaleString("id-ID")} {m.usageUnit}
                  {m.category ? ` · ${m.category}` : ""}
                </p>
              </div>
              <span className="text-xs font-semibold text-primary">Ubah</span>
            </button>
            <button
              type="button"
              onClick={() => openBrands(m)}
              aria-label={`Merek ${m.name}`}
              className={cn(
                "mr-3 inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                m.brandsToComplete > 0 ? "border-warning/60 bg-warning/15" : "border-border bg-card text-muted-foreground"
              )}
            >
              <Tag size={11} />
              <span className="max-w-24 truncate">{m.currentBrand ?? (m.brandCount > 0 ? `${m.brandCount} merek` : "Merek")}</span>
            </button>
          </li>
        ))}
      </ul>

      {brandFor && <BrandPanel material={brandFor.material} startAdding={brandFor.startAdding} onClose={() => setBrandFor(null)} />}

      {draft && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background md:items-center md:justify-center md:bg-black/40">
          <div className="flex min-h-0 flex-1 flex-col bg-background md:max-h-[90vh] md:w-full md:max-w-md md:flex-none md:rounded-2xl md:border md:border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-display text-base font-bold">{editing ? "Ubah bahan" : "Bahan baru"}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="Tutup" className="rounded-full p-2 hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <Field label="Nama bahan">
                <input value={draft.name} onChange={set("name")} className={inputCls} maxLength={80} />
              </Field>
              <Field label="Kategori (opsional)">
                <select
                  value={newCategory ? NEW_CATEGORY : draft.category}
                  onChange={(e) => {
                    if (e.target.value === NEW_CATEGORY) {
                      setNewCategory(true);
                      setDraft((d) => (d ? { ...d, category: "" } : d));
                    } else {
                      setNewCategory(false);
                      setDraft((d) => (d ? { ...d, category: e.target.value } : d));
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">Tanpa kategori</option>
                  {draft.category && !categories.includes(draft.category) && !newCategory && (
                    <option value={draft.category}>{draft.category}</option>
                  )}
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>+ Kategori baru…</option>
                </select>
                {newCategory && (
                  <input
                    value={draft.category}
                    onChange={set("category")}
                    placeholder="Nama kategori baru"
                    autoFocus
                    className={`${inputCls} mt-2`}
                    maxLength={40}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Satuan beli">
                  <select value={draft.purchaseUnit} onChange={set("purchaseUnit")} className={inputCls}>
                    {!draft.purchaseUnit && <option value="">Pilih…</option>}
                    {unitOptions(PURCHASE_UNITS, current?.purchaseUnit).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Isi per satuan beli">
                  <input value={draft.content} onChange={set("content")} inputMode="decimal" placeholder="25.000" className={inputCls} />
                  <NumberHint value={draft.content} />
                </Field>
              </div>
              <Field label="Satuan pakai (di resep)">
                <div className="flex gap-1.5">
                  {USAGE_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      disabled={!!current?.usageUnitLocked}
                      onClick={() => setDraft((d) => (d ? { ...d, usageUnit: u } : d))}
                      className={cn(
                        "flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                        draft.usageUnit === u ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card"
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
                {editing && current && !USAGE_UNITS.includes(current.usageUnit as never) && (
                  <p className="mt-1 text-[11.5px] text-muted-foreground">Satuan sekarang: {current.usageUnit}</p>
                )}
                {current?.usageUnitLocked && (
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Terkunci — sudah dipakai di resep/stok. Hubungi owner bila perlu diganti.
                  </p>
                )}
              </Field>
              {editing && !packChanged && (
                <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Harga acuan sekarang <b>{formatRp(current?.purchasePrice ?? 0)}</b> / {current?.purchaseUnit}. Berubah otomatis dari nota belanja —
                  tidak diedit di sini.
                </p>
              )}
              {editing && packChanged && (
                <Field label={`Harga baru per ${draft.purchaseUnit.trim() || "satuan beli"} (Rp)`}>
                  <input value={draft.price} onChange={set("price")} inputMode="decimal" placeholder="wajib diisi" className={inputCls} />
                  <NumberHint value={draft.price} />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Isi atau satuan beli berubah, jadi harga lama ({formatRp(current?.purchasePrice ?? 0)} / {current?.purchaseUnit}) tidak lagi sesuai.
                    {newPrice > 0 && newContent > 0 && ` Jadinya ${formatRp(newPrice / newContent)} per ${draft.usageUnit}.`}
                  </p>
                </Field>
              )}
              {!editing && (
                <Field label="Harga beli awal (Rp per satuan beli)">
                  <input value={draft.price} onChange={set("price")} inputMode="decimal" placeholder="48.000" className={inputCls} />
                  <NumberHint value={draft.price} />
                </Field>
              )}
              <Field label="Link beli (opsional)">
                <input value={draft.shopeeUrl} onChange={set("shopeeUrl")} inputMode="url" className={inputCls} />
              </Field>
              {(draft.content || current) && (
                <p className="text-[11.5px] text-muted-foreground">
                  Perubahan isi per kemasan / satuan pakai memengaruhi HPP — owner akan diberi tahu.
                </p>
              )}
              {editing && current && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleActive(current)}
                  className="w-full rounded-xl border-2 border-border py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  {current.isActive ? "Nonaktifkan bahan" : "Aktifkan lagi"}
                </button>
              )}
            </div>
            <div className="border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="w-full rounded-xl border-2 border-foreground bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {pending ? "Menyimpan…" : editing ? "Simpan perubahan" : "Tambah bahan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
