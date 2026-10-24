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
export type DiscountKind = "percent" | "nominal";
export type CampaignMode = "otomatis" | "kasir";

export interface DiscountCampaignLite {
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

export function applyDiscount(
  grossTotal: number,
  c: DiscountCampaignLite
): { finalTotal: number; discountAmount: number } {
  if (grossTotal <= 0) return { finalTotal: 0, discountAmount: 0 };
  if (c.minPurchase && grossTotal < c.minPurchase) {
    return { finalTotal: grossTotal, discountAmount: 0 };
  }
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
  campaign: C;
  finalTotal: number;
  discountAmount: number;
}

/**
 * Kampanye yang dipakai untuk satu penjualan: yang berlaku sekarang, otomatis ATAU dipilih kasir (`chosenId`), dan
 * memberi diskon terbesar bagi pembeli. Seri → yang terbaru dibuat. Tak ada yang memberi diskon → null.
 */
export function pickBestCampaign<C extends PickableCampaign>(
  campaigns: C[],
  grossTotal: number,
  now: JakartaNow,
  chosenId?: string | null
): PickedCampaign<C> | null {
  let best: PickedCampaign<C> | null = null;
  for (const c of campaigns) {
    if (!isCampaignLive(c, now)) continue;
    if (c.mode === "kasir" && c.id !== chosenId) continue;
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
  return best;
}

/** "10%" / "Rp 5.000" untuk label. */
export function describeDiscount(c: DiscountCampaignLite): string {
  if (c.kind === "nominal") return `Rp ${Math.round(c.amountOff ?? 0).toLocaleString("id-ID")}`;
  const p = Number(c.percentOff);
  return `${Number.isInteger(p) ? p : p.toLocaleString("id-ID")}%`;
}
