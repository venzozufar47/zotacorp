"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { parseDecimalId } from "@/components/admin/costing/fields";
import { formatRp } from "@/lib/cashflow/format";
import { cn } from "@/lib/utils";
import { confirmArrival, undoArrival, type OrderRow, type OrdersData } from "@/lib/actions/procurement-orders.actions";

/**
 * Pesanan bahan: yang belum tiba (dengan perkiraan tiba & penanda telat) dan yang sudah tiba 14 hari terakhir.
 * Dirancang untuk HP: kartu satu kolom, tombol aksi setinggi 48 px lebar penuh, konfirmasi lewat bottom sheet.
 */

const fmtDate = (ymd: string | null) =>
  ymd
    ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    : "—";
const fmtQty = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

export function OrdersPanel({ businessUnit, data }: { businessUnit: string; data: OrdersData }) {
  const router = useRouter();
  const [tab, setTab] = useState<"jalan" | "tiba">("jalan");
  const [sel, setSel] = useState<OrderRow | null>(null);
  const late = data.inTransit.filter((o) => o.lateDays > 0).length;

  return (
    <div className="space-y-3" data-bu={businessUnit}>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="tablist" aria-label="Status pesanan">
        {(
          [
            { key: "jalan", label: "Dalam perjalanan", n: data.inTransit.length },
            { key: "tiba", label: "Sudah tiba", n: data.arrived.length },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "min-h-11 rounded-lg px-2 text-[13px] font-semibold transition",
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {t.label} <span className="tabular-nums">({t.n})</span>
          </button>
        ))}
      </div>

      {tab === "jalan" && late > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-warning/60 bg-warning/15 px-3 py-2 text-[13px] font-semibold" role="status">
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          {late} pesanan telat dari perkiraan. Cek ke penjual atau perbarui saat barang tiba.
        </p>
      )}

      {tab === "jalan" ? (
        data.inTransit.length === 0 ? (
          <Empty icon={<Truck size={28} aria-hidden />} title="Tidak ada pesanan di jalan" hint='Catat belanja dengan pilihan "Dipesan, belum tiba" untuk melacak kedatangannya di sini.' />
        ) : (
          <ul className="space-y-2">
            {data.inTransit.map((o) => (
              <li key={o.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">{o.materialName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {fmtQty(o.qtyPurchaseUnits)} {o.purchaseUnit}
                      {o.totalPaid != null ? ` · ${formatRp(o.totalPaid)}` : ""}
                      {o.supplier ? ` · ${o.supplier}` : ""}
                    </p>
                  </div>
                  {o.lateDays > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
                      <AlertTriangle size={11} aria-hidden /> Telat {o.lateDays} hari kerja
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      <Truck size={11} aria-hidden /> Di jalan
                    </span>
                  )}
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock size={12} aria-hidden />
                  Dipesan {fmtDate(o.orderedDate)} · Perkiraan tiba {fmtDate(o.expectedAt)}
                  <span className="opacity-70"> (Minggu libur)</span>
                </p>
                <Button type="button" size="lg" className="mt-2.5 h-12 w-full" onClick={() => setSel(o)}>
                  <PackageCheck aria-hidden /> Barang tiba
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : data.arrived.length === 0 ? (
        <Empty icon={<CheckCircle2 size={28} aria-hidden />} title="Belum ada pesanan tiba" hint="Pesanan yang sudah dikonfirmasi tiba dalam 14 hari terakhir muncul di sini." />
      ) : (
        <ul className="space-y-2">
          {data.arrived.map((o) => (
            <ArrivedCard key={o.id} o={o} onUndone={() => router.refresh()} />
          ))}
        </ul>
      )}

      <ArrivalSheet
        order={sel}
        onClose={() => setSel(null)}
        onDone={(res) => {
          setSel(null);
          router.refresh();
          toast.success(res.partial ? "Tiba sebagian, sisanya tetap di jalan" : "Barang tiba, stok bertambah", {
            action: { label: "Urungkan", onClick: () => void undoArrival(res.id).then(() => router.refresh()) },
            duration: 8000,
          });
        }}
      />
    </div>
  );
}

function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="grid place-items-center gap-1.5 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-muted-foreground">
      {icon}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed">{hint}</p>
    </div>
  );
}

function ArrivedCard({ o, onUndone }: { o: OrderRow; onUndone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-start justify-between gap-2 rounded-2xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight">{o.materialName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {fmtQty(o.qtyPurchaseUnits)} {o.purchaseUnit} · tiba {o.arrivedAt ? fmtDate(o.arrivedAt.slice(0, 10)) : "—"}
        </p>
      </div>
      {o.undoable && (
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await undoArrival(o.id);
              if (!r.ok) toast.error(r.error);
              else onUndone();
            })
          }
        >
          Urungkan
        </Button>
      )}
    </li>
  );
}

function ArrivalSheet({
  order,
  onClose,
  onDone,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onDone: (res: { id: string; partial: boolean }) => void;
}) {
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-b-2xl"
      >
        {order && <ArrivalForm key={order.id} order={order} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function ArrivalForm({
  order,
  onClose,
  onDone,
}: {
  order: OrderRow;
  onClose: () => void;
  onDone: (res: { id: string; partial: boolean }) => void;
}) {
  const [qty, setQty] = useState(String(order.qtyPurchaseUnits).replace(".", ","));
  const [saving, start] = useTransition();
  const parsed = parseDecimalId(qty) ?? 0;
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= order.qtyPurchaseUnits + 1e-9;
  const partial = valid && parsed < order.qtyPurchaseUnits - 1e-9;
  return (
    <div className="space-y-3">
      <div>
        <DialogTitle className="font-display text-base font-extrabold">Barang tiba</DialogTitle>
        <DialogDescription className="mt-0.5 text-xs">
          {order.materialName} · dipesan {fmtQty(order.qtyPurchaseUnits)} {order.purchaseUnit}
        </DialogDescription>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-muted-foreground">Jumlah yang tiba ({order.purchaseUnit})</span>
        <input
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-invalid={!valid}
          className="h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-lg font-bold tabular-nums outline-none focus:border-foreground"
        />
      </label>
      {!valid && <p className="text-xs text-destructive">Isi jumlah lebih dari 0 dan tidak melebihi pesanan.</p>}
      {partial && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Tiba sebagian: {fmtQty(order.qtyPurchaseUnits - parsed)} {order.purchaseUnit} sisanya tetap tercatat di jalan.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button type="button" variant="outline" size="lg" className="h-12" onClick={onClose} disabled={saving}>
          Batal
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-12"
          disabled={!valid || saving}
          onClick={() =>
            start(async () => {
              const r = await confirmArrival({ receiptId: order.id, qtyPurchaseUnits: parsed });
              if (!r.ok) toast.error(r.error);
              else onDone({ id: order.id, partial: r.data?.partial ?? false });
            })
          }
        >
          {saving ? "Menyimpan…" : partial ? "Simpan tiba sebagian" : "Konfirmasi tiba"}
        </Button>
      </div>
    </div>
  );
}
