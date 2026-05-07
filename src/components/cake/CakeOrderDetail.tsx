"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarClock,
  Truck,
  CreditCard,
  Cake,
  Receipt,
  X,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  addCakeOrderPayment,
  deleteCakeOrderPayment,
  getCakeAttachmentSignedUrl,
  setCakeOrderStatus,
} from "@/lib/actions/cake-orders.actions";
import { formatIDR } from "@/lib/cashflow/format";
import { makeLabelFor } from "@/lib/cake-orders/helpers";
import { ImagePopup } from "./ImagePopup";
import { ImageDropField } from "./ImageDropField";
import { NewCakeOrderForm } from "./NewCakeOrderForm";
import type {
  CakeAttachmentField,
  CakeOptionsByKind,
  CakeOrder,
  CakeOrderAttachment,
  CakeOrderPayment,
  CakeOrderStatus,
  CakePaymentKind,
} from "@/lib/cake-orders/types";

interface Props {
  order: CakeOrder;
  attachments: CakeOrderAttachment[];
  payments: CakeOrderPayment[];
  optionsByKind: CakeOptionsByKind | null;
  isAdminView: boolean;
  canEdit: boolean;
  /** When provided, the back arrow becomes a close button (used by the
   *  kanban side panel; no `<Link>` so the lobby URL stays). */
  onClose?: () => void;
}

/**
 * Compact one-screen detail. Spec rows show their reference photos
 * inline on the right side; the Pembayaran section is a full ledger
 * (DP / Pelunasan / Refund) with an inline "Tambah pembayaran" form.
 *
 * Layout: 2-column grid on `md:`; single column on mobile.
 */
export function CakeOrderDetail({
  order,
  attachments,
  payments,
  optionsByKind,
  isAdminView,
  canEdit,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addingPayment, setAddingPayment] = useState(false);
  // Optional pre-fill for the AddPaymentForm kind selector. The
  // "Refund" shortcut in Aksi sets this to "refund"; the regular
  // "+ Tambah pembayaran" button leaves it null so the form picks
  // its smart default (pelunasan when balance > 0, otherwise dp).
  const [addingPaymentKind, setAddingPaymentKind] =
    useState<CakePaymentKind | null>(null);
  const [editing, setEditing] = useState(false);

  const labelFor = makeLabelFor(optionsByKind);
  const attByField = useMemo(() => {
    const m: Record<CakeAttachmentField, CakeOrderAttachment[]> = {
      color: [],
      texture: [],
      decoration: [],
      accessories: [],
      payment_proof: [],
    };
    for (const a of attachments) m[a.field].push(a);
    return m;
  }, [attachments]);

  const totals = useMemo(() => {
    const paid = payments
      .filter((p) => p.kind !== "refund")
      .reduce((s, p) => s + p.amount_idr, 0);
    const refunded = payments
      .filter((p) => p.kind === "refund")
      .reduce((s, p) => s + p.amount_idr, 0);
    const net = paid - refunded;
    const remaining = order.total_idr - net;
    return { paid, refunded, net, remaining };
  }, [payments, order.total_idr]);

  // Status transitions live on the kanban card next-step button —
  // duplicating them here was confusing for admin. The detail-panel
  // Aksi section is intentionally narrow: Refund + Batalkan only.

  const onCancel = () =>
    startTransition(async () => {
      if (!confirm("Yakin batalkan order ini?")) return;
      const res = await setCakeOrderStatus(order.id, "cancelled");
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Order dibatalkan");
      router.refresh();
    });

  const backHref = isAdminView ? "/admin/cake-orders" : "/cake-orders";

  // Edit mode: swap the read-only body for the order form pre-filled
  // with current values. Save → close edit + refresh; Cancel → back
  // to read-only.
  if (editing) {
    if (!optionsByKind) {
      return (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Opsi belum termuat — coba refresh.
        </div>
      );
    }
    return (
      <div className="space-y-3 pb-12">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
            aria-label="Batal edit"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <h1 className="text-base sm:text-lg font-semibold text-foreground">
            Edit pesanan — {order.customer_name}
          </h1>
        </div>
        <NewCakeOrderForm
          optionsByKind={optionsByKind}
          editing={order}
          singleColumn
          onSuccess={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-12">
      <div className="flex items-center gap-2">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
            aria-label="Tutup"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        ) : (
          <Link
            href={backHref}
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
            aria-label="Kembali"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
            {order.customer_name}
            {order.customer_phone && (
              <a
                href={`tel:${order.customer_phone}`}
                className="ml-2 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                📱 {order.customer_phone}
              </a>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            {format(new Date(order.scheduled_at), "EEEE, d MMM yyyy · HH:mm", {
              locale: idLocale,
            })}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 rounded-lg border border-foreground bg-card px-2 py-1 text-xs font-medium hover:bg-muted"
            aria-label="Edit"
          >
            <Pencil size={11} strokeWidth={2.5} />
            Edit
          </button>
        )}
        <PaymentStatusBadge order={order} />
      </div>

      {/* CSS-multicolumn so sections fill both halves with no dead
          space at the bottom of the shorter column. Each section
          marks itself break-inside-avoid via the [&>section] selector
          so the engine doesn't split a section across columns. */}
      <div className="md:columns-2 md:gap-3 [&>section]:mb-3 [&>section]:break-inside-avoid">
        <Section emoji={<Cake size={14} strokeWidth={2.5} />} label="Spesifikasi">
          <Spec label="Base">{labelFor("base_cake", order.base_cake_option_id)}</Spec>
          <Spec label="Bentuk">
            {labelFor("shape", order.shape_option_id)}
            {order.shape_custom ? ` — ${order.shape_custom}` : ""}
          </Spec>
          {order.filling_option_id && (
            <Spec label="Filling">
              {labelFor("filling", order.filling_option_id)}
            </Spec>
          )}
          <SpecWithPhotos
            label="Warna"
            value={order.color_notes}
            photos={attByField.color}
          />
          <SpecWithPhotos
            label="Tekstur"
            value={order.texture_notes}
            photos={attByField.texture}
          />
          <SpecWithPhotos
            label="Tulisan"
            value={order.decoration_notes}
            photos={attByField.decoration}
          />
          <SpecWithPhotos
            label="Aksesoris"
            value={order.accessories_notes}
            photos={attByField.accessories}
          />
          {order.greeting_card && (
            <Spec label="Greeting Card">&ldquo;{order.greeting_card}&rdquo;</Spec>
          )}
        </Section>

        <Section
          emoji={<Truck size={14} strokeWidth={2.5} />}
          label="Pengiriman"
        >
            <Spec label="Metode">
              {labelFor("delivery", order.delivery_option_id)}
            </Spec>
            {order.delivery_address && (
              <Spec label="Alamat">{order.delivery_address}</Spec>
            )}
            <Spec label="Jam">
              {format(new Date(order.scheduled_at), "EEE, d MMM · HH:mm", {
                locale: idLocale,
              })}
            </Spec>
          </Section>

          <Section
            emoji={<Receipt size={14} strokeWidth={2.5} />}
            label="Harga"
          >
            <PriceRow
              label="Base"
              value={`Rp ${formatIDR(order.base_price_idr)}`}
            />
            {order.add_ons_breakdown && order.add_ons_breakdown.length > 0
              ? order.add_ons_breakdown.map((a, i) => (
                  <PriceRow
                    key={i}
                    label={`+ ${a.label || "—"}`}
                    value={`Rp ${formatIDR(a.price_idr)}`}
                    muted
                  />
                ))
              : order.add_ons_idr > 0 && (
                  <PriceRow
                    label="Add-ons"
                    value={`Rp ${formatIDR(order.add_ons_idr)}`}
                  />
                )}
            {order.discount_idr > 0 && (
              <PriceRow
                label="Diskon"
                value={`−Rp ${formatIDR(order.discount_idr)}`}
                tone="danger"
              />
            )}
            {order.delivery_fee_idr > 0 && (
              <PriceRow
                label="Ongkir"
                value={`Rp ${formatIDR(order.delivery_fee_idr)}`}
              />
            )}
            <div className="flex justify-between pt-1 mt-0.5 border-t border-border text-sm font-bold text-foreground">
              <span>Total</span>
              <span className="tabular-nums">
                Rp {formatIDR(order.total_idr)}
              </span>
            </div>
          </Section>

          <Section
            emoji={<CreditCard size={14} strokeWidth={2.5} />}
            label="Pembayaran"
          >
            <PaymentSummary
              total={order.total_idr}
              paid={totals.paid}
              refunded={totals.refunded}
              remaining={totals.remaining}
            />
            {payments.length > 0 && (
              <ul className="space-y-1 mt-1">
                {payments.map((p) => (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    methodLabel={labelFor("payment_method", p.payment_option_id)}
                    canEdit={canEdit}
                  />
                ))}
              </ul>
            )}
            {canEdit && (
              <>
                {addingPayment ? (
                  <AddPaymentForm
                    orderId={order.id}
                    methods={optionsByKind?.payment_method ?? []}
                    remaining={totals.remaining}
                    refundable={totals.net}
                    defaultKind={addingPaymentKind}
                    onDone={() => {
                      setAddingPayment(false);
                      setAddingPaymentKind(null);
                      router.refresh();
                    }}
                    onCancel={() => {
                      setAddingPayment(false);
                      setAddingPaymentKind(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingPayment(true)}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors mt-1"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    Tambah pembayaran
                  </button>
                )}
              </>
            )}
          </Section>

          {canEdit &&
            order.status !== "cancelled" &&
            order.status !== "done" && (
            <Section emoji="⚙" label="Aksi">
              <div className="flex flex-wrap gap-1.5">
                {/* Refund opens the payment ledger form with kind
                    pre-set to "refund" — saves the admin from
                    scrolling up + picking the kind manually. */}
                {totals.net > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPayment(true);
                      setAddingPaymentKind("refund");
                    }}
                    disabled={pending}
                    className="rounded-lg bg-card border border-foreground px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Refund
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={pending}
                  className="rounded-lg bg-destructive text-destructive-foreground border border-foreground px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Batalkan
                </button>
              </div>
            </Section>
          )}
      </div>
    </div>
  );
}

// ---------- Pembayaran ----------------------------------------------

function PaymentSummary({
  total,
  paid,
  refunded,
  remaining,
}: {
  total: number;
  paid: number;
  refunded: number;
  remaining: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0 text-[12px] leading-tight">
      <span className="text-muted-foreground">Total</span>
      <span className="tabular-nums text-right text-foreground">
        Rp {formatIDR(total)}
      </span>
      <span className="text-muted-foreground">Sudah dibayar</span>
      <span className="tabular-nums text-right text-foreground">
        Rp {formatIDR(paid)}
      </span>
      {refunded > 0 && (
        <>
          <span className="text-muted-foreground">Refund</span>
          <span className="tabular-nums text-right text-destructive">
            −Rp {formatIDR(refunded)}
          </span>
        </>
      )}
      <span className="font-semibold text-foreground border-t border-border pt-0.5 mt-0.5">
        {remaining > 0 ? "Sisa tagihan" : remaining < 0 ? "Lebih bayar" : "Lunas"}
      </span>
      <span
        className={`tabular-nums text-right font-semibold border-t border-border pt-0.5 mt-0.5 ${
          remaining > 0
            ? "text-foreground"
            : remaining < 0
              ? "text-destructive"
              : "text-pop-emerald"
        }`}
      >
        Rp {formatIDR(Math.abs(remaining))}
      </span>
    </div>
  );
}

/** Compact 2-col price row for the Harga section. Replaces a Spec
 *  row to remove the unused 68px label gutter — prices fill the
 *  whole row width which reads better in a narrow panel. */
function PriceRow({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: "danger";
  muted?: boolean;
}) {
  const labelCls = muted
    ? "text-muted-foreground text-[11px]"
    : "text-muted-foreground text-[12px]";
  const valueCls =
    tone === "danger"
      ? "text-destructive text-[12px] font-medium"
      : muted
        ? "text-muted-foreground text-[11px]"
        : "text-foreground text-[12px]";
  return (
    <div className="flex justify-between items-baseline gap-2 leading-tight">
      <span className={labelCls}>{label}</span>
      <span className={`${valueCls} tabular-nums`}>{value}</span>
    </div>
  );
}

function PaymentRow({
  payment,
  methodLabel,
  canEdit,
}: {
  payment: CakeOrderPayment;
  methodLabel: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isRefund = payment.kind === "refund";
  const onDelete = () => {
    if (!confirm(`Hapus pembayaran "${payment.label}"?`)) return;
    startTransition(async () => {
      const res = await deleteCakeOrderPayment(payment.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pembayaran dihapus");
      router.refresh();
    });
  };
  return (
    <li className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-xs flex items-center gap-2">
      <span
        className={`inline-block rounded-full border px-1.5 py-0 text-[10px] font-medium shrink-0 ${
          isRefund
            ? "bg-destructive/15 border-foreground text-foreground"
            : "bg-pop-emerald/20 border-foreground text-foreground"
        }`}
      >
        {payment.label}
      </span>
      <span className="flex-1 min-w-0 truncate text-muted-foreground">
        {methodLabel} ·{" "}
        {format(new Date(payment.paid_at), "d MMM · HH:mm", {
          locale: idLocale,
        })}
        {payment.notes ? ` · ${payment.notes}` : ""}
      </span>
      <span
        className={`tabular-nums shrink-0 font-medium ${
          isRefund ? "text-destructive" : "text-foreground"
        }`}
      >
        {isRefund ? "−" : ""}Rp {formatIDR(payment.amount_idr)}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="size-5 rounded text-muted-foreground hover:text-destructive disabled:opacity-30 flex items-center justify-center"
          aria-label="Hapus"
        >
          <Trash2 size={11} strokeWidth={2.5} />
        </button>
      )}
    </li>
  );
}

interface UploadedProof {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string;
  fileName: string;
}

function AddPaymentForm({
  orderId,
  methods,
  remaining,
  refundable,
  defaultKind,
  onDone,
  onCancel,
}: {
  orderId: string;
  methods: CakeOptionsByKind["payment_method"];
  remaining: number;
  refundable: number;
  /** Caller may pre-select a kind (e.g. "refund" from the Aksi
   *  shortcut). When null, falls back to a smart default. */
  defaultKind?: CakePaymentKind | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Smart default kind: caller override > pelunasan if balance > 0 > dp.
  const [kind, setKind] = useState<CakePaymentKind>(
    defaultKind ?? (remaining > 0 ? "pelunasan" : "dp")
  );
  const [amount, setAmount] = useState(
    String(remaining > 0 ? remaining : 0)
  );
  const [methodId, setMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<UploadedProof | null>(null);
  const [pending, startTransition] = useTransition();

  // When kind changes, reset the suggested amount.
  useEffect(() => {
    if (kind === "pelunasan") setAmount(String(Math.max(0, remaining)));
    if (kind === "refund") setAmount(String(Math.max(0, refundable)));
    if (kind === "dp") setAmount("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Nominal tidak valid");
      return;
    }
    if (!methodId) {
      toast.error("Pilih metode pembayaran");
      return;
    }
    startTransition(async () => {
      const res = await addCakeOrderPayment({
        orderId,
        kind,
        amountIdr: n,
        paymentOptionId: methodId,
        notes: notes || null,
        proofPath: proof?.storagePath ?? null,
        proofMimeType: proof?.mimeType ?? null,
        proofSizeBytes: proof?.sizeBytes ?? null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pembayaran tersimpan");
      if (proof) URL.revokeObjectURL(proof.previewUrl);
      onDone();
    });
  };

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";
  const labelCls = "text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-foreground bg-card p-2.5 mt-1.5 space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Tambah pembayaran
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
          aria-label="Tutup"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className={labelCls}>Tipe</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CakePaymentKind)}
            className={inputCls}
          >
            <option value="dp">DP (down payment)</option>
            <option value="pelunasan">Pelunasan</option>
            <option value="refund">Refund</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Nominal (Rp)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} tabular-nums text-right`}
            required
          />
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Metode</span>
        <select
          value={methodId}
          onChange={(e) => setMethodId(e.target.value)}
          className={inputCls}
          required
        >
          <option value="">— pilih metode —</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelCls}>Catatan (opsional)</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder='Contoh: "DP via QRIS, screenshot terlampir"'
          className={inputCls}
        />
      </label>
      {kind !== "refund" && (
        <div>
          <span className={labelCls}>Bukti transfer (opsional)</span>
          <ProofUpload proof={proof} onChange={setProof} />
        </div>
      )}
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-primary text-primary-foreground border border-foreground px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan pembayaran"}
        </button>
      </div>
    </form>
  );
}

/** Wraps ImageDropField for a single payment-proof slot. ImageDropField
 *  expects the multi-file shape so we adapt it down to one. */
function ProofUpload({
  proof,
  onChange,
}: {
  proof: UploadedProof | null;
  onChange: (p: UploadedProof | null) => void;
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
        // Replace any existing single proof.
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

// ---------- Layout primitives -----------------------------------------

function Section({
  emoji,
  label,
  children,
}: {
  emoji: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 space-y-1.5">
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span aria-hidden>{emoji}</span>
        <span>{label}</span>
      </h2>
      {children}
    </section>
  );
}

function Spec({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "danger";
}) {
  const valueCls = tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words ${valueCls}`}>{children}</span>
    </div>
  );
}

function SpecWithPhotos({
  label,
  value,
  photos,
}: {
  label: string;
  value: string | null;
  photos: CakeOrderAttachment[];
}) {
  if (!value && photos.length === 0) return null;
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 items-start text-sm">
      <span className="text-xs text-muted-foreground pt-0.5">{label}</span>
      <div className="min-w-0 flex flex-wrap items-center gap-1.5">
        {value && (
          <span className="text-foreground break-words flex-1 min-w-0">
            {value}
          </span>
        )}
        {photos.map((p) => (
          <SignedThumb key={p.id} attachment={p} />
        ))}
      </div>
    </div>
  );
}

function PaymentStatusBadge({ order }: { order: CakeOrder }) {
  // Mirrors the kanban PaymentChip — keeps the two surfaces in sync
  // when a DP is recorded: chip shows "DP Rp X" rather than the
  // ambiguous "Belum dibayar".
  const { payment_status, paid_idr, total_idr } = order;
  const fmtRp = (n: number) =>
    n >= 1_000_000
      ? `Rp ${(n / 1_000_000).toFixed(1)}jt`
      : n >= 1_000
        ? `Rp ${(n / 1_000).toFixed(0)}rb`
        : `Rp ${n.toLocaleString("id-ID")}`;
  let label = "Belum dibayar";
  let cls = "bg-muted text-muted-foreground border-border";
  if (payment_status === "refunded") {
    label = "Refund";
    cls = "bg-destructive/15 text-foreground border-foreground";
  } else if (payment_status === "partial_refund") {
    label = "Refund sebagian";
    cls = "bg-pop-pink/20 text-foreground border-foreground";
  } else if (payment_status === "paid") {
    label = "Lunas";
    cls = "bg-pop-emerald/20 text-foreground border-foreground";
  } else if (paid_idr > 0 && paid_idr < total_idr) {
    label = `DP ${fmtRp(paid_idr)}`;
    cls = "bg-tertiary/40 text-foreground border-foreground";
  }
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${cls}`}
    >
      {label}
    </span>
  );
}

function SignedThumb({ attachment }: { attachment: CakeOrderAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getCakeAttachmentSignedUrl(attachment.id);
      if (!cancelled && res.ok) setUrl(res.data!.url);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  if (!url) {
    return (
      <div className="size-12 rounded-lg border border-border bg-muted animate-pulse shrink-0" />
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block size-12 rounded-lg overflow-hidden border border-foreground bg-muted hover:opacity-90 active:scale-95 transition-transform shrink-0"
        aria-label="Lihat foto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="w-full h-full object-cover" />
      </button>
      {open && <ImagePopup url={url} onClose={() => setOpen(false)} />}
    </>
  );
}
