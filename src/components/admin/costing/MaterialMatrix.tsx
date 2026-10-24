"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import {
  addRecipeItem,
  deleteRecipeItem,
  updateRecipeItem,
  type CostingMaterial,
  type CostingProductWithHpp,
  type CostingUnit,
} from "@/lib/actions/costing.actions";
import { computeHpp, type HppBreakdown } from "@/lib/costing/calc";
import { formatRp } from "@/lib/cashflow/format";
import { cn } from "@/lib/utils";
import { fmtRpPrecise } from "./format";
import { formatNum, parseDecimalId } from "./fields";
import { impactProducts, materialLite, unitsMap } from "./costing-data";

type Cell = { id: string; qty: number; unit: string | null };

/**
 * Peta bahan × produk satu cabang. Baris = bahan, kolom = produk, sel = takaran di resep. Perubahan DITAMPUNG dulu
 * (bilah "N perubahan · Simpan") dan HPP di kepala kolom langsung dihitung ulang, jadi salah ketik tidak langsung
 * mengubah HPP dan harga di database. Bahan yang belum dipakai produk mana pun ditandai.
 */
export function MaterialMatrix({
  materials,
  products,
  units,
  categories,
  onOpenMaterial,
  onNewMaterial,
}: {
  materials: CostingMaterial[];
  products: CostingProductWithHpp[];
  units: CostingUnit[];
  categories: string[];
  onOpenMaterial: (m: CostingMaterial) => void;
  onNewMaterial: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [onlyUnused, setOnlyUnused] = useState(false);
  /** key `${materialId}|${productId}` → qty baru (null = lepas dari resep). */
  const [staged, setStaged] = useState<Record<string, number | null>>({});
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showImpact, setShowImpact] = useState(false);
  const cancelledRef = useRef(false);

  const mats = useMemo(() => materials.filter((m) => m.is_active), [materials]);
  const prods = useMemo(() => products.filter((r) => r.product.is_active), [products]);
  const unitMap = useMemo(() => unitsMap(units), [units]);
  const lites = useMemo(() => new Map(mats.map((m) => [m.id, materialLite(m)])), [mats]);
  const base = useMemo(() => impactProducts(prods), [prods]);

  /** Sel yang sudah ada di database. */
  const cells = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const r of prods)
      for (const it of r.items) m.set(`${it.material_id}|${r.product.id}`, { id: it.id, qty: it.qty, unit: it.unit });
    return m;
  }, [prods]);

  /** Takaran efektif (database + tampungan). undefined = tak ada tautan. */
  const effective = (mid: string, pid: string): number | undefined => {
    const k = `${mid}|${pid}`;
    if (k in staged) return staged[k] ?? undefined;
    return cells.get(k)?.qty;
  };

  /** HPP tiap produk dengan perubahan yang ditampung. */
  const { after, before } = useMemo(() => {
    const aft = new Map<string, HppBreakdown>();
    const bef = new Map<string, HppBreakdown>();
    for (const p of base) {
      bef.set(p.id, computeHpp(p.items, p.cost, lites, unitMap));
      const items = p.items.filter((i) => {
        const k = `${i.material_id}|${p.id}`;
        return !(k in staged) || staged[k] !== null;
      });
      const next = items.map((i) => {
        const k = `${i.material_id}|${p.id}`;
        return k in staged && staged[k] !== null ? { ...i, qty: staged[k] as number } : i;
      });
      for (const [k, q] of Object.entries(staged)) {
        const [mid, pid] = k.split("|");
        if (pid === p.id && q !== null && !p.items.some((i) => i.material_id === mid))
          next.push({ material_id: mid, qty: q, unit: null });
      }
      aft.set(p.id, computeHpp(next, p.cost, lites, unitMap));
    }
    return { after: aft, before: bef };
  }, [base, staged, lites, unitMap]);

  const usedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const mat of mats) {
      let n = 0;
      for (const r of prods) if (effective(mat.id, r.product.id) !== undefined) n++;
      m.set(mat.id, n);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mats, prods, staged, cells]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mats.filter((m) => {
      if (onlyUnused && (usedCount.get(m.id) ?? 0) > 0) return false;
      if (q) return m.name.toLowerCase().includes(q) || (m.category ?? "").toLowerCase().includes(q);
      return !cat || (m.category?.trim() || "") === cat;
    });
  }, [mats, query, cat, onlyUnused, usedCount]);

  /** Jumlah produk pemakai tiap bahan yang BELUM tertaut ke POS. */
  const unlinked = useMemo(() => {
    const out = new Map<string, number>();
    for (const mat of mats) {
      let k = 0;
      for (const r of prods) if (!r.product.pos_product_id && effective(mat.id, r.product.id) !== undefined) k++;
      if (k > 0) out.set(mat.id, k);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mats, prods, staged, cells]);

  const unusedTotal = useMemo(() => mats.filter((m) => (usedCount.get(m.id) ?? 0) === 0).length, [mats, usedCount]);
  const stagedCount = Object.keys(staged).length;
  const changedProducts = useMemo(
    () =>
      prods
        .map((r) => ({ r, b: before.get(r.product.id), a: after.get(r.product.id) }))
        .filter((x) => x.a && x.b && Math.abs(x.a.hppUnit - x.b.hppUnit) > 1e-6),
    [prods, before, after]
  );

  function openCell(mid: string, pid: string) {
    const cur = effective(mid, pid);
    cancelledRef.current = false;
    setDraft(cur !== undefined ? formatNum(cur, true) : "");
    setEditKey(`${mid}|${pid}`);
  }

  function commitCell() {
    if (editKey == null) return;
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setEditKey(null);
      return;
    }
    const key = editKey;
    setEditKey(null);
    const text = draft.trim();
    const dbCell = cells.get(key);
    setStaged((cur) => {
      const next = { ...cur };
      if (text === "") {
        // Kosong: lepas dari resep (bila ada di database); bila memang tak ada, batalkan tampungan.
        if (dbCell) next[key] = null;
        else delete next[key];
        return next;
      }
      const n = parseDecimalId(text);
      if (n == null || !(n > 0)) {
        toast.error("Takaran harus lebih dari 0 (kosongkan untuk melepas)");
        return cur;
      }
      if (dbCell && dbCell.qty === n) delete next[key];
      else next[key] = n;
      return next;
    });
  }

  function saveAll() {
    start(async () => {
      let failed = 0;
      for (const [key, qty] of Object.entries(staged)) {
        const [mid, pid] = key.split("|");
        const have = cells.get(key);
        let res: { ok: boolean } | null = null;
        if (qty === null) {
          if (have) res = await deleteRecipeItem(have.id);
        } else if (have) res = await updateRecipeItem({ id: have.id, qty });
        else res = await addRecipeItem({ product_id: pid, material_id: mid, qty, unit: null });
        if (res && !res.ok) failed++;
      }
      if (failed > 0) toast.error(`${failed} perubahan gagal disimpan. Muat ulang dan periksa.`);
      else toast.success(`${stagedCount} perubahan disimpan`);
      setStaged({});
      router.refresh();
    });
  }

  const unitLabel = (m: CostingMaterial, c?: Cell) => c?.unit ?? m.usage_unit;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari bahan atau kategori…"
            className="h-9 w-full rounded-xl border-2 border-foreground bg-card pl-8 pr-3 text-sm"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          disabled={!!query}
          className="h-9 rounded-xl border-2 border-border bg-card px-2 text-sm disabled:opacity-50"
          aria-label="Kategori"
        >
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOnlyUnused((v) => !v)}
          className={cn(
            "h-9 rounded-full border-2 px-3 text-xs font-semibold",
            onlyUnused ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:border-foreground"
          )}
        >
          Belum dipakai ({unusedTotal})
        </button>
        <button
          type="button"
          onClick={onNewMaterial}
          className="inline-flex h-9 items-center gap-1 rounded-xl border-2 border-foreground bg-primary px-3 text-sm font-bold"
        >
          <Plus size={14} /> Bahan baru
        </button>
      </div>

      <div className="max-h-[68vh] overflow-auto rounded-2xl border-2 border-foreground bg-card pb-px">
        <table className="border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[11rem] border-b border-r border-border bg-card px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">
                {rows.length} bahan × {prods.length} produk
              </th>
              {prods.map((r) => {
                const a = after.get(r.product.id);
                const b = before.get(r.product.id);
                const changed = a && b && Math.abs(a.hppUnit - b.hppUnit) > 1e-6;
                return (
                  <th key={r.product.id} className="sticky top-0 z-20 min-w-[6.5rem] border-b border-border bg-card px-2 py-2 text-center align-bottom">
                    <div className="line-clamp-2 font-semibold leading-tight" title={r.product.name}>
                      {r.product.name}
                    </div>
                    <div className={cn("mt-0.5 font-normal tabular-nums", changed ? "font-semibold text-warning" : "text-muted-foreground")}>
                      {a ? formatRp(a.hppUnit) : "—"}
                    </div>
                    {!r.product.pos_product_id && (
                      <div className="mt-0.5 text-[10px] font-semibold text-destructive" title="Produk ini belum ditautkan ke produk POS: pemakaian bahannya tidak ikut dihitung dari produksi POS">
                        tanpa POS
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const n = usedCount.get(m.id) ?? 0;
              return (
                <tr key={m.id}>
                  <th className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1.5 text-left font-normal">
                    <button type="button" onClick={() => onOpenMaterial(m)} className="block max-w-[12rem] truncate text-left font-semibold hover:underline" title="Ubah bahan & tautan">
                      {m.name}
                    </button>
                    <span className={cn("text-[10.5px]", n === 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                      {n === 0 ? "belum dipakai" : `${n} produk`}
                      {n > 0 && unlinked.get(m.id) ? ` (${unlinked.get(m.id)} tanpa POS)` : ""} · {fmtRpPrecise(m.content_per_purchase > 0 ? m.purchase_price / m.content_per_purchase : 0)}/{m.usage_unit}
                    </span>
                  </th>
                  {prods.map((r) => {
                    const key = `${m.id}|${r.product.id}`;
                    const q = effective(m.id, r.product.id);
                    const isStaged = key in staged;
                    const dbCell = cells.get(key);
                    const comp = after.get(r.product.id)?.components.find((c) => c.material_id === m.id);
                    const tot = after.get(r.product.id)?.totalMaterial ?? 0;
                    const share = comp && tot > 0 ? comp.cost / tot : 0;
                    return (
                      <td key={r.product.id} className="border-b border-border p-0 text-center">
                        {editKey === key ? (
                          <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitCell}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") {
                                cancelledRef.current = true;
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            inputMode="decimal"
                            aria-label={`${m.name} di ${r.product.name}`}
                            className="h-8 w-full border-2 border-foreground bg-background px-1 text-center tabular-nums outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => openCell(m.id, r.product.id)}
                            title={`${m.name} · ${r.product.name}`}
                            className={cn(
                              "relative h-8 w-full tabular-nums transition hover:bg-muted",
                              isStaged && "outline outline-2 -outline-offset-2 outline-primary"
                            )}
                            style={q !== undefined ? { backgroundColor: `rgba(239,159,39,${0.12 + Math.min(1, share) * 0.6})` } : undefined}
                          >
                            {q !== undefined ? (
                              <>
                                {formatNum(q, true)} <span className="text-[10px] text-muted-foreground">{unitLabel(m, dbCell)}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/40">+</span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={prods.length + 1} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Tidak ada bahan yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Klik sel untuk mengisi takaran, kosongkan untuk melepas. Warna lebih pekat = porsi biaya bahan lebih besar di produk itu. Angka di kepala kolom
        = HPP per unit. &ldquo;tanpa POS&rdquo; = produk belum ditautkan ke produk POS (pemakaian bahannya tidak ikut terhitung dari produksi).
      </p>

      {stagedCount > 0 && (
        <div className="sticky bottom-3 z-40 rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{stagedCount} perubahan belum disimpan</p>
              <button type="button" onClick={() => setShowImpact((v) => !v)} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
                {changedProducts.length} produk HPP-nya berubah · {showImpact ? "sembunyikan" : "lihat"}
              </button>
            </div>
            <button type="button" onClick={() => setStaged({})} disabled={pending} className="h-9 rounded-xl border-2 border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              Batal
            </button>
            <button type="button" onClick={saveAll} disabled={pending} className="h-9 rounded-xl border-2 border-foreground bg-primary px-4 text-sm font-bold disabled:opacity-60">
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
          {showImpact && changedProducts.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-border pt-2 text-[12px]">
              {changedProducts.map(({ r, a, b }) => (
                <li key={r.product.id} className="flex items-center justify-between gap-2 tabular-nums">
                  <span className="truncate">{r.product.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatRp((b as HppBreakdown).hppUnit)} → <b className="text-foreground">{formatRp((a as HppBreakdown).hppUnit)}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
