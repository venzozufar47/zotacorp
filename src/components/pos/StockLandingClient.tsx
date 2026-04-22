"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Boxes, Plus } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import type {
  StockMovementRow,
  StockOnHand,
  StockOpnameSummary,
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
}: Props) {
  const [tab, setTab] = useState<Tab>("on-hand");
  const [dialog, setDialog] = useState<"production" | "withdrawal" | null>(null);

  const produksi = movements.filter((m) => m.type === "production");
  const penarikan = movements.filter((m) => m.type === "withdrawal");

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <header>
        <Link
          href="/pos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={12} /> Kembali ke POS
        </Link>
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

      {tab === "on-hand" && <OnHandPanel rows={onHand} />}

      {tab === "produksi" && (
        <MovementPanel
          rows={produksi}
          type="production"
          onAdd={() => setDialog("production")}
        />
      )}

      {tab === "penarikan" && (
        <MovementPanel
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
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function skuLabel(productName: string, variantName: string | null) {
  return variantName ? `${productName} · ${variantName}` : productName;
}

function OnHandPanel({ rows }: { rows: StockOnHand[] }) {
  const totalValue = rows.reduce((s, r) => s + r.onHand * r.unitPrice, 0);
  if (rows.length === 0) {
    return <Empty text="Belum ada produk aktif." />;
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
        {rows.map((r) => (
          <div
            key={`${r.productId}-${r.variantId ?? "-"}`}
            className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {skuLabel(r.productName, r.variantName)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {formatRp(r.unitPrice)} / unit
              </p>
            </div>
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
}

function MovementPanel({
  rows,
  type,
  onAdd,
}: {
  rows: StockMovementRow[];
  type: "production" | "withdrawal";
  onAdd: () => void;
}) {
  const label = type === "production" ? "Produksi" : "Penarikan";
  const sign = type === "production" ? "+" : "−";
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
          {rows.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground truncate">
                  {skuLabel(m.productName, m.variantName)}
                </p>
                <p className="text-sm font-semibold tabular-nums shrink-0">
                  {sign}
                  {m.qty}
                </p>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  {m.movementDate}
                  {m.movementTime ? ` · ${m.movementTime}` : ""}
                </span>
                {m.notes && <span className="truncate italic">{m.notes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OpnamePanel({ rows }: { rows: StockOpnameSummary[] }) {
  return (
    <div className="space-y-3">
      <Link
        href="/pos/stok/opname/new"
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90"
      >
        <Plus size={14} /> Opname Baru
      </Link>
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
              <Link
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
              </Link>
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
