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
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import {
  cancelPesanan,
  settlePesanan,
} from "@/lib/actions/pos-pesanan.actions";
import { attachPosQrisReceipt } from "@/lib/actions/pos-receipt.actions";
import { formatRp } from "@/lib/cashflow/format";
import { QRIS_RECEIPT_AT_CHECKOUT } from "@/lib/pos/flags";
import type { PendingPesanan } from "@/lib/actions/pos-pesanan.actions";

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

export function PesananList({ pesanan }: { pesanan: PendingPesanan[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
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
          onClose={() => setCancelId(null)}
        />
      )}
    </div>
  );
}

function PesananCard({
  pesanan,
  onOpenSettle,
  onCancel,
}: {
  pesanan: PendingPesanan;
  onOpenSettle: () => void;
  onCancel: () => void;
}) {
  const fulfillmentLabel =
    pesanan.fulfillmentType === "dine_in" ? "🍽️ Dine-in" : "🥡 Take-away";
  const itemsLabel = pesanan.items
    .map((it) => {
      const name = it.variantName
        ? `${it.productName} ${it.variantName}`
        : it.productName;
      return `${it.qty}× ${name}`;
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
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
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
  onClose,
}: {
  pesanan: PendingPesanan;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function handleConfirm() {
    startTransition(async () => {
      const res = await cancelPesanan({ saleId: pesanan.id });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal membatalkan pesanan");
        return;
      }
      toast.success(
        `Pesanan ${pesanan.customerName ?? ""} dibatalkan — stok dipulihkan.`
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
            onClick={handleConfirm}
            disabled={pending}
            className="h-10 rounded-xl bg-destructive text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Batalkan
          </button>
        </div>
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
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 5 * 1024 * 1024) {
                    toast.error("Foto maksimal 5MB");
                    e.target.value = "";
                    return;
                  }
                  setQrisReceipt(f);
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
