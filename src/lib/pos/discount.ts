/**
 * Pure math helper untuk perhitungan diskon POS — dipakai oleh
 * `createPosSale` (server) maupun `POSClient` (client) supaya angka
 * yang ditampilkan di cart selalu == angka yang tersimpan.
 *
 * Aturan persen:
 *   1. raw = grossTotal × (1 − percent/100)
 *   2. rounded = roundToUnit(raw, unit, mode)
 *   3. clamp [0, grossTotal] — diskon tidak boleh negatif atau >gross
 *   4. kalau grossTotal < unit, skip diskon (final = gross, discount = 0)
 *      → menghindari "harga 800 → diskon 800" yang absurd.
 * Aturan nominal: potongan tetap Rp N, tidak pernah melebihi grossTotal.
 * Keduanya tunduk pada `minPurchase` (di bawahnya tak ada diskon).
 *
 * Kampanye: jadwal (tanggal, jam, hari) dan pemilihan kampanye terbaik untuk pembeli — satu kampanye per penjualan,
 * tidak ditumpuk. Modul murni, dipakai server (otoritatif) dan layar kasir (pratinjau).
 */

import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

export type RoundingMode = "floor" | "nearest" | "ceil";
/**
 * "item_price": produk tertentu dijual di harga promo tetap, sebanyak voucher yang diisi kasir (lihat `computeItemPromos`).
 * "tebus_murah": maks 1 pcs produk tebus per orang di harga promo; tiap tebus butuh 1 pcs produk syarat (lihat `computeItemPromos`).
 */
export type DiscountKind = "percent" | "nominal" | "item_price" | "tebus_murah";
export type CampaignMode = "otomatis" | "kasir";

/** Baris keranjang yang relevan untuk promo harga-per-item. Baris yang sudah didiskon manual / custom / ready cake tak ikut. */
export interface PromoLine {
  productId: string | null;
  /** Harga satuan saat ini. */
  unitPrice: number;
  qty: number;
  /** Kunci baris keranjang (opsional) — dipakai untuk merinci potongan per baris (`ItemPromoResult.byLine`). */
  key?: string;
}

export interface DiscountCampaignLite {
  /** Harga promo per pcs, dipakai bila kind = "item_price" / "tebus_murah". */
  promoPrice?: number;
  /** Produk yang ikut promo (item_price) atau yang boleh ditebus (tebus_murah). */
  productIds?: string[];
  /** tebus_murah: produk yang TIDAK dihitung sebagai syarat (mis. produk promo soft opening). */
  excludedProductIds?: string[];
  /**
   * item_price: produk yang HANYA boleh dibeli dengan voucher kampanye ini (tak bisa dibeli normal / lewat tebus murah,
   * juga tidak dengan harga normal). Berlaku selama kampanye berlaku, lihat `voucherOnlyShortfall`.
   */
  voucherOnlyProductIds?: string[];
  percentOff: number;
  roundingUnit: number;
  roundingMode: RoundingMode;
  /** Bawaan "percent" (data & pemanggil lama). */
  kind?: DiscountKind;
  /** Potongan Rp, dipakai bila kind = "nominal". */
  amountOff?: number;
  /** Belanja di bawah ini tidak kena diskon. */
  minPurchase?: number;
}

/** Nama pendek promo untuk label sempit: "Soft Opening Semarang — Rp2.000" → "Soft Opening". */
export function promoShortName(name: string): string {
  return name.split(" — ")[0].replace(/ Semarang$/, "");
}

/** Batas wajar voucher soft opening per nota (cegah salah ketik). */
export const MAX_PROMO_VOUCHERS = 50;

/** Hasil promo per-item untuk satu kampanye. */
export interface ItemPromoPart {
  campaignId: string;
  kind: "item_price" | "tebus_murah";
  /** Pcs yang dapat harga promo. */
  pcs: number;
  saving: number;
}

export interface ItemPromoResult {
  /** Gabungan hemat semua promo per-item (ditumpuk: voucher + tebus murah). */
  saving: number;
  parts: ItemPromoPart[];
  /** item_price: voucher yang diisi kasir tapi belum terpakai (tak ada produk promo di keranjang). */
  voucherUnused: number;
  /** item_price: pcs produk promo di keranjang yang tetap harga normal (voucher kurang). */
  promoPcsAtFullPrice: number;
  /** tebus_murah: berapa pcs produk tebus lagi yang masih bisa ditambah dan ikut dapat harga tebus. */
  tebusRoom: number;
  /** Rincian potongan per baris keranjang (kunci = `PromoLine.key`): pcs yang dipotong, jumlah potongan, dari promo mana. */
  byLine: Record<string, { campaignId: string; kind: "item_price" | "tebus_murah"; pcs: number; saving: number; unitSaving: number }[]>;
}

type ItemPromoCampaign = Pick<DiscountCampaignLite, "kind" | "promoPrice" | "productIds" | "excludedProductIds" | "voucherOnlyProductIds" | "minPurchase"> & {
  id: string;
};

/** Harga satuan tiap pcs (qty dibentang), dari yang termahal. */
function pcsPrices(
  lines: PromoLine[],
  ids: ReadonlySet<string>,
  firstIds?: ReadonlySet<string>
): { price: number; key?: string; first: boolean }[] {
  const out: { price: number; key?: string; first: boolean }[] = [];
  for (const l of lines) {
    if (!l.productId || l.qty <= 0 || !ids.has(l.productId)) continue;
    const first = firstIds?.has(l.productId) ?? false;
    for (let i = 0; i < l.qty; i++) out.push({ price: l.unitPrice, key: l.key, first });
  }
  // `firstIds` (produk hanya-voucher) mengambil voucher lebih dulu, baru yang termahal.
  return out.sort((a, b) => Number(b.first) - Number(a.first) || b.price - a.price);
}

/** Ada produk hanya-voucher di keranjang yang jumlahnya melebihi voucher yang tersedia. */
export interface VoucherOnlyShortfall {
  /** Produk terkunci yang ada di keranjang. */
  productIds: string[];
  /** Pcs produk terkunci di keranjang. */
  pcs: number;
  /** Voucher yang boleh dipakai (0 bila promo soft opening dimatikan kasir). */
  allowed: number;
}

/**
 * Kebijakan: produk `voucherOnlyProductIds` hanya bisa dibeli dengan voucher kampanye item_price yang SEDANG berlaku.
 * Pcs-nya tak boleh melebihi jumlah voucher; mematikan promo di kasir TIDAK membuka kuncinya (voucher jadi 0).
 * `lines` = semua baris katalog (termasuk yang didiskon manual / harga custom). Null = aman.
 */
export function voucherOnlyShortfall(
  campaigns: (Pick<DiscountCampaignLite, "kind" | "voucherOnlyProductIds"> & CampaignSchedule & { id: string })[],
  now: JakartaNow,
  lines: { productId: string | null; qty: number }[],
  vouchers: number,
  disabledIds: readonly string[] = []
): VoucherOnlyShortfall | null {
  const locked = new Set<string>();
  let usable = false;
  for (const c of campaigns) {
    if (c.kind !== "item_price" || !c.voucherOnlyProductIds?.length || !isCampaignLive(c, now)) continue;
    for (const id of c.voucherOnlyProductIds) locked.add(id);
    if (!disabledIds.includes(c.id)) usable = true;
  }
  if (locked.size === 0) return null;
  const inCart = new Set<string>();
  let pcs = 0;
  for (const l of lines) {
    if (!l.productId || l.qty <= 0 || !locked.has(l.productId)) continue;
    inCart.add(l.productId);
    pcs += l.qty;
  }
  const v = Number.isFinite(vouchers) ? Math.min(MAX_PROMO_VOUCHERS, Math.max(0, Math.floor(vouchers))) : 0;
  const allowed = usable ? v : 0;
  return pcs > allowed ? { productIds: [...inCart], pcs, allowed } : null;
}

/** Hemat dari `n` pcs termahal; sekaligus merinci per baris ke `result.byLine`. */
function takeSaving(
  pcs: { price: number; key?: string }[],
  n: number,
  c: { id: string; kind: "item_price" | "tebus_murah" },
  promoPrice: number,
  result: ItemPromoResult
): number {
  let s = 0;
  for (let i = 0; i < n && i < pcs.length; i++) {
    const unitSaving = Math.max(0, pcs[i].price - promoPrice);
    s += unitSaving;
    const key = pcs[i].key;
    if (!key) continue;
    const rows = (result.byLine[key] ??= []);
    const row = rows.find((r) => r.campaignId === c.id);
    if (row) {
      row.pcs += 1;
      row.saving += unitSaving;
    } else rows.push({ campaignId: c.id, kind: c.kind, pcs: 1, saving: unitSaving, unitSaving });
  }
  return s;
}

/** Batas wajar jumlah orang per nota (cegah salah ketik). */
export const MAX_PROMO_PEOPLE = 20;

/** Jumlah orang yang valid (bulat, 1..MAX_PROMO_PEOPLE); tak valid → 1. */
export function clampPeople(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 1;
  return Math.min(MAX_PROMO_PEOPLE, Math.max(1, v));
}

/**
 * Nota berisi produk hanya-voucher (atau voucher diisi) TIDAK boleh digabung dengan produk lain.
 * `lines` = SEMUA baris nota (katalog, custom, ready cake). Null = aman.
 */
export interface VoucherMixed {
  /** Pcs produk hanya-voucher di nota. */
  lockedPcs: number;
  /** Pcs produk lain di nota. */
  otherPcs: number;
}

export function voucherMixedProblem(
  campaigns: (Pick<DiscountCampaignLite, "kind" | "voucherOnlyProductIds"> & CampaignSchedule)[],
  now: JakartaNow,
  lines: { productId: string | null; qty: number }[],
  vouchers: number,
  /** Kasir melepas kunci hanya-voucher: produk promo boleh dibeli normal, tapi nota yang memakai voucher TETAP tak boleh campur. */
  lockOff = false
): VoucherMixed | null {
  const locked = new Set<string>();
  for (const c of campaigns) {
    if (c.kind !== "item_price" || !c.voucherOnlyProductIds?.length || !isCampaignLive(c, now)) continue;
    for (const id of c.voucherOnlyProductIds) locked.add(id);
  }
  if (locked.size === 0) return null;
  let lockedPcs = 0;
  let otherPcs = 0;
  for (const l of lines) {
    if (l.qty <= 0) continue;
    if (l.productId && locked.has(l.productId)) lockedPcs += l.qty;
    else otherPcs += l.qty;
  }
  const hasVoucher = Number.isFinite(vouchers) && Math.floor(vouchers) > 0;
  const voucherNota = hasVoucher || (!lockOff && lockedPcs > 0);
  return otherPcs > 0 && voucherNota ? { lockedPcs, otherPcs } : null;
}

/**
 * Hemat semua promo per-item. Dua jenis, ditumpuk (tak saling mengurangi):
 *  - item_price (soft opening): `vouchers` pcs produk promo jadi harga promo (kasir yang mengisi jumlah voucher;
 *    antrean sudah memilah pembeli yang berhak). Pcs promo di atas jumlah voucher tetap harga normal.
 *  - tebus_murah: maks 1 tebus per orang (`people`), dan tiap tebus butuh 1 pcs produk syarat (harga normal,
 *    non-minuman). Produk promo soft opening, minuman, dan produk tebus sendiri TIDAK jadi syarat.
 * Pcs termahal dipilih lebih dulu supaya pembeli paling untung.
 */
export function computeItemPromos(
  campaigns: ItemPromoCampaign[],
  grossTotal: number,
  lines: PromoLine[] | undefined,
  vouchers: number,
  people = 1
): ItemPromoResult {
  const result: ItemPromoResult = { saving: 0, parts: [], voucherUnused: 0, promoPcsAtFullPrice: 0, tebusRoom: 0, byLine: {} };
  if (!lines || grossTotal <= 0) return result;
  let voucherLeft = Math.max(0, Math.floor(vouchers) || 0);

  // item_price (voucher) diproses dulu: pcs produk promo yang dibayar harga normal (tanpa voucher) jadi syarat tebus.
  const ordered = [...campaigns].sort((a, b) => Number(b.kind === "item_price") - Number(a.kind === "item_price"));
  for (const c of ordered) {
    const ids = c.productIds ?? [];
    if (ids.length === 0 || (c.minPurchase && grossTotal < c.minPurchase)) continue;
    const price = c.promoPrice ?? 0;
    const idSet = new Set(ids);

    if (c.kind === "item_price") {
      const prices = pcsPrices(lines, idSet, new Set(c.voucherOnlyProductIds ?? []));
      const claimed = Math.min(voucherLeft, prices.length);
      voucherLeft -= claimed;
      result.promoPcsAtFullPrice += prices.length - claimed;
      const saving = takeSaving(prices, claimed, { id: c.id, kind: "item_price" }, price, result);
      if (saving > 0) {
        result.parts.push({ campaignId: c.id, kind: "item_price", pcs: claimed, saving });
        result.saving += saving;
      }
    } else if (c.kind === "tebus_murah") {
      const excluded = new Set(c.excludedProductIds ?? []);
      const eligiblePrices = pcsPrices(lines, idSet);
      let others = 0;
      for (const l of lines) {
        if (!l.productId || l.qty <= 0 || idSet.has(l.productId) || excluded.has(l.productId)) continue;
        others += l.qty;
      }
      // Produk promo (mis. Salt Bread) yang dibeli harga normal (voucher tak dipakai) sah jadi syarat; yang diklaim voucher tidak.
      others += result.promoPcsAtFullPrice;
      const e = eligiblePrices.length;
      // Hak tebus = min(orang, produk syarat). Pcs produk tebus sendiri TIDAK jadi syarat.
      const cap = Math.min(clampPeople(people), others);
      const t = Math.min(e, cap);
      const saving = takeSaving(eligiblePrices, t, { id: c.id, kind: "tebus_murah" }, price, result);
      if (saving > 0) {
        result.parts.push({ campaignId: c.id, kind: "tebus_murah", pcs: t, saving });
        result.saving += saving;
      }
      // Sisa tempat: berapa pcs produk tebus lagi bisa ditambah dan semuanya ikut kena harga tebus.
      result.tebusRoom += Math.max(0, cap - e);
    }
  }
  result.voucherUnused = voucherLeft;
  return result;
}

export function applyDiscount(
  grossTotal: number,
  c: DiscountCampaignLite
): { finalTotal: number; discountAmount: number } {
  if (grossTotal <= 0) return { finalTotal: 0, discountAmount: 0 };
  if (c.minPurchase && grossTotal < c.minPurchase) {
    return { finalTotal: grossTotal, discountAmount: 0 };
  }
  // Promo per-item dihitung `computeItemPromos`, bukan di sini.
  if (c.kind === "item_price" || c.kind === "tebus_murah") return { finalTotal: grossTotal, discountAmount: 0 };
  if (c.kind === "nominal") {
    const off = Math.min(Math.max(c.amountOff ?? 0, 0), grossTotal);
    return { finalTotal: grossTotal - off, discountAmount: off };
  }
  if (grossTotal < c.roundingUnit) {
    return { finalTotal: grossTotal, discountAmount: 0 };
  }
  const raw = grossTotal * (1 - c.percentOff / 100);
  let rounded: number;
  if (c.roundingMode === "floor") {
    rounded = Math.floor(raw / c.roundingUnit) * c.roundingUnit;
  } else if (c.roundingMode === "ceil") {
    rounded = Math.ceil(raw / c.roundingUnit) * c.roundingUnit;
  } else {
    rounded = Math.round(raw / c.roundingUnit) * c.roundingUnit;
  }
  const finalTotal = Math.max(0, Math.min(grossTotal, rounded));
  return {
    finalTotal,
    discountAmount: grossTotal - finalTotal,
  };
}

// ───────────────────────── Jadwal & pemilihan ─────────────────────────

export interface CampaignSchedule {
  /** YYYY-MM-DD (WIB), inklusif. */
  startDate: string;
  endDate: string;
  /** HH:MM (WIB); keduanya null = seharian. Mulai inklusif, selesai eksklusif. */
  startTime: string | null;
  endTime: string | null;
  /** 0 = Minggu … 6 = Sabtu; null = setiap hari. */
  weekdays: number[] | null;
  isActive: boolean;
}

export interface JakartaNow {
  date: string;
  time: string;
  weekday: number;
}

export function jakartaNowParts(d: Date): JakartaNow {
  const date = jakartaDateString(d);
  return { date, time: jakartaHHMM(d), weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

const hhmm = (t: string) => t.slice(0, 5);

/** Berlaku SEKARANG: aktif, tanggal dalam rentang, hari cocok, dan jam dalam jendela. */
export function isCampaignLive(s: CampaignSchedule, now: JakartaNow): boolean {
  if (!s.isActive) return false;
  if (now.date < s.startDate || now.date > s.endDate) return false;
  if (s.weekdays && s.weekdays.length > 0 && !s.weekdays.includes(now.weekday)) return false;
  if (s.startTime && s.endTime) {
    const t = hhmm(now.time);
    if (t < hhmm(s.startTime) || t >= hhmm(s.endTime)) return false;
  }
  return true;
}

export type CampaignPhase = "jeda" | "terjadwal" | "berlangsung" | "selesai";

/** Status tampilan di halaman admin (tidak disimpan): jeda, terjadwal (belum mulai), berlangsung (hari ini dalam rentang), selesai. */
export function campaignPhase(s: CampaignSchedule, now: JakartaNow): CampaignPhase {
  if (now.date > s.endDate) return "selesai";
  if (!s.isActive) return "jeda";
  if (now.date < s.startDate) return "terjadwal";
  return "berlangsung";
}

export interface PickableCampaign extends DiscountCampaignLite, CampaignSchedule {
  id: string;
  mode: CampaignMode;
  /** ISO — pemutus seri: yang lebih baru menang. */
  createdAt: string;
}

export interface PickedCampaign<C extends PickableCampaign> {
  /** Kampanye yang dicatat di nota (untuk promo per-item: yang hematnya terbesar). */
  campaign: C;
  finalTotal: number;
  discountAmount: number;
  /** Ada bila yang dipakai adalah gabungan promo per-item (voucher + tebus murah). */
  itemPromo?: ItemPromoResult;
}

/**
 * Diskon untuk satu penjualan. Promo per-item (voucher soft opening + tebus murah) saling TERTUMPUK sebagai satu paket;
 * paket itu bersaing dengan satu kampanye persen/nominal terbaik — pembeli mendapat yang lebih besar (seri → paket).
 * Hanya kampanye yang berlaku sekarang, otomatis ATAU dipilih kasir (`chosenId`). Tak ada diskon → null.
 */
export function pickBestCampaign<C extends PickableCampaign>(
  campaigns: C[],
  grossTotal: number,
  now: JakartaNow,
  chosenId?: string | null,
  lines?: PromoLine[],
  vouchers = 0,
  people = 1
): PickedCampaign<C> | null {
  let best: PickedCampaign<C> | null = null;
  const itemCampaigns: C[] = [];
  for (const c of campaigns) {
    if (!isCampaignLive(c, now)) continue;
    if (c.mode === "kasir" && c.id !== chosenId) continue;
    if (c.kind === "item_price" || c.kind === "tebus_murah") {
      itemCampaigns.push(c);
      continue;
    }
    const r = applyDiscount(grossTotal, c);
    if (r.discountAmount <= 0) continue;
    if (
      !best ||
      r.discountAmount > best.discountAmount ||
      (r.discountAmount === best.discountAmount && c.createdAt > best.campaign.createdAt)
    ) {
      best = { campaign: c, finalTotal: r.finalTotal, discountAmount: r.discountAmount };
    }
  }
  const items = computeItemPromos(itemCampaigns, grossTotal, lines, vouchers, people);
  const off = Math.min(items.saving, grossTotal);
  if (off > 0 && (!best || off >= best.discountAmount)) {
    const top = items.parts.reduce((a, b) => (b.saving > a.saving ? b : a));
    const campaign = itemCampaigns.find((c) => c.id === top.campaignId)!;
    return { campaign, finalTotal: grossTotal - off, discountAmount: off, itemPromo: items };
  }
  return best;
}

/**
 * Promo yang boleh dimatikan kasir untuk SATU transaksi (bawaan tetap menyala): promo per-item (soft opening, tebus
 * murah). Dipakai layar kasir dan server supaya aturannya sama; server mengabaikan permintaan mematikan kampanye lain.
 */
export function cashierCanDisable(c: Pick<DiscountCampaignLite, "kind">): boolean {
  return c.kind === "item_price" || c.kind === "tebus_murah";
}

/** Promo yang hematnya bergantung pada isi keranjang per pcs (bukan persen/nominal). */
export function isItemPromoKind(kind: DiscountKind | undefined): boolean {
  return kind === "item_price" || kind === "tebus_murah";
}

/** "10%" / "Rp 5.000" untuk label. */
export function describeDiscount(c: DiscountCampaignLite): string {
  if (c.kind === "item_price" || c.kind === "tebus_murah") return `Rp ${Math.round(c.promoPrice ?? 0).toLocaleString("id-ID")}/item`;
  if (c.kind === "nominal") return `Rp ${Math.round(c.amountOff ?? 0).toLocaleString("id-ID")}`;
  const p = Number(c.percentOff);
  return `${Number.isInteger(p) ? p : p.toLocaleString("id-ID")}%`;
}
