/**
 * Local types for the cake-order tables. We keep these here instead
 * of regenerating the 70k-char Supabase types file. Shapes mirror
 * the migration `cake_orders_phase1_and_2_schema`.
 */

export type CakeOptionKind =
  | "base_cake"
  | "shape"
  | "filling"
  | "delivery"
  | "payment_method";

export interface CakeOption {
  id: string;
  kind: CakeOptionKind;
  label: string;
  base_price_idr: number | null;
  needs_address: boolean;
  is_custom_freeform: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export type CakeAttachmentField =
  | "color"
  | "texture"
  | "decoration"
  | "accessories"
  | "payment_proof";

export interface CakeOrderAttachment {
  id: string;
  cake_order_id: string;
  field: CakeAttachmentField;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export type CakeDiscountKind = "none" | "percent" | "nominal";

/** One row in the add-ons table on the order form. */
export interface CakeAddOnLine {
  label: string;
  price_idr: number;
}

export type CakePaymentStatus =
  | "unpaid"
  | "paid"
  | "refunded"
  | "partial_refund";

export type CakePaymentKind = "dp" | "pelunasan" | "refund";

export interface CakeOrderPayment {
  id: string;
  cake_order_id: string;
  kind: CakePaymentKind;
  label: string;
  amount_idr: number;
  payment_option_id: string;
  notes: string | null;
  attachment_id: string | null;
  paid_at: string;
  created_by: string;
  created_at: string;
}

/** Form payload for adding one payment. */
export interface AddCakePaymentInput {
  orderId: string;
  kind: CakePaymentKind;
  amountIdr: number;
  paymentOptionId: string;
  /** Optional override; server fills "DP 1", "DP 2", … if blank. */
  label?: string | null;
  notes?: string | null;
  proofPath?: string | null;
  proofMimeType?: string | null;
  proofSizeBytes?: number | null;
}

export type CakeProductionStatus =
  | "pending"
  | "in_progress"
  | "decorating"
  | "done"
  | "cancelled";

export type CakeOrderStatus =
  | "submitted"
  | "in_progress"
  | "ready"
  | "delivering"
  | "done"
  | "cancelled";

export interface CakeOrder {
  id: string;
  customer_name: string;
  customer_phone: string | null;

  /** Cabang tempat order dibuat. Menentukan kolom harga di
   *  matriks (Pare vs Semarang). */
  branch: CakeBranch;

  base_cake_option_id: string;
  base_price_idr: number;
  shape_option_id: string;
  shape_custom: string | null;
  /** Diameter / sisi terpanjang kue dalam cm. Null = belum diisi
   *  admin. Dipakai untuk rekap baking — kue dengan ukuran sama
   *  + base + shape sama dianggap satu batch. */
  dimension_cm: number | null;
  filling_option_id: string | null;

  color_notes: string | null;
  texture_notes: string | null;
  decoration_notes: string | null;
  accessories_notes: string | null;
  greeting_card: string | null;

  add_ons_idr: number;
  add_ons_breakdown: CakeAddOnLine[] | null;
  discount_kind: CakeDiscountKind;
  discount_value: number;
  discount_idr: number;

  scheduled_at: string;
  delivery_option_id: string;
  delivery_address: string | null;
  delivery_fee_idr: number;

  total_idr: number;

  /** Optional default method snapshot. Each cake_order_payments leg
   *  carries its own method; this column is kept as a convenience
   *  for legacy callers and may be null for orders created without
   *  a default. */
  payment_option_id: string | null;
  payment_status: CakePaymentStatus;
  paid_at: string | null;
  /** Snapshot of net paid (sum dp+pelunasan − refund). Updated by
   *  trigger on cake_order_payments. Used by the kanban card chip so
   *  we don't have to join the ledger per render. */
  paid_idr: number;

  refund_idr: number;
  refund_notes: string | null;
  refunded_at: string | null;

  production_status: CakeProductionStatus;
  production_started_at: string | null;
  decorating_started_at: string | null;
  production_done_at: string | null;

  status: CakeOrderStatus;
  archived_at: string | null;

  created_by: string;
  created_at: string;
  updated_at: string;
}

export type CakeProductionSlipStatus =
  | "draft"
  | "verified"
  | "sent"
  | "reopened"
  | "received"
  | "closed";

export interface CakeProductionSlip {
  id: string;
  target_date: string; // YYYY-MM-DD
  branch: CakeBranch;
  status: CakeProductionSlipStatus;
  notes: string | null;
  prepared_by: string | null;
  prepared_at: string;
  verified_by: string | null;
  verified_at: string | null;
  sent_by: string | null;
  sent_at: string | null;
  received_by: string | null;
  received_at: string | null;
  closed_at: string | null;
  /** Frozen view for the production team. Updated on every
   *  successful (re-)verify+send. Production reads from here so
   *  mid-day admin edits are invisible until next send. */
  last_sent_snapshot: CakeSlipSnapshot | null;
  /** Banner payload after a re-send. Cleared on acknowledge. */
  pending_diff: CakeSlipDiff | null;
  diff_acknowledged_at: string | null;
  sent_count: number;
}

/** Per-item snapshot stored on each (re-)verify+send. Stores the
 *  resolved labels (not option ids) so future edits to cake_options
 *  don't retroactively mutate a sent slip's display. */
export interface CakeSlipSnapshotItem {
  orderId: string;
  branch: CakeBranch;
  customerName: string;
  customerPhone: string | null;
  baseLabel: string;
  shapeLabel: string;
  shapeCustom: string | null;
  /** Diameter dalam cm. Null = tidak dispesifikasi. */
  dimensionCm: number | null;
  fillingLabel: string | null;
  colorNotes: string | null;
  textureNotes: string | null;
  decorationNotes: string | null;
  accessoriesNotes: string | null;
  greetingCard: string | null;
  deliveryLabel: string;
  deliveryAddress: string | null;
  scheduledAt: string;
  sortOrder: number;
}

export interface CakeSlipSnapshot {
  takenAt: string;
  takenBy: string;
  notes: string | null;
  items: CakeSlipSnapshotItem[];
}

/** Diff between a previous and a new snapshot — drives the banner. */
export interface CakeSlipDiff {
  computedAt: string;
  added: Array<{ orderId: string; customerName: string }>;
  removed: Array<{ orderId: string; customerName: string }>;
  modified: Array<{
    orderId: string;
    customerName: string;
    fields: Array<{
      label: string;
      before: string | null;
      after: string | null;
    }>;
  }>;
}

export interface CakeProductionSlipItem {
  slip_id: string;
  cake_order_id: string;
  sort_order: number;
  override_notes: string | null;
}

/** Form payload from the new-order client. Server recomputes totals. */
export interface CreateCakeOrderInput {
  customerName: string;
  customerPhone?: string | null;
  /** Cabang tempat order dibuat. Wajib — menentukan harga di matriks. */
  branch: CakeBranch;
  baseCakeOptionId: string;
  shapeOptionId: string;
  shapeCustom?: string | null;
  /** Diameter / ukuran sisi terpanjang kue (cm). Optional. */
  dimensionCm?: number | null;
  /**
   * Harga base override yang admin isi manual di form. Dipakai kalau
   * kombinasi (base, diameter) tidak ada di `cake_base_diameter_prices`
   * matrix. Server selalu prioritaskan matrix dulu; override hanya
   * dipakai sebagai fallback.
   */
  basePriceOverrideIdr?: number | null;
  fillingOptionId?: string | null;

  colorNotes?: string | null;
  textureNotes?: string | null;
  decorationNotes?: string | null;
  accessoriesNotes?: string | null;
  greetingCard?: string | null;

  /**
   * Add-ons as a label+price array. Server sums to populate
   * `add_ons_idr` and snapshots the array into `add_ons_breakdown`.
   */
  addOns: CakeAddOnLine[];
  discountKind: CakeDiscountKind;
  discountValue: number;

  scheduledAt: string; // ISO datetime
  deliveryOptionId: string;
  deliveryAddress?: string | null;
  deliveryFeeIdr: number;

  /** Optional. If omitted, the server snapshots the first
   *  initial-payment row's method, otherwise leaves the order's
   *  default-method column null. */
  paymentOptionId?: string | null;
  /**
   * Storage paths from /api/cake-orders/upload, grouped by field.
   * The action persists one cake_order_attachments row per path.
   */
  attachments?: Array<{
    field: CakeAttachmentField;
    storagePath: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }>;
  /**
   * Optional staged payments recorded at order creation time. Each
   * row writes a `cake_order_payments` leg; the trigger on that
   * table auto-refreshes the order's payment_status snapshot. Refund
   * is intentionally not allowed here — refunds happen post-payment
   * via the detail page.
   *
   * Each leg can carry its own optional proof image — bukti transfer
   * is logged per payment, not per order.
   */
  initialPayments?: Array<{
    kind: "dp" | "pelunasan";
    amountIdr: number;
    paymentOptionId: string;
    notes?: string | null;
    proofPath?: string | null;
    proofMimeType?: string | null;
    proofSizeBytes?: number | null;
  }>;
}

/** Lookup helper: options grouped by kind, only active rows. */
export type CakeOptionsByKind = Record<CakeOptionKind, CakeOption[]>;

/** Diameter preset (global list, shared across all base cakes). */
export interface CakeDiameterOption {
  id: string;
  diameter_cm: number;
  label: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/** Branch cabang. Saat ini hanya Pare & Semarang — harga base
 *  cake dibedakan per branch. */
export type CakeBranch = "pare" | "semarang";

export const CAKE_BRANCHES: CakeBranch[] = ["pare", "semarang"];

export const CAKE_BRANCH_LABELS: Record<CakeBranch, string> = {
  pare: "Pare",
  semarang: "Semarang",
};

/** Tailwind bg utility per branch — dipakai oleh badge / pill / toggle
 *  supaya warna konsisten di seluruh UI. */
export const CAKE_BRANCH_BG: Record<CakeBranch, string> = {
  pare: "bg-pop-emerald/30",
  semarang: "bg-pop-pink/30",
};

/** Coerce nilai dari user-input / URL search params jadi CakeBranch
 *  yang valid. Default 'pare' supaya aplikasi (Haengbocake Pare)
 *  tetap dapat slip kerja meski admin memasukkan param sembarangan. */
export function parseCakeBranch(v: unknown): CakeBranch {
  return v === "semarang" ? "semarang" : "pare";
}

/** Nama kolom harga di `cake_base_diameter_prices` per branch. */
export function branchPriceCol(
  b: CakeBranch
): "price_pare_idr" | "price_semarang_idr" {
  return b === "pare" ? "price_pare_idr" : "price_semarang_idr";
}

/** One cell in the (base × diameter) price matrix. Setiap sel
 *  menyimpan dua harga (Pare + Semarang); null = belum diset
 *  untuk cabang tersebut. */
export interface CakeBaseDiameterPrice {
  base_option_id: string;
  diameter_id: string;
  price_pare_idr: number | null;
  price_semarang_idr: number | null;
  updated_at: string;
}
