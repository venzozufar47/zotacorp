/**
 * Simulasi dampak perubahan SATU bahan (harga/isi/satuan) dan tautan resepnya ke HPP + harga jual semua produk,
 * sebelum disimpan. Murni (tanpa database), memakai `computeHpp` yang sama dengan server — angka layar = angka tersimpan.
 *
 * "Sebelum" = resep & bahan apa adanya sekarang. "Sesudah" = bahan diganti draf, dan baris resep bahan ini disusun ulang
 * persis seperti `links` (produk yang tak ada di `links` kehilangan bahan ini).
 */
import {
  computeHpp,
  type CostingMaterialLite,
  type HppBreakdown,
  type ProductCostLite,
  type RecipeItemLite,
  type UnitDef,
} from "./calc";

export interface ImpactProduct {
  id: string;
  name: string;
  cost: ProductCostLite & { price_method: string };
  /** Resep sekarang (urutan sama dengan di layar). */
  items: RecipeItemLite[];
}

/** Satu tautan bahan → produk yang diinginkan pada draf. */
export interface LinkDraft {
  productId: string;
  qty: number;
  /** null = satuan pakai bahan. */
  unit: string | null;
}

export type ImpactRisk =
  /** Harga jual manual tetap, HPP naik → margin menyusut. */
  | "margin"
  /** Harga jual mengikuti target margin → harga jual berubah. */
  | "price";

export interface ProductImpact {
  productId: string;
  name: string;
  linkedBefore: boolean;
  linkedAfter: boolean;
  hppBefore: number;
  hppAfter: number;
  /** Selisih relatif HPP per unit (0,03 = +3%). null bila HPP sebelumnya 0. */
  hppDeltaPct: number | null;
  priceBefore: number | null;
  priceAfter: number | null;
  marginBefore: number | null;
  marginAfter: number | null;
  risk: ImpactRisk | null;
  /** Margin sesudah di bawah `marginFloor` (hanya bermakna untuk harga manual). */
  belowFloor: boolean;
  /** Satuan resep tak bisa dikonversi → biaya baris itu 0 (jangan diam-diam salah). */
  unitError: boolean;
}

export interface ImpactResult {
  products: ProductImpact[];
  /** Produk yang HPP-nya berubah atau tautannya bertambah/berkurang. */
  changedCount: number;
  belowFloorCount: number;
}

export const DEFAULT_MARGIN_FLOOR = 0.3;

const EPS = 1e-6;

export function computeImpact(args: {
  products: ImpactProduct[];
  /** Semua bahan cabang ini, kondisi sekarang. */
  materials: CostingMaterialLite[];
  units: Map<string, UnitDef>;
  /** Bahan setelah diedit. `id` boleh id sementara untuk bahan baru. */
  draft: CostingMaterialLite;
  links: LinkDraft[];
  marginFloor?: number;
}): ImpactResult {
  const { products, materials, units, draft, links } = args;
  const floor = args.marginFloor ?? DEFAULT_MARGIN_FLOOR;
  const beforeMats = new Map(materials.map((m) => [m.id, m]));
  const afterMats = new Map(beforeMats);
  afterMats.set(draft.id, draft);
  const linkByProduct = new Map(links.map((l) => [l.productId, l]));

  const out: ProductImpact[] = [];
  for (const p of products) {
    const linkedBefore = p.items.some((i) => i.material_id === draft.id);
    const link = linkByProduct.get(p.id);
    const linkedAfter = !!link;
    if (!linkedBefore && !linkedAfter) continue;

    const before = computeHpp(p.items, p.cost, beforeMats, units);

    let afterItems: RecipeItemLite[];
    if (!link) {
      afterItems = p.items.filter((i) => i.material_id !== draft.id);
    } else if (linkedBefore) {
      afterItems = p.items.map((i) =>
        i.material_id === draft.id ? { material_id: i.material_id, qty: link.qty, unit: link.unit } : i
      );
    } else {
      afterItems = [...p.items, { material_id: draft.id, qty: link.qty, unit: link.unit }];
    }
    const after = computeHpp(afterItems, p.cost, afterMats, units);

    out.push(toImpact(p, linkedBefore, linkedAfter, before, after, draft.id, floor));
  }

  const changed = out.filter(
    (r) =>
      r.linkedBefore !== r.linkedAfter ||
      Math.abs(r.hppAfter - r.hppBefore) > EPS ||
      (r.priceAfter ?? 0) !== (r.priceBefore ?? 0)
  );
  // Terbesar dulu: yang paling berisiko (margin), lalu perubahan HPP terbesar.
  changed.sort((a, b) => {
    if (a.belowFloor !== b.belowFloor) return a.belowFloor ? -1 : 1;
    return Math.abs(b.hppAfter - b.hppBefore) - Math.abs(a.hppAfter - a.hppBefore);
  });
  return {
    products: changed,
    changedCount: changed.length,
    belowFloorCount: changed.filter((r) => r.belowFloor).length,
  };
}

function toImpact(
  p: ImpactProduct,
  linkedBefore: boolean,
  linkedAfter: boolean,
  before: HppBreakdown,
  after: HppBreakdown,
  materialId: string,
  floor: number
): ProductImpact {
  const hppDeltaPct = before.hppUnit > 0 ? after.hppUnit / before.hppUnit - 1 : null;
  const manual = p.cost.price_method === "manual";
  let risk: ImpactRisk | null = null;
  if (Math.abs(after.hppUnit - before.hppUnit) > EPS) {
    risk = manual ? ((after.marginPercent ?? 0) < (before.marginPercent ?? 0) - 0.005 ? "margin" : null) : "price";
  }
  const belowFloor = manual && after.marginPercent != null && after.marginPercent < floor && risk === "margin";
  return {
    productId: p.id,
    name: p.name,
    linkedBefore,
    linkedAfter,
    hppBefore: before.hppUnit,
    hppAfter: after.hppUnit,
    hppDeltaPct,
    priceBefore: before.finalPrice,
    priceAfter: after.finalPrice,
    marginBefore: before.marginPercent,
    marginAfter: after.marginPercent,
    risk,
    belowFloor,
    unitError: after.components.some((c) => c.material_id === materialId && c.unitError === true),
  };
}

/** "1 sak = 25.000 g → Rp 11 per g": harga per satuan pakai dari harga beli + isi per kemasan. */
export function unitCostPreview(purchasePrice: number, contentPerPurchase: number): number | null {
  if (!(purchasePrice >= 0) || !(contentPerPurchase > 0)) return null;
  return purchasePrice / contentPerPurchase;
}
