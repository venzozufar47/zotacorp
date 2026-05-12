"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, Plus, Trash2, Info } from "lucide-react";
import Link from "next/link";
import {
  createCakeOrder,
  updateCakeOrderFull,
} from "@/lib/actions/cake-orders.actions";
import { formatIDR } from "@/lib/cashflow/format";
import { ImageDropField } from "./ImageDropField";
import type {
  CakeAddOnLine,
  CakeAttachmentField,
  CakeDiscountKind,
  CakeOption,
  CakeOptionsByKind,
  CakeOrder,
} from "@/lib/cake-orders/types";

interface InitialPayment {
  kind: "dp" | "pelunasan";
  amountIdr: number;
  paymentOptionId: string;
  notes: string;
  /** Optional bukti transfer per leg. Server stores into
   *  cake_order_attachments and links via cake_order_payments.attachment_id. */
  proof?: {
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    previewUrl: string;
    fileName: string;
  } | null;
}

interface Props {
  optionsByKind: CakeOptionsByKind;
  /** When provided, the form switches to edit mode and pre-fills with
   *  the order. New uploads still upload to Storage and append to the
   *  order's existing attachment list. */
  editing?: CakeOrder;
  /** Override after-save behaviour (e.g. close a side panel instead
   *  of routing to the new order). When omitted: create → push to
   *  detail; edit → router.refresh(). */
  onSuccess?: (orderId: string) => void;
  /** Show a Cancel button next to Save (e.g. when editing inline in
   *  a side panel). */
  onCancel?: () => void;
  /** Force single-column layout regardless of viewport. Used by the
   *  side-panel quick-add (panel is already narrow on desktop and the
   *  2-col form would still trigger via viewport-based media queries). */
  singleColumn?: boolean;
  /** ID untuk `<form>` element supaya tombol submit eksternal bisa
   *  `<button form="…">`. Dipakai di slip preview saat sticky footer
   *  page-level diganti dengan "Simpan" yang men-trigger form ini. */
  formId?: string;
  /** Sembunyikan tombol Save internal — saat caller pakai `formId`
   *  untuk submit dari sticky footer eksternal. Tombol Cancel tetap
   *  ditampilkan (kalau ada `onCancel`) sebagai aksi sekunder. */
  hideInternalSave?: boolean;
}

const CAKE_INPUT =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

interface UploadedFile {
  field: CakeAttachmentField;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string; // local object URL for thumbs
  fileName: string;
}

/**
 * Custom cake order form. Sections follow the spec 1–20. Conditional
 * rendering: shape "custom" → free-text; delivery option's
 * needs_address=true → show alamat + ongkir; payment method ≠ Cash →
 * bukti transfer required.
 *
 * Pricing math runs both client-side (live total) and server-side
 * (re-computed in createCakeOrder so client can't tamper).
 */
export function NewCakeOrderForm({
  optionsByKind,
  editing,
  onSuccess,
  onCancel,
  singleColumn,
  formId,
  hideInternalSave,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!editing;

  // ---------- Form state ----------
  // Pre-fill from `editing` when in edit mode. The datetime-local
  // input expects "YYYY-MM-DDTHH:mm" (no seconds, no TZ); converting
  // an ISO string with `.slice(0,16)` works because we only need the
  // wall-clock value the user originally chose.
  const [customerName, setCustomerName] = useState(
    editing?.customer_name ?? ""
  );
  const [customerPhone, setCustomerPhone] = useState(
    editing?.customer_phone ?? ""
  );
  const [baseCakeOptionId, setBaseCakeOptionId] = useState(
    editing?.base_cake_option_id ?? ""
  );
  const [shapeOptionId, setShapeOptionId] = useState(
    editing?.shape_option_id ?? ""
  );
  const [shapeCustom, setShapeCustom] = useState(editing?.shape_custom ?? "");
  const [dimensionCm, setDimensionCm] = useState(
    editing?.dimension_cm != null ? String(editing.dimension_cm) : ""
  );
  const [fillingOptionId, setFillingOptionId] = useState(
    editing?.filling_option_id ?? ""
  );
  const [colorNotes, setColorNotes] = useState(editing?.color_notes ?? "");
  const [textureNotes, setTextureNotes] = useState(
    editing?.texture_notes ?? ""
  );
  const [decorationNotes, setDecorationNotes] = useState(
    editing?.decoration_notes ?? ""
  );
  const [accessoriesNotes, setAccessoriesNotes] = useState(
    editing?.accessories_notes ?? ""
  );
  const [greetingCard, setGreetingCard] = useState(
    editing?.greeting_card ?? ""
  );
  const [addOns, setAddOns] = useState<CakeAddOnLine[]>(
    editing?.add_ons_breakdown && editing.add_ons_breakdown.length > 0
      ? editing.add_ons_breakdown
      : [{ label: "", price_idr: 0 }]
  );
  const [discountKind, setDiscountKind] = useState<CakeDiscountKind>(
    editing?.discount_kind ?? "none"
  );
  const [discountValue, setDiscountValue] = useState(
    String(editing?.discount_value ?? 0)
  );
  const [scheduledAt, setScheduledAt] = useState(
    editing?.scheduled_at ? editing.scheduled_at.slice(0, 16) : ""
  );
  const [deliveryOptionId, setDeliveryOptionId] = useState(
    editing?.delivery_option_id ?? ""
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    editing?.delivery_address ?? ""
  );
  const [deliveryFeeIdr, setDeliveryFeeIdr] = useState(
    String(editing?.delivery_fee_idr ?? 0)
  );
  const [paymentOptionId, setPaymentOptionId] = useState(
    editing?.payment_option_id ?? ""
  );
  // Initial-payment ledger entries the form posts alongside the order.
  // Edit mode hides this section because payments after-the-fact use
  // the detail page's ledger UI (history-preserving).
  const [initialPayments, setInitialPayments] = useState<InitialPayment[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [showBasePrices, setShowBasePrices] = useState(false);

  /** Clear form state for back-to-back order entry on the standalone
   *  /cake-orders/new tab. Revokes blob URLs first so we don't leak
   *  the previously-uploaded preview thumbs. */
  const resetForm = () => {
    for (const f of files) URL.revokeObjectURL(f.previewUrl);
    for (const p of initialPayments) {
      if (p.proof) URL.revokeObjectURL(p.proof.previewUrl);
    }
    setCustomerName("");
    setCustomerPhone("");
    setBaseCakeOptionId("");
    setShapeOptionId("");
    setShapeCustom("");
    setDimensionCm("");
    setFillingOptionId("");
    setColorNotes("");
    setTextureNotes("");
    setDecorationNotes("");
    setAccessoriesNotes("");
    setGreetingCard("");
    setAddOns([{ label: "", price_idr: 0 }]);
    setDiscountKind("none");
    setDiscountValue("0");
    setScheduledAt("");
    setDeliveryOptionId("");
    setDeliveryAddress("");
    setDeliveryFeeIdr("0");
    setPaymentOptionId("");
    setInitialPayments([]);
    setFiles([]);
    setShowBasePrices(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // ---------- Derived option lookups ----------
  const baseOpt = useMemo(
    () => optionsByKind.base_cake.find((o) => o.id === baseCakeOptionId),
    [optionsByKind.base_cake, baseCakeOptionId]
  );
  const shapeOpt = useMemo(
    () => optionsByKind.shape.find((o) => o.id === shapeOptionId),
    [optionsByKind.shape, shapeOptionId]
  );
  const deliveryOpt = useMemo(
    () => optionsByKind.delivery.find((o) => o.id === deliveryOptionId),
    [optionsByKind.delivery, deliveryOptionId]
  );
  const paymentOpt = useMemo(
    () => optionsByKind.payment_method.find((o) => o.id === paymentOptionId),
    [optionsByKind.payment_method, paymentOptionId]
  );

  // ---------- Live pricing ----------
  const basePrice = baseOpt?.base_price_idr ?? 0;
  const addOnsTotal = addOns.reduce(
    (s, a) => s + Math.max(0, Math.round(a.price_idr || 0)),
    0
  );
  const discountValueNum = parseFloat(discountValue || "0") || 0;
  const discountIdr = (() => {
    if (discountKind === "none" || discountValueNum <= 0) return 0;
    if (discountKind === "percent") {
      const pct = Math.min(100, Math.max(0, discountValueNum));
      return Math.round(((basePrice + addOnsTotal) * pct) / 100);
    }
    return Math.min(basePrice + addOnsTotal, Math.round(discountValueNum));
  })();
  const ongkir =
    deliveryOpt?.needs_address && parseInt(deliveryFeeIdr || "0", 10) > 0
      ? Math.max(0, parseInt(deliveryFeeIdr || "0", 10))
      : 0;
  const total = Math.max(0, basePrice + addOnsTotal - discountIdr) + ongkir;

  // ---------- File handling ----------
  // Revoke any preview blob URL when its file is removed or when the
  // component unmounts — without this, every uploaded image holds the
  // underlying File in memory until the page navigates away.
  const filesByField = (field: CakeAttachmentField) =>
    files.filter((f) => f.field === field);
  const addFile = (f: UploadedFile) => setFiles((prev) => [...prev, f]);
  const removeFile = (storagePath: string) =>
    setFiles((prev) => {
      const target = prev.find((f) => f.storagePath === storagePath);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.storagePath !== storagePath);
    });
  useEffect(() => {
    return () => {
      for (const f of files) URL.revokeObjectURL(f.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCash =
    paymentOpt && paymentOpt.label.toLowerCase().trim() === "cash";

  // ---------- Submit ----------
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return toast.error("Atas nama pemesan wajib");
    if (!baseCakeOptionId) return toast.error("Pilih jenis base cake");
    if (!shapeOptionId) return toast.error("Pilih bentuk");
    if (shapeOpt?.is_custom_freeform && !shapeCustom.trim())
      return toast.error("Bentuk custom wajib diisi");
    if (!deliveryOptionId) return toast.error("Pilih metode pengiriman");
    if (deliveryOpt?.needs_address && !deliveryAddress.trim())
      return toast.error("Alamat kirim wajib diisi");
    if (!scheduledAt) return toast.error("Hari & jam pengambilan wajib");
    // Order-level payment method is optional now — each payment leg
    // carries its own. Each initial-payment row that's been added must
    // pick a method; rows with empty amount/method are dropped.
    for (const p of initialPayments) {
      if (p.amountIdr > 0 && !p.paymentOptionId) {
        return toast.error("Pilih metode untuk setiap pembayaran");
      }
    }

    startTransition(async () => {
      const payload = {
        customerName,
        customerPhone: customerPhone || null,
        baseCakeOptionId,
        shapeOptionId,
        shapeCustom: shapeOpt?.is_custom_freeform ? shapeCustom : null,
        dimensionCm: (() => {
          const v = Number(dimensionCm);
          return dimensionCm.trim() === "" || !Number.isFinite(v) ? null : v;
        })(),
        fillingOptionId: fillingOptionId || null,
        colorNotes: colorNotes || null,
        textureNotes: textureNotes || null,
        decorationNotes: decorationNotes || null,
        accessoriesNotes: accessoriesNotes || null,
        greetingCard: greetingCard || null,
        addOns,
        discountKind,
        discountValue: discountValueNum,
        scheduledAt: new Date(scheduledAt).toISOString(),
        deliveryOptionId,
        deliveryAddress: deliveryOpt?.needs_address ? deliveryAddress : null,
        deliveryFeeIdr: ongkir,
        // Order-level default method: snapshot from the first initial
        // payment row if present, else null.
        paymentOptionId:
          initialPayments.find(
            (p) => p.amountIdr > 0 && p.paymentOptionId.length > 0
          )?.paymentOptionId ?? null,
        attachments: files.map((f) => ({
          field: f.field,
          storagePath: f.storagePath,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
        // Edit mode skips the initial-payments ledger to preserve
        // existing history; the detail-page ledger handles new
        // payments after the fact.
        initialPayments: isEdit
          ? []
          : initialPayments
              .filter(
                (p) => p.amountIdr > 0 && p.paymentOptionId.length > 0
              )
              .map((p) => ({
                kind: p.kind,
                amountIdr: p.amountIdr,
                paymentOptionId: p.paymentOptionId,
                notes: p.notes || null,
                proofPath: p.proof?.storagePath ?? null,
                proofMimeType: p.proof?.mimeType ?? null,
                proofSizeBytes: p.proof?.sizeBytes ?? null,
              })),
      };

      if (isEdit) {
        const res = await updateCakeOrderFull(editing.id, payload);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Perubahan tersimpan");
        if (onSuccess) onSuccess(editing.id);
        else router.refresh();
        return;
      }

      const res = await createCakeOrder(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Order tersimpan");
      if (onSuccess) onSuccess(res.data!.orderId);
      // Standalone /cake-orders/new tab (no onSuccess) keeps the user
      // on this page for back-to-back entries — clear the form so
      // they can start the next order immediately.
      else resetForm();
    });
  };

  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      className={singleColumn ? "" : "pb-32 sm:pb-24"}
    >
      {/* Standalone /cake-orders/new shows its own back arrow + title;
          the side-panel host provides its own header so we hide ours
          when singleColumn is on. */}
      {!singleColumn && (
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/cake-orders"
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
            aria-label="Kembali"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </Link>
          <h1 className="text-base sm:text-lg font-semibold text-foreground">
            Order Custom Cake
          </h1>
        </div>
      )}

      {/* Two-column grid on md+; single column on mobile keeps the
          existing flow. Each Section sits in one cell so conditional
          fields stay inside their parent column.
          singleColumn forces 1-col regardless of viewport (used by
          the side-panel quick-add). */}
      <div
        className={
          singleColumn ? "space-y-3" : "grid md:grid-cols-2 gap-3"
        }
      >
        {/* ── LEFT COLUMN ─────────────────────────────────────── */}
        <div className="space-y-3">
          <Section emoji="👤" label="Pemesan">
            <Row>
              <FieldInline label="Nama" required className="flex-1 min-w-0">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  placeholder="Mas Budi"
                  className={CAKE_INPUT}
                />
              </FieldInline>
              <FieldInline label="📱 No HP" className="flex-1 min-w-0">
                <input
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0812-3456-7890"
                  className={CAKE_INPUT}
                />
              </FieldInline>
            </Row>
          </Section>

          <Section
            emoji="🍰"
            label="Cake"
            headerAction={
              <button
                type="button"
                onClick={() => setShowBasePrices((v) => !v)}
                aria-pressed={showBasePrices}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Lihat harga base cake"
              >
                <Info size={14} strokeWidth={2.5} />
              </button>
            }
          >
            {showBasePrices && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Harga base cake
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {optionsByKind.base_cake.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between gap-2"
                    >
                      <span className="text-foreground">{o.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        Rp {formatIDR(o.base_price_idr ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Row>
              <FieldInline label="Base" required className="flex-1 min-w-0">
                <Select
                  value={baseCakeOptionId}
                  onChange={setBaseCakeOptionId}
                  options={optionsByKind.base_cake}
                  placeholder="— base —"
                  required
                />
              </FieldInline>
              <FieldInline label="Bentuk" required className="flex-1 min-w-0">
                <Select
                  value={shapeOptionId}
                  onChange={setShapeOptionId}
                  options={optionsByKind.shape}
                  placeholder="— bentuk —"
                  required
                />
              </FieldInline>
              <FieldInline label="Filling" className="flex-1 min-w-0">
                <Select
                  value={fillingOptionId}
                  onChange={setFillingOptionId}
                  options={optionsByKind.filling}
                  placeholder="— filling —"
                />
              </FieldInline>
            </Row>
            {shapeOpt?.is_custom_freeform && (
              <FieldInline label="✏️ Custom" required>
                <input
                  type="text"
                  value={shapeCustom}
                  onChange={(e) => setShapeCustom(e.target.value)}
                  required
                  placeholder="hati, kotak hadiah, dll."
                  className={CAKE_INPUT}
                />
              </FieldInline>
            )}
            <FieldInline label="📏 Diameter">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={199}
                  value={dimensionCm}
                  onChange={(e) =>
                    setDimensionCm(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="16"
                  className={`${CAKE_INPUT} w-20 tabular-nums`}
                />
                <span className="text-xs text-muted-foreground">cm</span>
              </div>
            </FieldInline>
          </Section>

          <Section emoji="🎨" label="Tampilan">
            <PhotoNoteField
              label="🎨 Warna"
              notes={colorNotes}
              onNotes={setColorNotes}
              field="color"
              files={filesByField("color")}
              addFile={addFile}
              removeFile={removeFile}
            />
            <PhotoNoteField
              label="✨ Tekstur"
              notes={textureNotes}
              onNotes={setTextureNotes}
              field="texture"
              files={filesByField("texture")}
              addFile={addFile}
              removeFile={removeFile}
            />
            <PhotoNoteField
              label="✏️ Tulisan"
              notes={decorationNotes}
              onNotes={setDecorationNotes}
              field="decoration"
              files={filesByField("decoration")}
              addFile={addFile}
              removeFile={removeFile}
            />
            <PhotoNoteField
              label="🎀 Aksesoris"
              notes={accessoriesNotes}
              onNotes={setAccessoriesNotes}
              field="accessories"
              files={filesByField("accessories")}
              addFile={addFile}
              removeFile={removeFile}
            />
            <FieldInline label="💌 Greeting Card">
              <input
                type="text"
                value={greetingCard}
                onChange={(e) => setGreetingCard(e.target.value)}
                placeholder='"Selamat ulang tahun, Anya!"'
                className={CAKE_INPUT}
              />
            </FieldInline>
          </Section>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────── */}
        <div className="space-y-3">
          <Section emoji="🕒" label="Pengambilan">
            <Row>
              <FieldInline label="Jam" required className="flex-1 min-w-0">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                  className={`${CAKE_INPUT} max-w-[16rem]`}
                />
              </FieldInline>
              <FieldInline label="Kirim" required className="flex-1 min-w-0">
                <Select
                  value={deliveryOptionId}
                  onChange={setDeliveryOptionId}
                  options={optionsByKind.delivery}
                  placeholder="— kirim —"
                  required
                />
              </FieldInline>
            </Row>
            {deliveryOpt?.needs_address && (
              <Row>
                <FieldInline label="🏠 Alamat" required className="flex-1 min-w-0">
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    required
                    rows={1}
                    className={CAKE_INPUT}
                  />
                </FieldInline>
                <FieldInline label="💵 Ongkir" className="w-32 shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={deliveryFeeIdr}
                    onChange={(e) => setDeliveryFeeIdr(e.target.value)}
                    className={`${CAKE_INPUT} tabular-nums text-right`}
                  />
                </FieldInline>
              </Row>
            )}
          </Section>

          <Section emoji="💳" label="Pembayaran">
            {!isEdit ? (
              <InitialPaymentsTable
                rows={initialPayments}
                methods={optionsByKind.payment_method}
                total={total}
                onChange={setInitialPayments}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                Catatan pembayaran dikelola di halaman detail order.
              </p>
            )}
          </Section>

          <Section emoji="💰" label="Harga">
            <Row>
              <FieldInline label="Base" className="flex-1 min-w-0">
                <div
                  className={`${CAKE_INPUT} bg-muted/50 cursor-not-allowed tabular-nums`}
                >
                  Rp {formatIDR(basePrice)}
                </div>
              </FieldInline>
              <FieldInline label="🏷️ Diskon" className="w-44 shrink-0">
                <select
                  value={discountKind}
                  onChange={(e) =>
                    setDiscountKind(e.target.value as CakeDiscountKind)
                  }
                  className={CAKE_INPUT}
                >
                  <option value="none">Tidak ada</option>
                  <option value="percent">Persen (%)</option>
                  <option value="nominal">Nominal (Rp)</option>
                </select>
              </FieldInline>
              {discountKind !== "none" && (
                <FieldInline
                  label={discountKind === "percent" ? "Nilai (%)" : "Nilai (Rp)"}
                  required
                  className="w-32 shrink-0"
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={discountKind === "percent" ? 100 : undefined}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className={`${CAKE_INPUT} tabular-nums text-right`}
                    required
                  />
                </FieldInline>
              )}
            </Row>
            <FieldInline label="➕ Add-ons">
              <AddOnsTable rows={addOns} onChange={setAddOns} />
            </FieldInline>
          </Section>
        </div>
      </div>

      <SummaryBar
        basePrice={basePrice}
        addOns={addOnsTotal}
        discountIdr={discountIdr}
        ongkir={ongkir}
        total={total}
        pending={pending}
        inline={singleColumn}
        hideSave={hideInternalSave}
      />
    </form>
  );
}

// ---------- Layout primitives ---------------------------------------

/** Slim section wrapper — emoji + uppercase eyebrow instead of a full
 *  Card title row. Saves ~24 px per section vs the old `Card`. The
 *  `headerAction` slot lets a section ship a trailing button (e.g.
 *  the Cake info-popover) without breaking the inline header row. */
function Section({
  emoji,
  label,
  headerAction,
  children,
}: {
  emoji: string;
  label: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span aria-hidden>{emoji}</span>
          <span>{label}</span>
        </h2>
        {headerAction}
      </div>
      {children}
    </section>
  );
}

/** Tight inline field: smaller label sitting on top, no big margins. */
function FieldInline({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

/** Horizontal flex row that wraps on narrow viewports. */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

/** Tampilan rows: tight 1-line text + tiny photo strip on the right. */
function PhotoNoteField({
  label,
  notes,
  onNotes,
  field,
  files,
  addFile,
  removeFile,
}: {
  label: string;
  notes: string;
  onNotes: (v: string) => void;
  field: CakeAttachmentField;
  files: UploadedFile[];
  addFile: (f: UploadedFile) => void;
  removeFile: (storagePath: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
      <FieldInline label={label}>
        <input
          type="text"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          className={CAKE_INPUT}
        />
      </FieldInline>
      <div className="pt-[18px]">
        <ImageDropField
          field={field}
          files={files}
          onUploaded={addFile}
          onRemove={removeFile}
        />
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  required,
  renderLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CakeOption[];
  placeholder: string;
  required?: boolean;
  renderLabel?: (o: CakeOption) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={CAKE_INPUT}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {renderLabel ? renderLabel(o) : o.label}
        </option>
      ))}
    </select>
  );
}

function AddOnsTable({
  rows,
  onChange,
}: {
  rows: CakeAddOnLine[];
  onChange: (next: CakeAddOnLine[]) => void;
}) {
  const setRow = (i: number, patch: Partial<CakeAddOnLine>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i));
  };
  const addRow = () => onChange([...rows, { label: "", price_idr: 0 }]);

  return (
    <div className="mt-1 space-y-1">
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_120px_28px] gap-1.5 items-center"
        >
          <input
            type="text"
            value={row.label}
            onChange={(e) => setRow(i, { label: e.target.value })}
            placeholder="extra topping…"
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={row.price_idr || ""}
            onChange={(e) =>
              setRow(i, { price_idr: parseInt(e.target.value, 10) || 0 })
            }
            placeholder="Rp"
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums text-right"
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            disabled={rows.length === 1}
            className="size-7 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
            aria-label="Hapus baris"
          >
            <Trash2 size={12} strokeWidth={2.5} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
      >
        <Plus size={10} strokeWidth={2.5} />
        Tambah
      </button>
    </div>
  );
}

/** One operand chip in the summary bar — sign + label + amount, all
 *  inline so the bar stays single-row on desktop. `tone="danger"`
 *  uses the destructive color (readable on light themes, unlike the
 *  earlier washed-out pop-pink). */
function SummaryChip({
  label,
  value,
  sign,
  tone,
}: {
  label: string;
  value: number;
  sign?: "+" | "−";
  tone?: "danger";
}) {
  const valueCls =
    tone === "danger"
      ? "text-destructive font-medium"
      : "text-foreground font-medium";
  return (
    <span className="inline-flex items-baseline gap-1">
      {sign && (
        <span className="text-muted-foreground text-[11px]">{sign}</span>
      )}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`tabular-nums ${valueCls}`}>{formatIDR(value)}</span>
    </span>
  );
}

/**
 * Staged payment ledger entries to be inserted alongside the order.
 * Each row: kind (DP/Pelunasan), amount, method, optional notes.
 * Mirrors the AddOnsTable layout but with three primary fields.
 *
 * The amount column auto-suggests the order's total when the user
 * picks "Pelunasan" on a row whose amount is still empty — saves
 * keystrokes for the common single-payment case.
 */
function InitialPaymentsTable({
  rows,
  methods,
  total,
  onChange,
}: {
  rows: InitialPayment[];
  methods: CakeOption[];
  total: number;
  onChange: (next: InitialPayment[]) => void;
}) {
  const setRow = (i: number, patch: Partial<InitialPayment>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) =>
    onChange(rows.filter((_, idx) => idx !== i));
  const addRow = () =>
    onChange([
      ...rows,
      {
        kind: "dp",
        amountIdr: 0,
        paymentOptionId: "",
        notes: "",
        proof: null,
      },
    ]);

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Catat DP atau pelunasan beserta bukti transfer di sini.
          Kosongkan kalau customer belum bayar.
        </p>
      )}
      {rows.map((row, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-muted/20 p-2 space-y-1.5"
        >
          <div className="grid grid-cols-[90px_1fr_110px_28px] gap-1.5 items-center">
            <select
              value={row.kind}
              onChange={(e) => {
                const next = e.target.value as "dp" | "pelunasan";
                setRow(i, {
                  kind: next,
                  // Switching to pelunasan with empty amount prefills
                  // the full order total — usual single-payment case.
                  amountIdr:
                    next === "pelunasan" && row.amountIdr === 0
                      ? total
                      : row.amountIdr,
                });
              }}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="dp">DP</option>
              <option value="pelunasan">Pelunasan</option>
            </select>
            <select
              value={row.paymentOptionId}
              onChange={(e) =>
                setRow(i, { paymentOptionId: e.target.value })
              }
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— metode —</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={row.amountIdr || ""}
              onChange={(e) =>
                setRow(i, { amountIdr: parseInt(e.target.value, 10) || 0 })
              }
              placeholder="Rp"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums text-right"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="size-7 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive flex items-center justify-center"
              aria-label="Hapus baris pembayaran"
            >
              <Trash2 size={12} strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground pt-1">
              📷 Bukti
            </span>
            <PerRowProof
              proof={row.proof ?? null}
              onChange={(p) => setRow(i, { proof: p })}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
      >
        <Plus size={10} strokeWidth={2.5} />
        Tambah pembayaran
      </button>
    </div>
  );
}

/** Single-slot bukti uploader for one InitialPaymentsTable row.
 *  Adapts ImageDropField (multi-file shape) down to one. */
function PerRowProof({
  proof,
  onChange,
}: {
  proof: NonNullable<InitialPayment["proof"]> | null;
  onChange: (
    p: NonNullable<InitialPayment["proof"]> | null
  ) => void;
}) {
  const files = proof
    ? [
        {
          field: "payment_proof" as const,
          storagePath: proof.storagePath,
          mimeType: proof.mimeType,
          sizeBytes: proof.sizeBytes,
          previewUrl: proof.previewUrl,
          fileName: proof.fileName,
        },
      ]
    : [];
  return (
    <ImageDropField
      field="payment_proof"
      files={files}
      onUploaded={(f) => {
        if (proof) URL.revokeObjectURL(proof.previewUrl);
        onChange({
          storagePath: f.storagePath,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          previewUrl: f.previewUrl,
          fileName: f.fileName,
        });
      }}
      onRemove={() => {
        if (proof) URL.revokeObjectURL(proof.previewUrl);
        onChange(null);
      }}
    />
  );
}

function SummaryBar({
  basePrice,
  addOns,
  discountIdr,
  ongkir,
  total,
  pending,
  inline,
  hideSave,
}: {
  basePrice: number;
  addOns: number;
  discountIdr: number;
  ongkir: number;
  total: number;
  pending: boolean;
  /** True = in-flow sticky-bottom inside a panel; false (default) =
   *  fixed to viewport (standalone /cake-orders/new page). */
  inline?: boolean;
  /** Sembunyikan tombol Save — caller pakai sticky footer eksternal
   *  (mis. slip preview) yang submit form via `form="…"` attribute. */
  hideSave?: boolean;
}) {
  const cls = inline
    ? "mt-3 -mx-3 px-3 py-2 sticky bottom-0 bg-card border-t-2 border-foreground z-10"
    : "fixed left-0 right-0 z-30 bg-card border-t-2 border-foreground px-3 sm:px-4 py-2";
  const style: React.CSSProperties | undefined = inline
    ? undefined
    : {
        bottom: 0,
        paddingBottom:
          "calc(0.5rem + env(safe-area-inset-bottom, 0px) + 60px)",
      };
  return (
    <div className={cls} style={style}>
      <div className="max-w-[1700px] mx-auto flex items-center gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-0 flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <SummaryChip label="Base" value={basePrice} />
          {addOns > 0 && (
            <SummaryChip label="Add-ons" value={addOns} sign="+" />
          )}
          {discountIdr > 0 && (
            <SummaryChip
              label="Diskon"
              value={discountIdr}
              sign="−"
              tone="danger"
            />
          )}
          {ongkir > 0 && (
            <SummaryChip label="Ongkir" value={ongkir} sign="+" />
          )}
          <span className="ml-auto sm:ml-1 flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-foreground font-bold text-base tabular-nums">
              Rp {formatIDR(total)}
            </span>
          </span>
        </div>
        {!hideSave && (
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50 shrink-0"
          >
            <Save size={14} strokeWidth={2.5} />
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
        )}
      </div>
    </div>
  );
}
