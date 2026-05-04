"use client";

import { PosNavLink } from "./PosNavLink";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { formatRp } from "@/lib/cashflow/format";
import type {
  ExcludedStockProduct,
  PosAuthorizerInfo,
  StockMovementRow,
  StockOnHand,
  StockOpnameSummary,
} from "@/lib/actions/pos-stock.actions";
import {
  deleteStockMovement,
  setProductStockTracking,
} from "@/lib/actions/pos-stock.actions";
import type { PosProduct } from "@/lib/actions/pos.actions";
import { StockMovementDialog } from "./StockMovementDialog";

type Tab = "on-hand" | "produksi" | "penarikan" | "opname";

interface Props {
  bankAccountId: string;
  accountName: string;
  onHand: StockOnHand[];
  movements: StockMovementRow[];
  opnames: StockOpnameSummary[];
  products: PosProduct[];
  excluded: ExcludedStockProduct[];
  authorizers: PosAuthorizerInfo;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "on-hand", label: "On-hand" },
  { id: "produksi", label: "Produksi" },
  { id: "penarikan", label: "Penarikan" },
  { id: "opname", label: "Opname" },
];

export function StockLandingClient({
  bankAccountId,
  accountName,
  onHand,
  movements,
  opnames,
  products,
  excluded,
  authorizers,
}: Props) {
  const [tab, setTab] = useState<Tab>("on-hand");
  const [dialog, setDialog] = useState<"production" | "withdrawal" | null>(null);

  const produksi = movements.filter((m) => m.type === "production");
  const penarikan = movements.filter((m) => m.type === "withdrawal");

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <header>
        <PosNavLink
          href="/pos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={12} /> Kembali ke POS
        </PosNavLink>
        <h1 className="font-semibold text-foreground flex items-center gap-2">
          <Boxes size={16} /> Stok
        </h1>
        <p className="text-xs text-muted-foreground">{accountName}</p>
      </header>

      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "on-hand" && <OnHandPanel rows={onHand} excluded={excluded} />}

      {tab === "produksi" && (
        <MovementPanel
          bankAccountId={bankAccountId}
          rows={produksi}
          type="production"
          onAdd={() => setDialog("production")}
        />
      )}

      {tab === "penarikan" && (
        <MovementPanel
          bankAccountId={bankAccountId}
          rows={penarikan}
          type="withdrawal"
          onAdd={() => setDialog("withdrawal")}
        />
      )}

      {tab === "opname" && <OpnamePanel rows={opnames} />}

      {dialog !== null && (
        <StockMovementDialog
          bankAccountId={bankAccountId}
          products={products}
          type={dialog}
          authorizer={
            dialog === "production"
              ? authorizers.production
              : authorizers.withdrawal
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function skuLabel(productName: string, variantName: string | null) {
  return variantName ? `${productName} · ${variantName}` : productName;
}

function OnHandPanel({
  rows,
  excluded,
}: {
  rows: StockOnHand[];
  excluded: ExcludedStockProduct[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmExclude, setConfirmExclude] = useState<{
    productId: string;
    productName: string;
  } | null>(null);

  const totalValue = rows.reduce((s, r) => s + r.onHand * r.unitPrice, 0);

  const runTracking = (productId: string, track: boolean, successMsg: string) => {
    startTransition(async () => {
      const res = await setProductStockTracking({ productId, track });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(successMsg);
      setConfirmExclude(null);
      router.refresh();
    });
  };

  if (rows.length === 0 && excluded.length === 0) {
    return <Empty text="Belum ada produk aktif." />;
  }

  // Group SKU per produk supaya tombol × hapus muncul di level produk
  // (backing store track_stock memang per-produk, bukan per-varian).
  const rowsByProduct = new Map<string, StockOnHand[]>();
  for (const r of rows) {
    const arr = rowsByProduct.get(r.productId) ?? [];
    arr.push(r);
    rowsByProduct.set(r.productId, arr);
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
        <p className="text-xs uppercase tracking-wider text-primary/80">
          Nilai stok sekarang
        </p>
        <p className="mt-1 text-2xl font-semibold text-primary tabular-nums">
          {formatRp(totalValue)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Baseline = opname terakhir + produksi − penarikan − sale.
        </p>
      </div>
      <div className="space-y-1.5">
        {Array.from(rowsByProduct.entries()).map(([productId, variants]) => {
          const productName = variants[0].productName;
          return (
            <div
              key={productId}
              className="rounded-xl border border-border bg-card"
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <p className="text-sm font-medium text-foreground truncate">
                  {productName}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setConfirmExclude({ productId, productName })
                  }
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  aria-label={`Hapus ${productName} dari stok`}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="divide-y divide-border">
                {variants.map((r) => (
                  <div
                    key={`${r.productId}-${r.variantId ?? "-"}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <p className="text-xs text-muted-foreground truncate">
                      {r.variantName ?? "(tanpa varian)"} ·{" "}
                      <span className="tabular-nums">
                        {formatRp(r.unitPrice)}
                      </span>
                    </p>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {r.onHand}
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {formatRp(r.onHand * r.unitPrice)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {excluded.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Dikecualikan dari stok ({excluded.length})
          </p>
          {excluded.map((p) => (
            <div
              key={p.productId}
              className="flex items-center justify-between gap-2 rounded-lg bg-card border border-border px-3 py-2"
            >
              <p className="text-xs text-muted-foreground truncate">
                {p.productName}
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runTracking(p.productId, true, "Produk dimasukkan kembali")
                }
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <RotateCcw size={10} /> Masukkan lagi
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmExclude && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !pending && setConfirmExclude(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 space-y-3"
          >
            <h2 className="text-base font-semibold text-foreground">
              Hapus dari stok?
            </h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {confirmExclude.productName}
              </span>{" "}
              tidak akan masuk on-hand, opname, produksi, atau penarikan lagi.
              Semua catatan stok lamanya (opname + movement) akan dihapus.
              Produk tetap bisa dijual di POS.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmExclude(null)}
                disabled={pending}
                className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runTracking(
                    confirmExclude.productId,
                    false,
                    "Produk dikecualikan dari stok"
                  )
                }
                className="flex-1 rounded-xl bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MovementPanel({
  bankAccountId,
  rows,
  type,
  onAdd,
}: {
  bankAccountId: string;
  rows: StockMovementRow[];
  type: "production" | "withdrawal";
  onAdd: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const label = type === "production" ? "Produksi" : "Penarikan";
  const sign = type === "production" ? "+" : "−";

  function handleDelete(movementId: string) {
    startTransition(async () => {
      const res = await deleteStockMovement({ bankAccountId, movementId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${label} dihapus.`);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onAdd}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90"
      >
        <Plus size={14} /> Tambah {label}
      </button>
      {rows.length === 0 ? (
        <Empty text={`Belum ada ${label.toLowerCase()}.`} />
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => {
            const confirming = confirmId === m.id;
            return (
              <div
                key={m.id}
                className="group/row rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground truncate">
                    {skuLabel(m.productName, m.variantName)}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {sign}
                      {m.qty}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        confirming ? handleDelete(m.id) : setConfirmId(m.id)
                      }
                      onBlur={() => setConfirmId(null)}
                      disabled={pending}
                      title={confirming ? "Klik lagi untuk konfirmasi" : "Hapus"}
                      className={`grid place-items-center size-7 rounded-full transition disabled:opacity-50 ${
                        confirming
                          ? "bg-destructive text-white"
                          : "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                      }`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    {m.movementDate}
                    {m.movementTime ? ` · ${m.movementTime}` : ""}
                  </span>
                  {m.notes && <span className="truncate italic">{m.notes}</span>}
                </div>
                {confirming && (
                  <p className="mt-1 text-[10px] text-destructive font-medium">
                    Klik X lagi untuk hapus
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OpnamePanel({ rows }: { rows: StockOpnameSummary[] }) {
  return (
    <div className="space-y-3">
      <PosNavLink
        href="/pos/stok/opname/new"
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90"
      >
        <Plus size={14} /> Opname Baru
      </PosNavLink>
      {rows.length === 0 ? (
        <Empty text="Belum ada opname." />
      ) : (
        <div className="space-y-1.5">
          {rows.map((o) => {
            const diffColor =
              o.totalDiffValue < 0
                ? "text-destructive"
                : o.totalDiffValue > 0
                ? "text-success"
                : "text-muted-foreground";
            return (
              <PosNavLink
                key={o.id}
                href={`/pos/stok/opname/${o.id}`}
                className="block rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    {o.opnameDate}
                    {o.opnameTime ? ` · ${o.opnameTime}` : ""}
                  </p>
                  <p
                    className={`text-sm font-semibold tabular-nums shrink-0 ${diffColor}`}
                  >
                    {o.totalDiffValue === 0
                      ? "—"
                      : (o.totalDiffValue > 0 ? "+" : "") + formatRp(o.totalDiffValue)}
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {o.itemCount} SKU · selisih qty {o.totalDiffQty > 0 ? "+" : ""}
                  {o.totalDiffQty}
                </p>
              </PosNavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
