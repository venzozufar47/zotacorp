import type {
  CakeOptionKind,
  CakeOptionsByKind,
  CakeProductionSlipStatus,
} from "./types";

/**
 * Build a `(kind, id) => label` resolver from the by-kind option set.
 * Centralised so CakeOrdersList / CakeOrderDetail / SlipChecklist /
 * SlipPreview can't drift in their fallback wording or the lookup.
 */
export function makeLabelFor(opts: CakeOptionsByKind | null) {
  return (kind: CakeOptionKind, id: string | null): string => {
    if (!id || !opts) return "—";
    return opts[kind].find((o) => o.id === id)?.label ?? "—";
  };
}

/**
 * Apakah sebuah order diambil sendiri customer (pickup), bukan dikirim.
 *
 * Sinyalnya `cake_options.needs_address = false` — BUKAN mencocokkan
 * string "pickup" pada label seperti sebelumnya. Label itu data yang
 * bisa diubah admin kapan saja lewat /admin/cake-orders/options;
 * menamai ulang "Pickup" jadi "Ambil sendiri" akan diam-diam
 * membalik SETIAP kartu ke alur delivery. `needs_address` adalah
 * properti struktural opsi itu, dan sudah dipakai form untuk
 * memutuskan perlu-tidaknya alamat.
 *
 * Opsi yang tidak ketemu (mis. sudah dinonaktifkan — `CakeOptionsByKind`
 * hanya memuat baris aktif) → false. Arah salahnya aman: server tetap
 * menolak transisi pickup → done, jadi paling banter memunculkan
 * tombol yang lalu error, bukan pesanan pickup yang lolos ditutup dari
 * board staf.
 */
export function makeIsPickup(opts: CakeOptionsByKind | null) {
  return (deliveryOptionId: string | null): boolean => {
    if (!deliveryOptionId || !opts) return false;
    return (
      opts.delivery.find((o) => o.id === deliveryOptionId)?.needs_address ===
      false
    );
  };
}

/** Slip statuses where admin can still curate items + verify. */
const SLIP_EDITABLE: CakeProductionSlipStatus[] = ["draft", "verified"];
export const isSlipEditable = (s: CakeProductionSlipStatus) =>
  SLIP_EDITABLE.includes(s);

/** Slip statuses where the snapshot is locked — production team is
 *  reading the frozen view, admin wajib reopen dulu untuk edit. */
const SLIP_FROZEN: CakeProductionSlipStatus[] = [
  "verified",
  "sent",
  "received",
  "closed",
];
export const isSlipFrozen = (s: CakeProductionSlipStatus | string) =>
  SLIP_FROZEN.includes(s as CakeProductionSlipStatus);
