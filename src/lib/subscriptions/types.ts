export type BillingCycle = "monthly" | "quarterly" | "yearly";

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Bulanan",
  quarterly: "3 bulanan",
  yearly: "Tahunan",
};

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export interface SubscriptionAllocation {
  id: string;
  businessUnit: string;
  branch: string | null;
  amountIdr: number;
}

export interface Subscription {
  id: string;
  name: string;
  /** Nominal per siklus tagihan. */
  amountIdr: number;
  billingCycle: BillingCycle;
  /** yyyy-mm-dd; null = belum diatur. */
  nextRenewalDate: string | null;
  isActive: boolean;
  notes: string | null;
  allocations: SubscriptionAllocation[];
}

/** "Rp 1.200.000" — pembulatan ke rupiah penuh. */
export function formatIdr(n: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
}

/** Nominal per bulan dari nominal per siklus (tahunan ÷ 12, dst). */
export function monthlyEquivalent(amountIdr: number, cycle: BillingCycle): number {
  return amountIdr / CYCLE_MONTHS[cycle];
}

// ─── Tanggal (yyyy-mm-dd, murni — tanpa zona waktu) ─────────────────────

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function fmtYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Selisih hari kalender (b − a), keduanya yyyy-mm-dd. */
export function daysBetween(a: string, b: string): number {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000
  );
}

/**
 * Tambah `months` bulan dengan menjaga tanggal. Akhir bulan dijepit (31 Jan +
 * 1 bulan = 28/29 Feb), dan tanggal asli dipakai lagi pada bulan yang cukup
 * panjang karena dihitung dari `anchorDay`, bukan dari hasil sebelumnya.
 */
export function addMonths(ymd: string, months: number, anchorDay?: number): string {
  const { y, m, d } = parseYmd(ymd);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return fmtYmd(ny, nm, Math.min(anchorDay ?? d, lastDay));
}

/**
 * Tanggal pembaruan berikutnya setelah "perpanjang": maju satu siklus dari
 * tanggal sekarang, lalu terus maju sampai LEWAT hari ini — langganan yang
 * telat dibayar beberapa siklus tidak berhenti di tanggal yang sudah lampau.
 */
export function nextRenewal(
  current: string | null,
  cycle: BillingCycle,
  today: string
): string {
  const step = CYCLE_MONTHS[cycle];
  const base = current ?? today;
  const anchor = parseYmd(base).d;
  let next = addMonths(base, step, anchor);
  for (let i = 1; i <= 120 && daysBetween(today, next) <= 0; i++) {
    next = addMonths(base, step * (i + 1), anchor);
  }
  return next;
}

export type RenewalStatus = "unset" | "overdue" | "today" | "soon" | "ok";

export const RENEWAL_SOON_DAYS = 7;

export function renewalStatus(
  nextRenewalDate: string | null,
  today: string
): { status: RenewalStatus; days: number | null } {
  if (!nextRenewalDate) return { status: "unset", days: null };
  const days = daysBetween(today, nextRenewalDate);
  if (days < 0) return { status: "overdue", days };
  if (days === 0) return { status: "today", days };
  if (days <= RENEWAL_SOON_DAYS) return { status: "soon", days };
  return { status: "ok", days };
}
