"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  cancelPesanan,
  settlePesanan,
  updatePesananItems,
} from "@/lib/actions/pos-pesanan.actions";
import { attachPosQrisReceipt } from "@/lib/actions/pos-receipt.actions";
import type { PosProduct, PosProductVariant } from "@/lib/actions/pos.actions";
import { formatRp } from "@/lib/cashflow/format";
import { QRIS_RECEIPT_AT_CHECKOUT } from "@/lib/pos/flags";
import { validateReceiptImage } from "@/lib/pos/receipt-file";
import { compressReceiptFile } from "@/lib/pos/receipt-upload";
import type { PendingPesanan } from "@/lib/actions/pos-pesanan.actions";
import {
  isSugarLevel,
  SUGAR_LEVELS,
  sugarLevelLabel,
  type SugarLevel,
} from "@/lib/pos/sugar-levels";
import {
  authorizerNames,
  POS_OPERATION_LABEL_ID,
  type PosAuthorizerRef,
} from "@/lib/pos-pin-format";
import { PosPinAuthDialog } from "./PosPinAuthDialog";

function timeAgo(iso: string): string {
  if (!iso) return "";
  const elapsed = Date.now() - new Date(iso).getTime();
  const mins = Math.round(elapsed / 60000);
  if (mins < 1) return "barusan";
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  return `${days} hari lalu`;
}

export function PesananList({
  pesanan,
  authorizers,
  products,
}: {
  pesanan: PendingPesanan[];
  /** Kosong = pembatalan tidak butuh PIN, dan tidak ada nama tercatat. */
  authorizers: PosAuthorizerRef[];
  /** Katalog aktif outlet — sumber "+ Tambah produk" di dialog edit. */
  products: PosProduct[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  if (pesanan.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-10 text-center">
        <Clock
          size={28}
          className="mx-auto text-muted-foreground"
          strokeWidth={1.8}
        />
        <p className="mt-2 text-sm font-medium text-foreground">
          Belum ada pesanan tertunda.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pesanan yang stok-nya sudah keluar tapi belum dibayar akan
          tampil di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pesanan.map((p) => (
        <PesananCard
          key={p.id}
          pesanan={p}
          onOpenSettle={() => setOpenId(p.id)}
          onCancel={() => setCancelId(p.id)}
          onEdit={() => setEditId(p.id)}
        />
      ))}
      {openId && (
        <SettlePesananDialog
          pesanan={pesanan.find((p) => p.id === openId)!}
          onClose={() => setOpenId(null)}
        />
      )}
      {cancelId && (
        <CancelPesananDialog
          pesanan={pesanan.find((p) => p.id === cancelId)!}
          authorizers={authorizers}
          onClose={() => setCancelId(null)}
        />
      )}
      {editId && (
        <EditPesananDialog
          pesanan={pesanan.find((p) => p.id === editId)!}
          products={products}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}

function PesananCard({
  pesanan,
  onOpenSettle,
  onCancel,
  onEdit,
}: {
  pesanan: PendingPesanan;
  onOpenSettle: () => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const fulfillmentLabel =
    pesanan.fulfillmentType === "dine_in" ? "🍽️ Dine-in" : "🥡 Take-away";
  const itemsLabel = pesanan.items
    .map((it) => {
      const parts = [it.productName];
      if (it.variantName) parts.push(it.variantName);
      const sugar = sugarLevelLabel(it.sugarLevel);
      if (sugar) parts.push(sugar);
      return `${it.qty}× ${parts.join(" ")}`;
    })
    .join(" · ");
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--foreground)]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {timeAgo(pesanan.pendingAt)}
          </p>
          <h3 className="mt-0.5 text-lg sm:text-xl font-bold text-foreground">
            {pesanan.customerName ?? "Tanpa nama"}
          </h3>
          {pesanan.fulfillmentType && (
            <span className="inline-flex items-center mt-1 rounded-full bg-muted/60 border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              {fulfillmentLabel}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Total
          </p>
          <p className="text-lg sm:text-xl font-bold tabular-nums text-foreground">
            {formatRp(pesanan.total)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground truncate">{itemsLabel}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <button
          type="button"
          onClick={onOpenSettle}
          className="h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={14} />
          Selesaikan pembayaran
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="h-10 px-3 rounded-xl border border-border bg-card text-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-muted"
          title="Edit isi pesanan — ubah qty, tambah/hapus item."
          aria-label="Edit pesanan"
        >
          <Pencil size={14} />
          Edit
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-3 rounded-xl border border-destructive/40 bg-card text-destructive text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-destructive/10"
          title="Batalkan pesanan — stok kembali, tidak ada cashflow event."
          aria-label="Batalkan pesanan"
        >
          <Trash2 size={14} />
          Batal
        </button>
      </div>
    </div>
  );
}

function CancelPesananDialog({
  pesanan,
  authorizers,
  onClose,
}: {
  pesanan: PendingPesanan;
  authorizers: PosAuthorizerRef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reasonOk = reason.trim().length >= 3;
  const canSubmit = reasonOk && !pending;

  /** Tombol "Batalkan": minta PIN dulu kalau outlet punya authorizer. */
  function start() {
    if (!canSubmit) return;
    if (authorizers.length > 0) {
      setPinError(null);
      setPinOpen(true);
      return;
    }
    submit();
  }

  function submit(pin?: string) {
    if (!reasonOk) return;
    startTransition(async () => {
      const res = await cancelPesanan({
        saleId: pesanan.id,
        reason: reason.trim(),
        pin,
      });
      if (!res.ok) {
        // PIN salah tetap di modal PIN; kegagalan lain jadi toast.
        if (pin !== undefined) setPinError(res.error);
        else toast.error(res.error ?? "Gagal membatalkan pesanan");
        return;
      }
      toast.success(
        `Pesanan ${pesanan.customerName ?? ""} dibatalkan — stok dipulihkan.`
      );
      setPinOpen(false);
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => !pending && !pinOpen && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold">
            Batalkan pesanan
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">
            {pesanan.customerName ?? "Tanpa nama"} ·{" "}
            {formatRp(pesanan.total)}
          </h2>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Stok produk akan dipulihkan. Tidak ada cashflow event yang
            dibatalkan karena pesanan ini belum dibayar. Aksi ini tidak
            bisa di-undo.
          </p>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">
            Alasan pembatalan <span className="text-destructive">*</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="mis. salah input menu, pembeli batal"
            className="mt-1 w-full rounded-lg border-2 border-foreground bg-card px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        {/* Siapa yang akan tercatat — dinyatakan sebelum tombol ditekan,
            bukan setelahnya. Sama seperti VoidSaleButton. */}
        {authorizers.length > 0 ? (
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Tercatat atas nama pemilik PIN yang dimasukkan di langkah
            berikutnya
            {authorizerNames(authorizers).length > 0
              ? ` (${authorizerNames(authorizers).join(", ")})`
              : ""}
            .
          </p>
        ) : (
          <p className="text-[11.5px] leading-relaxed rounded-lg bg-pop-amber/20 border border-pop-amber/50 px-2.5 py-2">
            Outlet ini belum punya penanggung jawab pembatalan, jadi tidak
            ada PIN yang diminta dan{" "}
            <strong>tidak ada nama yang tercatat</strong>. Minta admin
            mengaturnya di Otorisasi POS.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-10 rounded-xl border-2 border-foreground bg-card text-foreground font-semibold hover:bg-muted disabled:opacity-50"
          >
            Tidak jadi
          </button>
          <button
            type="button"
            onClick={start}
            disabled={!canSubmit}
            className="h-10 rounded-xl bg-destructive text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Batalkan
          </button>
        </div>
      </div>

      <PosPinAuthDialog
        open={pinOpen}
        authorizerNames={authorizerNames(authorizers)}
        operationLabel={POS_OPERATION_LABEL_ID.sale_void}
        preview={`Batalkan pesanan ${formatRp(pesanan.total)}${
          pesanan.customerName ? ` · ${pesanan.customerName}` : ""
        } — ${reason.trim()}`}
        pending={pending}
        error={pinError}
        onSubmit={(pin) => submit(pin)}
        onClose={() => {
          if (!pending) {
            setPinOpen(false);
            setPinError(null);
          }
        }}
      />
    </div>
  );
}

/** Satu baris di dialog edit — existing (itemId terisi) atau baru
 *  (itemId null, belum tersimpan). */
interface EditLine {
  key: string;
  itemId: string | null;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sugarLevel: string | null;
  unitPrice: number;
  qty: number;
}

/**
 * Edit isi pesanan pending — qty/hapus baris lama, tambah baris katalog
 * baru. Lihat cakupan v1 di doc comment `updatePesananItems`
 * (pos-pesanan.actions.ts): baris lama cuma qty yang bisa berubah, baris
 * baru cuma produk katalog biasa (tanpa custom/open-price).
 */
function EditPesananDialog({
  pesanan,
  products,
  onClose,
}: {
  pesanan: PendingPesanan;
  products: PosProduct[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customerName, setCustomerName] = useState(pesanan.customerName ?? "");
  const [lines, setLines] = useState<EditLine[]>(() =>
    pesanan.items.map((it) => ({
      key: it.id,
      itemId: it.id,
      productId: it.productId,
      variantId: it.variantId,
      productName: it.productName,
      variantName: it.variantName,
      sugarLevel: it.sugarLevel,
      unitPrice: it.unitPrice,
      qty: it.qty,
    }))
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const canSubmit = lines.length > 0 && customerName.trim().length > 0 && !pending;

  function setQty(key: string, qty: number) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)));
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }
  function addLine(picked: {
    product: PosProduct;
    variant: PosProductVariant | null;
    sugarLevel: SugarLevel | null;
  }) {
    const { product, variant, sugarLevel } = picked;
    setLines((ls) => [
      ...ls,
      {
        // crypto.randomUUID(), bukan counter closure — counter `let`
        // biasa reset tiap render, jadi menambah produk yang sama dua
        // kali berturut-turut akan menghasilkan React key dobel (dua
        // baris berbeda "dianggap sama" oleh React, qty stepper salah
        // sasaran).
        key: crypto.randomUUID(),
        itemId: null,
        productId: product.id,
        variantId: variant?.id ?? null,
        productName: product.name,
        variantName: variant?.name ?? null,
        sugarLevel,
        unitPrice: variant ? variant.price : product.price,
        qty: 1,
      },
    ]);
    setPickerOpen(false);
  }

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const keepItems = lines
        .filter((l) => l.itemId)
        .map((l) => ({ itemId: l.itemId!, qty: l.qty }));
      const newItems = lines
        .filter((l) => !l.itemId)
        .map((l) => ({
          productId: l.productId!,
          variantId: l.variantId,
          qty: l.qty,
          sugarLevel: isSugarLevel(l.sugarLevel) ? l.sugarLevel : null,
        }));
      const trimmedName = customerName.trim();
      const res = await updatePesananItems({
        saleId: pesanan.id,
        keepItems,
        newItems,
        customerName:
          trimmedName !== (pesanan.customerName ?? "") ? trimmedName : undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menyimpan perubahan");
        return;
      }
      toast.success("Pesanan diperbarui.");
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => !pending && !pickerOpen && onClose()}
    >
      <div
        className="w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2.5 border-b-2 border-foreground/10 shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Edit pesanan
            </p>
            <h2 className="text-lg font-bold text-foreground">
              {pesanan.customerName ?? "Tanpa nama"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="size-8 inline-flex items-center justify-center rounded-full border-2 border-foreground bg-card disabled:opacity-40"
            aria-label="Tutup"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-foreground">
              Nama pemesan <span className="text-destructive">*</span>
            </span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full h-9 rounded-lg border-2 border-foreground bg-card px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          <div className="space-y-2">
            {lines.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Belum ada item — tambah dulu di bawah.
              </p>
            )}
            {lines.map((l) => (
              <div
                key={l.key}
                className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {l.productName}
                    {l.variantName ? ` — ${l.variantName}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRp(l.unitPrice)}
                    {sugarLevelLabel(l.sugarLevel)
                      ? ` · ${sugarLevelLabel(l.sugarLevel)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setQty(l.key, l.qty - 1)}
                    disabled={pending}
                    aria-label="Kurangi"
                    className="size-7 rounded-full border border-border bg-card inline-flex items-center justify-center hover:bg-muted disabled:opacity-40"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {l.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(l.key, l.qty + 1)}
                    disabled={pending}
                    aria-label="Tambah"
                    className="size-7 rounded-full border border-border bg-card inline-flex items-center justify-center hover:bg-muted disabled:opacity-40"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(l.key)}
                  disabled={pending}
                  aria-label="Hapus item"
                  className="size-7 rounded-full inline-flex items-center justify-center text-destructive hover:bg-destructive/10 disabled:opacity-40"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={pending}
            className="w-full h-10 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground inline-flex items-center justify-center gap-1.5 hover:border-foreground hover:text-foreground disabled:opacity-40"
          >
            <Plus size={14} />
            Tambah produk
          </button>
        </div>

        <div className="px-5 py-3 border-t-2 border-foreground/10 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total
            </span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {formatRp(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Simpan perubahan
          </button>
        </div>
      </div>

      {pickerOpen && (
        <ProductPickerSheet
          products={products}
          onPick={addLine}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/** Sheet pemilih produk untuk "+ Tambah produk" di EditPesananDialog.
 *  HANYA katalog biasa — produk open-price disaring keluar (v1 edit
 *  tidak mendukung harga manual), match aturan server. */
function ProductPickerSheet({
  products,
  onPick,
  onClose,
}: {
  products: PosProduct[];
  onPick: (picked: {
    product: PosProduct;
    variant: PosProductVariant | null;
    sugarLevel: SugarLevel | null;
  }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<
    | { kind: "list" }
    | { kind: "variant"; product: PosProduct }
    | { kind: "sugar"; product: PosProduct; variant: PosProductVariant | null }
  >({ kind: "list" });

  const filtered = products.filter(
    (p) => !p.isOpenPrice && p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  function pickProduct(p: PosProduct) {
    if (p.variants.length > 0) {
      setStep({ kind: "variant", product: p });
      return;
    }
    if (p.requiresSugarLevel) {
      setStep({ kind: "sugar", product: p, variant: null });
      return;
    }
    onPick({ product: p, variant: null, sugarLevel: null });
  }
  function pickVariant(p: PosProduct, v: PosProductVariant) {
    if (v.requiresSugarLevel) {
      setStep({ kind: "sugar", product: p, variant: v });
      return;
    }
    onPick({ product: p, variant: v, sugarLevel: null });
  }
  function pickSugar(level: SugarLevel) {
    if (step.kind !== "sugar") return;
    onPick({ product: step.product, variant: step.variant, sugarLevel: level });
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[80vh] flex flex-col rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b-2 border-foreground/10 shrink-0">
          <span className="font-display text-base font-bold">
            {step.kind === "list"
              ? "Pilih produk"
              : step.kind === "variant"
                ? step.product.name
                : "Tingkat gula"}
          </span>
          <button
            type="button"
            onClick={step.kind === "list" ? onClose : () => setStep({ kind: "list" })}
            className="size-8 flex items-center justify-center rounded-full border-2 border-foreground bg-card"
            aria-label={step.kind === "list" ? "Tutup" : "Kembali"}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {step.kind === "list" && (
          <>
            <div className="px-4 pt-3 shrink-0">
              <div className="flex items-center gap-2 rounded-lg border-2 border-foreground bg-card px-2.5 h-9">
                <Search size={14} className="text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari produk…"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Tidak ada produk cocok.
                </p>
              )}
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="text-sm font-medium text-foreground truncate">
                    {p.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {p.variants.length > 0 ? "pilih varian" : formatRp(p.price)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step.kind === "variant" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
            {step.product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => pickVariant(step.product, v)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted"
              >
                <span className="text-sm font-medium text-foreground truncate">
                  {v.name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {formatRp(v.price)}
                </span>
              </button>
            ))}
          </div>
        )}

        {step.kind === "sugar" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 grid grid-cols-1 gap-1.5">
            {SUGAR_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => pickSugar(lvl)}
                className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted"
              >
                {sugarLevelLabel(lvl)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SettlePesananDialog({
  pesanan,
  onClose,
}: {
  pesanan: PendingPesanan;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"cash" | "qris" | "admin">("cash");
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [qrisReceipt, setQrisReceipt] = useState<File | null>(null);

  const total = pesanan.total;
  const submitDisabled =
    pending ||
    (mode === "cash" && (cashReceived == null || cashReceived < total)) ||
    (mode === "qris" && QRIS_RECEIPT_AT_CHECKOUT && !qrisReceipt);

  function handleSubmit() {
    startTransition(async () => {
      const res = await settlePesanan({
        saleId: pesanan.id,
        settledVia: mode,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menyelesaikan pesanan");
        return;
      }
      if (mode === "qris" && qrisReceipt && QRIS_RECEIPT_AT_CHECKOUT) {
        const form = new FormData();
        form.set("saleId", pesanan.id);
        form.set("file", qrisReceipt);
        const att = await attachPosQrisReceipt(form);
        if (!att.ok) {
          toast.error(`Tersimpan tapi foto gagal upload: ${att.error}`);
          onClose();
          router.refresh();
          return;
        }
      }
      const label =
        mode === "cash" ? "Cash" : mode === "qris" ? "QRIS" : "via Admin";
      toast.success(
        `Pesanan ${pesanan.customerName ?? ""} selesai — ${label} ${formatRp(total)}`
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Selesaikan pesanan
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-foreground">
              {pesanan.customerName ?? "Tanpa nama"} · {formatRp(total)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            className="size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-muted/40 border border-border">
          {(
            [
              { id: "cash", label: "Cash", icon: Receipt },
              { id: "qris", label: "QRIS", icon: Camera },
              { id: "admin", label: "via Admin", icon: MessageCircle },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`h-10 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors ${
                  active
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            );
          })}
        </div>

        {mode === "cash" && (
          <CashSettleField
            total={total}
            value={cashReceived}
            onChange={setCashReceived}
          />
        )}
        {mode === "qris" && QRIS_RECEIPT_AT_CHECKOUT && (
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">
              Foto nota QRIS dari customer{" "}
              <span className="text-destructive">*</span>
            </p>
            <label
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition ${
                qrisReceipt
                  ? "border-success/50 bg-success/10"
                  : "border-dashed border-border bg-muted/30 hover:bg-muted"
              } ${pending ? "opacity-50 pointer-events-none" : ""}`}
            >
              <input
                type="file"
                // `image/*` (bukan daftar subtipe) supaya Chrome Android
                // menawarkan Kamera, bukan galeri saja — lihat
                // lib/pos/receipt-file.ts. Tipe asli divalidasi di bawah.
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  const err = f ? validateReceiptImage(f) : null;
                  if (err) {
                    toast.error(err);
                    e.target.value = "";
                    return;
                  }
                  if (!f) {
                    setQrisReceipt(null);
                    return;
                  }
                  // Kompres sekarang, bukan saat submit — lihat
                  // lib/pos/receipt-upload.ts.
                  void compressReceiptFile(f).then(setQrisReceipt);
                }}
              />
              <Camera size={16} className="text-foreground shrink-0" />
              <span className="text-sm text-foreground truncate flex-1">
                {qrisReceipt ? qrisReceipt.name : "Ambil foto / pilih gambar"}
              </span>
              {qrisReceipt && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setQrisReceipt(null);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Hapus foto"
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
        )}
        {mode === "admin" && (
          <div className="rounded-xl border border-dashed border-pop-amber/50 bg-pop-amber/10 px-3 py-2.5 text-xs text-foreground">
            <p className="font-medium">Pembayaran via WhatsApp ke admin</p>
            <p className="mt-0.5 text-muted-foreground">
              Pastikan admin sudah menerima pembayaran sebelum
              menandai selesai. Catatan ini tidak menambah saldo Cash
              POS — uang masuk via rekening admin.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={submitDisabled}
          onClick={handleSubmit}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Konfirmasi {formatRp(total)}
        </button>
      </div>
    </div>
  );
}

/** Mini cash-received field — versi ringkas untuk settle dialog. */
function CashSettleField({
  total,
  value,
  onChange,
}: {
  total: number;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const change = value == null ? null : value - total;
  const quick = [50000, 100000, 200000];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
      <label className="block">
        <span className="text-xs font-medium text-foreground">
          Uang diterima
        </span>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <span className="text-sm font-semibold text-muted-foreground">Rp</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value == null ? "" : value.toLocaleString("id-ID")}
            placeholder="0"
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              if (digits === "") {
                onChange(null);
                return;
              }
              const n = Number(digits);
              onChange(Number.isFinite(n) ? n : null);
            }}
            className="flex-1 bg-transparent text-sm font-semibold tabular-nums focus:outline-none"
          />
        </div>
      </label>
      <div className="flex flex-wrap gap-1">
        {quick.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => onChange(amt)}
            className="text-[11px] px-2 py-1 rounded-md border border-border bg-card hover:bg-muted tabular-nums"
          >
            +{formatRp(amt)}
          </button>
        ))}
      </div>
      {change != null && (
        <p
          className={`text-xs font-semibold tabular-nums ${
            change < 0 ? "text-destructive" : "text-success"
          }`}
        >
          Kembalian: {formatRp(Math.max(0, change))}
          {change < 0 && (
            <span className="ml-2 text-destructive">
              (kurang {formatRp(-change)})
            </span>
          )}
        </p>
      )}
    </div>
  );
}
