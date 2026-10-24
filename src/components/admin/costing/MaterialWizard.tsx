"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  addRecipeItem,
  createMaterial,
  deleteMaterial,
  deleteRecipeItem,
  updateMaterial,
  updateRecipeItem,
  type CostingMaterial,
  type CostingProductWithHpp,
  type CostingUnit,
} from "@/lib/actions/costing.actions";
import { computeImpact, unitCostPreview, type LinkDraft, type ProductImpact } from "@/lib/costing/impact";
import { formatRp } from "@/lib/cashflow/format";
import { cn } from "@/lib/utils";
import { fmtPercent, fmtRpPrecise } from "./format";
import { formatNum, parseDecimalId } from "./fields";
import { PURCHASE_UNITS, USAGE_UNITS, unitOptions } from "@/lib/costing/unit-options";
import { impactProducts, materialLite, recipeUnitChoices, unitsMap } from "./costing-data";

/** Nilai semu pilihan "kategori baru" di dropdown kategori. */
const NEW_CATEGORY = "__new__";

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Bahan" },
  { n: 2, label: "Satuan & harga" },
  { n: 3, label: "Dipakai di produk" },
];

interface LinkState {
  on: boolean;
  qty: string;
  /** "" = satuan pakai bahan. */
  unit: string;
}

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-foreground";
const labelCls = "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * Panel bertahap untuk membuat / mengubah satu bahan DAN menautkannya ke produk, dengan simulasi dampak ke
 * HPP/harga jual/margin semua produk yang tampil langsung (dihitung di browser dengan `computeHpp` yang sama
 * seperti server) — dampaknya terlihat sebelum apa pun disimpan.
 */
export function MaterialWizard({
  brand,
  material,
  materials,
  products,
  units,
  categories,
  onClose,
}: {
  brand: string;
  /** null = bahan baru. */
  material: CostingMaterial | null;
  materials: CostingMaterial[];
  products: CostingProductWithHpp[];
  units: CostingUnit[];
  categories: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>(1);

  // Kunci scroll halaman di belakang popup.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const editing = material != null;

  const [name, setName] = useState(material?.name ?? "");
  const [category, setCategory] = useState(material?.category ?? "");
  /** true = mengetik nama kategori baru (bukan memilih dari daftar). */
  const [newCategory, setNewCategory] = useState(false);
  const [purchaseUnit, setPurchaseUnit] = useState(material?.purchase_unit ?? "");
  const initialPrice = material ? String(Math.round(material.purchase_price)) : "";
  const initialContent = material ? formatNum(material.content_per_purchase, true) : "";
  const initialShrink = material ? formatNum(material.shrink_factor * 100, true) : "0";
  const [price, setPrice] = useState(initialPrice);
  const [content, setContent] = useState(initialContent);
  const [usageUnit, setUsageUnit] = useState(material?.usage_unit ?? "");
  const [shrink, setShrink] = useState(initialShrink);
  const [shopee, setShopee] = useState(material?.shopee_url ?? "");

  /** Baris resep bahan ini yang sudah ada (per produk). */
  const existing = useMemo(() => {
    const m = new Map<string, { id: string; qty: number; unit: string | null }>();
    if (!material) return m;
    for (const r of products)
      for (const it of r.items)
        if (it.material_id === material.id) m.set(r.product.id, { id: it.id, qty: it.qty, unit: it.unit });
    return m;
  }, [material, products]);

  const [links, setLinks] = useState<Record<string, LinkState>>(() => {
    const init: Record<string, LinkState> = {};
    for (const [pid, it] of existing) init[pid] = { on: true, qty: formatNum(it.qty, true), unit: it.unit ?? "" };
    return init;
  });
  const [productQuery, setProductQuery] = useState("");

  const unitMap = useMemo(() => unitsMap(units), [units]);
  const impactProds = useMemo(() => impactProducts(products), [products]);
  const materialId = material?.id ?? "__new__";
  const lites = useMemo(() => materials.filter((m) => m.is_active || m.id === materialId).map(materialLite), [materials, materialId]);

  // Kotak yang tak diketik ulang memakai nilai tersimpan apa adanya (kotak hanya menampilkan versi dibulatkan).
  const priceNum = material && price === initialPrice ? material.purchase_price : Number(price.replace(/[^\d]/g, ""));
  const contentNum = material && content === initialContent ? material.content_per_purchase : parseDecimalId(content);
  const shrinkNum = material && shrink === initialShrink ? material.shrink_factor : Math.max(0, parseDecimalId(shrink) ?? 0) / 100;
  const perUnit = contentNum != null ? unitCostPreview(priceNum, contentNum) : null;

  const linkDrafts: LinkDraft[] = useMemo(
    () =>
      Object.entries(links)
        .filter(([, l]) => l.on && (parseDecimalId(l.qty) ?? 0) > 0)
        .map(([productId, l]) => ({ productId, qty: parseDecimalId(l.qty) as number, unit: l.unit || null })),
    [links]
  );

  // Tanpa useMemo manual: React Compiler yang memoize (hitungan murni, input kecil).
  const impact =
    contentNum == null || !(contentNum > 0) || !usageUnit.trim()
      ? null
      : computeImpact({
          products: impactProds,
          materials: lites,
          units: unitMap,
          draft: {
            id: materialId,
            name: name.trim() || "Bahan baru",
            purchase_price: priceNum,
            content_per_purchase: contentNum,
            usage_unit: usageUnit.trim(),
            shrink_factor: shrinkNum,
          },
          links: linkDrafts,
        });

  const usageUnitChanged = editing && material.usage_unit !== usageUnit.trim() && existing.size > 0;
  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products
      .filter((r) => r.product.is_active && (!q || r.product.name.toLowerCase().includes(q)))
      .sort((a, b) => {
        const la = links[a.product.id]?.on ? 0 : 1;
        const lb = links[b.product.id]?.on ? 0 : 1;
        return la - lb || a.product.name.localeCompare(b.product.name, "id");
      });
  }, [products, productQuery, links]);

  function stepError(s: Step): string | null {
    if (s >= 1 && !name.trim()) return "Nama bahan wajib diisi";
    if (s >= 2) {
      if (!purchaseUnit.trim()) return "Satuan beli wajib diisi (mis. sak, dus)";
      if (!usageUnit.trim()) return "Satuan pakai wajib diisi (mis. gram, ml, pcs)";
      if (contentNum == null || !(contentNum > 0)) return "Isi per satuan beli harus lebih dari 0";
      if (!Number.isFinite(priceNum) || priceNum < 0) return "Harga beli tidak valid";
    }
    if (s >= 3) {
      const bad = Object.values(links).some((l) => l.on && !((parseDecimalId(l.qty) ?? 0) > 0));
      if (bad) return "Produk yang dicentang perlu takaran lebih dari 0";
    }
    return null;
  }

  function next() {
    const err = stepError(step);
    if (err) return toast.error(err);
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }

  function save() {
    const err = stepError(3);
    if (err) return toast.error(err);
    start(async () => {
      const res = material ? await saveEdit(material) : await saveNew();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(material ? "Perubahan disimpan" : "Bahan ditambahkan");
      onClose();
      router.refresh();
    });
  }

  async function saveNew(): Promise<{ ok: true } | { ok: false; error: string }> {
    const created = await createMaterial({
      business_unit: brand,
      name: name.trim(),
      category: category.trim() || null,
      purchase_unit: purchaseUnit.trim(),
      purchase_price: priceNum,
      content_per_purchase: contentNum as number,
      usage_unit: usageUnit.trim(),
      shrink_factor: shrinkNum,
      shopee_url: shopee.trim() || null,
    });
    if (!created.ok || !created.data) return { ok: false, error: created.ok ? "Gagal membuat bahan" : created.error };
    const materialId = created.data.id;
    const madeItems: string[] = [];
    for (const l of linkDrafts) {
      const r = await addRecipeItem({ product_id: l.productId, material_id: materialId, qty: l.qty, unit: l.unit });
      if (!r.ok || !r.data) {
        // Batalkan semuanya: bahan baru yang setengah tertaut lebih berbahaya daripada tidak ada.
        for (const id of madeItems) await deleteRecipeItem(id);
        await deleteMaterial(materialId);
        return { ok: false, error: `Gagal menautkan produk (${r.ok ? "tak diketahui" : r.error}). Tidak ada yang disimpan.` };
      }
      madeItems.push(r.data.id);
    }
    return { ok: true };
  }

  async function saveEdit(m: CostingMaterial): Promise<{ ok: true } | { ok: false; error: string }> {
    const patch: Parameters<typeof updateMaterial>[0] = { id: m.id };
    if (name.trim() !== m.name) patch.name = name.trim();
    if ((category.trim() || null) !== m.category) patch.category = category.trim() || null;
    if (purchaseUnit.trim() !== m.purchase_unit) patch.purchase_unit = purchaseUnit.trim();
    // Hanya yang diketik ulang: nilai tersimpan bisa berdesimal (rata-rata tertimbang), sedangkan kotak menampilkan bilangan bulat.
    if (price !== initialPrice && priceNum !== m.purchase_price) patch.purchase_price = priceNum;
    if (content !== initialContent && contentNum !== m.content_per_purchase) patch.content_per_purchase = contentNum as number;
    if (usageUnit.trim() !== m.usage_unit) patch.usage_unit = usageUnit.trim();
    if (shrink !== initialShrink && Math.abs(shrinkNum - m.shrink_factor) > 1e-9) patch.shrink_factor = shrinkNum;
    if ((shopee.trim() || null) !== m.shopee_url) patch.shopee_url = shopee.trim() || null;
    if (Object.keys(patch).length > 1) {
      const r = await updateMaterial(patch);
      if (!r.ok) return { ok: false, error: r.error };
    }
    let failed = 0;
    const wanted = new Map(linkDrafts.map((l) => [l.productId, l]));
    for (const r of products) {
      const have = existing.get(r.product.id);
      const want = wanted.get(r.product.id);
      let res: { ok: boolean } | null = null;
      if (have && !want) res = await deleteRecipeItem(have.id);
      else if (have && want && (have.qty !== want.qty || have.unit !== want.unit))
        res = await updateRecipeItem({ id: have.id, qty: want.qty, unit: want.unit });
      else if (!have && want)
        res = await addRecipeItem({ product_id: r.product.id, material_id: m.id, qty: want.qty, unit: want.unit });
      if (res && !res.ok) failed++;
    }
    return failed > 0
      ? { ok: false, error: `Bahan tersimpan, tetapi ${failed} tautan produk gagal. Muat ulang dan periksa.` }
      : { ok: true };
  }

  const setLink = (pid: string, patch: Partial<LinkState>) =>
    setLinks((cur) => ({ ...cur, [pid]: { ...(cur[pid] ?? { on: false, qty: "", unit: "" }), ...patch } }));

  // Portal ke body: pembungkus halaman memakai transform (animate-fade-up) yang menjadikan `fixed` relatif ke
  // pembungkus itu, bukan ke layar — popup jadi setinggi halaman dan harus di-scroll jauh.
  const modal = (
    <div className="fixed inset-0 z-[60] flex bg-black/40 md:items-center md:justify-center">
      <div className="flex h-full w-full flex-col bg-background md:h-[88vh] md:max-w-5xl md:rounded-2xl md:border-2 md:border-foreground">
        {/* Kepala + penanda langkah */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-base font-bold">
              {editing ? `Ubah bahan · ${material.name}` : "Bahan baru"}
            </h2>
            <p className="text-[11px] text-muted-foreground">{brand}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-full p-2 hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-1.5 border-b border-border px-4 py-2.5">
          {STEPS.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => {
                if (s.n <= step || !stepError((s.n - 1) as Step)) setStep(s.n);
                else toast.error(stepError((s.n - 1) as Step) as string);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 px-2 py-1.5 text-[12px] font-semibold",
                step === s.n ? "border-foreground bg-primary" : "border-border text-muted-foreground"
              )}
            >
              {step > s.n ? <Check size={13} /> : <span>{s.n}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Isi: form kiri, dampak kanan (di ponsel ditumpuk) */}
        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_340px] md:overflow-hidden">
          <div className="space-y-3 px-4 py-4 md:overflow-y-auto">
            {step === 1 && (
              <>
                <Field label="Nama bahan">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tepung terigu" className={inputCls} maxLength={80} />
                </Field>
                <Field label="Kategori (opsional)">
                  <select
                    value={newCategory ? NEW_CATEGORY : category}
                    onChange={(e) => {
                      if (e.target.value === NEW_CATEGORY) {
                        setNewCategory(true);
                        setCategory("");
                      } else {
                        setNewCategory(false);
                        setCategory(e.target.value);
                      }
                    }}
                    className={inputCls}
                  >
                    <option value="">Tanpa kategori</option>
                    {/* Kategori bahan ini tetap tampil walau tak ada di daftar (data lama). */}
                    {category && !categories.includes(category) && !newCategory && <option value={category}>{category}</option>}
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>+ Kategori baru…</option>
                  </select>
                  {newCategory && (
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Nama kategori baru, mis. Tepung & Pati"
                      autoFocus
                      className={cn(inputCls, "mt-2")}
                    />
                  )}
                </Field>
                <Field label="Link beli (opsional)">
                  <input value={shopee} onChange={(e) => setShopee(e.target.value)} inputMode="url" placeholder="https://shopee.co.id/…" className={inputCls} />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Satuan beli">
                    <select value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} className={inputCls}>
                      {!purchaseUnit && <option value="">Pilih…</option>}
                      {unitOptions(PURCHASE_UNITS, material?.purchase_unit).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Harga beli (Rp)">
                    <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="275000" className={cn(inputCls, "tabular-nums")} />
                  </Field>
                  <Field label="Isi per satuan beli">
                    <input value={content} onChange={(e) => setContent(e.target.value)} inputMode="decimal" placeholder="25000" className={cn(inputCls, "tabular-nums")} />
                  </Field>
                  <Field label="Satuan pakai (di resep)">
                    <select value={usageUnit} onChange={(e) => setUsageUnit(e.target.value)} className={inputCls}>
                      {!usageUnit && <option value="">Pilih…</option>}
                      {unitOptions(USAGE_UNITS, material?.usage_unit).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Susut / waste (%)">
                    <input value={shrink} onChange={(e) => setShrink(e.target.value)} inputMode="decimal" className={cn(inputCls, "tabular-nums")} />
                  </Field>
                </div>
                <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm">
                  {perUnit != null && purchaseUnit.trim() && usageUnit.trim() ? (
                    <>
                      1 {purchaseUnit.trim()} = {formatNum(contentNum as number, true)} {usageUnit.trim()} · {formatRp(priceNum)}
                      <div className="mt-0.5 font-display text-lg font-extrabold tabular-nums">
                        {fmtRpPrecise(perUnit)} <span className="text-sm font-semibold">per {usageUnit.trim()}</span>
                        {shrinkNum > 0 && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            efektif {fmtRpPrecise(perUnit * (1 + shrinkNum))} dengan susut
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Isi satuan beli, harga, isi, dan satuan pakai untuk melihat harga per satuan.</span>
                  )}
                </div>
                {usageUnitChanged && (
                  <div className="flex gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>
                      Satuan pakai diubah dari <b>{material?.usage_unit}</b> ke <b>{usageUnit.trim()}</b>. Semua takaran resep (
                      {existing.size} produk) memakai satuan pakai bahan, jadi artinya ikut berubah. Periksa takaran di langkah 3.
                    </span>
                  </div>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-xs text-muted-foreground">
                  Centang produk yang memakai bahan ini dan isi takarannya. Kosongkan centang untuk melepas tautan.
                </p>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Cari produk…" className={cn(inputCls, "pl-8")} />
                </div>
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                  {visibleProducts.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Tidak ada produk.</li>}
                  {visibleProducts.map((r) => {
                    const l = links[r.product.id];
                    const on = !!l?.on;
                    const choices = recipeUnitChoices(usageUnit.trim() || "unit", units);
                    return (
                      <li key={r.product.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <label className="flex min-w-[9rem] flex-1 cursor-pointer items-center gap-2 text-sm">
                          <input type="checkbox" checked={on} onChange={(e) => setLink(r.product.id, { on: e.target.checked })} />
                          <span className={cn("truncate", on && "font-semibold")}>{r.product.name}</span>
                          {!r.product.pos_product_id && (
                            <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">tanpa POS</span>
                          )}
                        </label>
                        {on && (
                          <>
                            <input
                              value={l?.qty ?? ""}
                              onChange={(e) => setLink(r.product.id, { qty: e.target.value })}
                              inputMode="decimal"
                              placeholder="takaran"
                              aria-label={`Takaran ${r.product.name}`}
                              className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
                            />
                            <select
                              value={l?.unit ?? ""}
                              onChange={(e) => setLink(r.product.id, { unit: e.target.value })}
                              aria-label="Satuan takaran"
                              className="h-9 rounded-lg border border-border bg-background px-1.5 text-sm"
                            >
                              <option value="">{usageUnit.trim() || "satuan pakai"}</option>
                              {choices
                                .filter((c) => c !== usageUnit.trim())
                                .map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                            </select>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Dampak */}
          <aside className="border-t border-border bg-muted/30 px-4 py-4 md:overflow-y-auto md:border-l md:border-t-0">
            <ImpactPanel impact={impact} />
          </aside>
        </div>

        {/* Kaki */}
        <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((s) => (s - 1) as Step) : onClose())}
            className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <ChevronLeft size={15} /> {step > 1 ? "Kembali" : "Batal"}
          </button>
          <span className="flex-1" />
          {step < 3 ? (
            <button type="button" onClick={next} className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-foreground bg-primary px-4 text-sm font-bold">
              Lanjut <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-4 text-sm font-bold disabled:opacity-60"
            >
              {pending ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan bahan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

const signed = (pct: number) => `${pct > 0 ? "+" : ""}${fmtPercent(pct)}`;

function ImpactPanel({ impact }: { impact: ReturnType<typeof computeImpact> | null }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dampak ke produk</h3>
      {!impact ? (
        <p className="text-[13px] text-muted-foreground">Isi satuan dan harga dulu, dampaknya muncul di sini.</p>
      ) : impact.products.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Belum ada produk yang HPP-nya berubah.</p>
      ) : (
        <>
          <p className="text-[13px]">
            <b>{impact.changedCount}</b> produk berubah
            {impact.belowFloorCount > 0 && (
              <span className="font-semibold text-destructive"> · {impact.belowFloorCount} margin di bawah 30%</span>
            )}
          </p>
          <ul className="space-y-2">
            {impact.products.map((p) => (
              <ImpactRow key={p.productId} p={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ImpactRow({ p }: { p: ProductImpact }) {
  const tag = !p.linkedBefore ? "baru ditautkan" : !p.linkedAfter ? "dilepas" : null;
  return (
    <li className={cn("rounded-xl border bg-card p-2.5 text-[12.5px]", p.belowFloor ? "border-destructive/60" : "border-border")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{p.name}</span>
        {tag && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{tag}</span>}
      </div>
      <div className="mt-0.5 tabular-nums text-muted-foreground">
        HPP {formatRp(p.hppBefore)} → <b className="text-foreground">{formatRp(p.hppAfter)}</b>
        {p.hppDeltaPct != null && Math.abs(p.hppDeltaPct) > 1e-4 && (
          <span className={cn("ml-1 font-semibold", p.hppDeltaPct > 0 ? "text-warning" : "text-success")}>{signed(p.hppDeltaPct)}</span>
        )}
      </div>
      {p.risk === "price" && p.priceBefore != null && p.priceAfter != null && p.priceAfter !== p.priceBefore && (
        <div className="tabular-nums text-muted-foreground">
          Harga jual {formatRp(p.priceBefore)} → <b className="text-foreground">{formatRp(p.priceAfter)}</b>
        </div>
      )}
      {p.risk === "margin" && p.marginBefore != null && p.marginAfter != null && (
        <div className={cn("tabular-nums", p.belowFloor ? "font-semibold text-destructive" : "text-muted-foreground")}>
          Margin {fmtPercent(p.marginBefore)} → {fmtPercent(p.marginAfter)} (harga jual manual tetap)
        </div>
      )}
      {p.unitError && <div className="font-semibold text-destructive">Satuan takaran tak bisa dikonversi: biaya dihitung 0</div>}
    </li>
  );
}
