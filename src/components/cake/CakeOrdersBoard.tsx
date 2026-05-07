"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  CalendarClock,
  Truck,
  Package,
  ChevronRight,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import {
  setCakeOrderArchived,
  setCakeOrderStatus,
} from "@/lib/actions/cake-orders.actions";
import { formatIDR } from "@/lib/cashflow/format";
import { makeLabelFor } from "@/lib/cake-orders/helpers";
import { CakeOrderDetailLoader } from "./CakeOrderDetailLoader";
import type {
  CakeOrder,
  CakeOptionsByKind,
  CakeOrderStatus,
} from "@/lib/cake-orders/types";

interface Props {
  orders: CakeOrder[];
  optionsByKind: CakeOptionsByKind | null;
  /** When true, dragging cards across columns triggers a status update.
   *  Defaults true; pass false for read-only views. */
  canMove?: boolean;
  /** Show "Arsipkan" on done cards. False when the lobby is already
   *  filtered to archived rows. */
  showArchiveButton?: boolean;
  /** Show "Kembalikan" on archived cards. */
  showUnarchiveButton?: boolean;
  /** When true, the detail loader uses the admin back-link copy. */
  isAdminView?: boolean;
}

interface Column {
  status: CakeOrderStatus;
  label: string;
  emoji: string;
  /** Tailwind class for the column header pill background. */
  cls: string;
}

const COLUMNS: Column[] = [
  { status: "submitted", label: "Baru", emoji: "🆕", cls: "bg-pop-pink/30" },
  {
    status: "in_progress",
    label: "Dikerjakan",
    emoji: "👨‍🍳",
    cls: "bg-tertiary/30",
  },
  { status: "ready", label: "Siap", emoji: "📦", cls: "bg-pop-emerald/30" },
  {
    status: "delivering",
    label: "Pengiriman",
    emoji: "🚚",
    cls: "bg-pop-pink/30",
  },
  { status: "done", label: "Selesai", emoji: "✅", cls: "bg-muted" },
];

/** Determine the next-step button shown on a card, or null if the
 *  current state has no quick action. Pickup orders skip the
 *  'delivering' state; delivery orders go through it.
 *
 *  NOTE: `submitted → in_progress` is INTENTIONALLY null here — that
 *  transition only happens automatically when admin sends the
 *  production slip (`sendSlip`). Kanban cards in "Baru" wait until
 *  the slip is verified + sent before moving to "Dikerjakan".
 */
function nextAction(
  order: CakeOrder,
  isPickup: boolean
): { label: string; target: CakeOrderStatus } | null {
  if (order.status === "in_progress")
    return { label: "Tandai siap", target: "ready" };
  if (order.status === "ready") {
    if (isPickup) return { label: "Sudah diambil", target: "done" };
    return { label: "Kirim sekarang", target: "delivering" };
  }
  if (order.status === "delivering")
    return { label: "Terkirim & diterima", target: "done" };
  return null;
}

/**
 * Kanban board grouped by `cake_orders.status`. Drag-and-drop on
 * desktop moves a card to a new status (calls `setCakeOrderStatus`).
 * Cancelled orders are hidden by default; toggle reveals them in a
 * collapsible footer row.
 */
export function CakeOrdersBoard({
  orders,
  optionsByKind,
  canMove = true,
  showArchiveButton = true,
  showUnarchiveButton = false,
  isAdminView = false,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showCancelled, setShowCancelled] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] =
    useState<CakeOrderStatus | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const labelFor = makeLabelFor(optionsByKind);

  const grouped = useMemo(() => {
    const map = new Map<CakeOrderStatus, CakeOrder[]>();
    for (const c of COLUMNS) map.set(c.status, []);
    map.set("cancelled", []);
    for (const o of orders) {
      const list = map.get(o.status) ?? [];
      list.push(o);
      map.set(o.status, list);
    }
    // Each column sorted by scheduled_at ascending (sooner first).
    for (const k of map.keys()) {
      map.set(
        k,
        (map.get(k) ?? []).slice().sort(
          (a, b) =>
            new Date(a.scheduled_at).getTime() -
            new Date(b.scheduled_at).getTime()
        )
      );
    }
    return map;
  }, [orders]);

  const cancelled = grouped.get("cancelled") ?? [];

  const moveTo = (orderId: string, target: CakeOrderStatus) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === target) return;
    startTransition(async () => {
      const res = await setCakeOrderStatus(orderId, target);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const targetLabel =
        COLUMNS.find((c) => c.status === target)?.label ?? target;
      toast.success(`Dipindah ke "${targetLabel}"`);
      router.refresh();
    });
  };

  const toggleArchive = (orderId: string, archive: boolean) => {
    startTransition(async () => {
      const res = await setCakeOrderArchived(orderId, archive);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(archive ? "Diarsipkan" : "Dikembalikan dari arsip");
      router.refresh();
    });
  };

  const closePanel = () => setSelectedOrderId(null);

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center">
        <Package
          size={28}
          strokeWidth={2}
          className="mx-auto text-muted-foreground"
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Belum ada order. Klik &quot;Pesanan baru&quot; untuk memulai.
        </p>
      </div>
    );
  }

  // Layout: kanban left, fixed-width detail panel right when something
  // is selected. On md/lg viewports the kanban grid auto-collapses to
  // fewer columns to make room. On mobile the panel becomes a
  // full-screen overlay (handled by class below).
  const panelOpen = selectedOrderId !== null;
  const gridCls = panelOpen
    ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3"
    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3";

  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 space-y-3">
        <div className={gridCls}>
          {COLUMNS.map((col) => {
          const list = grouped.get(col.status) ?? [];
          const isOver = dragOverStatus === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                if (!canMove || !draggingId) return;
                e.preventDefault();
                setDragOverStatus(col.status);
              }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => {
                if (!canMove || !draggingId) return;
                e.preventDefault();
                moveTo(draggingId, col.status);
                setDraggingId(null);
                setDragOverStatus(null);
              }}
              className={`rounded-2xl border-2 ${
                isOver ? "border-foreground" : "border-border"
              } bg-card p-2 space-y-2 min-h-[120px] transition-colors ${
                isOver ? "bg-muted/40" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <h2
                  className={`flex items-center gap-1.5 rounded-full ${col.cls} border border-foreground px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground`}
                >
                  <span aria-hidden>{col.emoji}</span>
                  <span>{col.label}</span>
                </h2>
                <span className="text-[11px] tabular-nums font-semibold text-muted-foreground">
                  {list.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {list.length === 0 ? (
                  <li className="text-[11px] italic text-muted-foreground px-1 py-2 text-center">
                    Kosong
                  </li>
                ) : (
                  list.map((o) => (
                    <Card
                      key={o.id}
                      order={o}
                      labelFor={labelFor}
                      canMove={canMove}
                      onMoveTo={moveTo}
                      onToggleArchive={toggleArchive}
                      onSelect={setSelectedOrderId}
                      isActive={selectedOrderId === o.id}
                      showArchiveButton={showArchiveButton}
                      showUnarchiveButton={showUnarchiveButton}
                      draggable={canMove}
                      onDragStart={() => setDraggingId(o.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverStatus(null);
                      }}
                    />
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </div>

        {cancelled.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowCancelled((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showCancelled ? "▾" : "▸"} Dibatalkan ({cancelled.length})
            </button>
            {showCancelled && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-2">
                <ul
                  className={
                    panelOpen
                      ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-1.5"
                      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-1.5"
                  }
                >
                  {cancelled.map((o) => (
                    <Card
                      key={o.id}
                      order={o}
                      labelFor={labelFor}
                      dimmed
                      canMove={canMove}
                      onMoveTo={moveTo}
                      onSelect={setSelectedOrderId}
                      draggable={canMove}
                      onDragStart={() => setDraggingId(o.id)}
                      onDragEnd={() => setDraggingId(null)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedOrderId && (
        <aside
          className="hidden md:block w-[440px] xl:w-[520px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border-2 border-foreground bg-card shadow-lg p-3"
        >
          <CakeOrderDetailLoader
            orderId={selectedOrderId}
            optionsByKind={optionsByKind}
            isAdminView={isAdminView}
            canEdit={canMove}
            onClose={closePanel}
          />
        </aside>
      )}

      {selectedOrderId && (
        <div
          className="fixed inset-0 z-40 bg-background md:hidden overflow-y-auto p-3"
          role="dialog"
          aria-modal="true"
        >
          <CakeOrderDetailLoader
            orderId={selectedOrderId}
            optionsByKind={optionsByKind}
            isAdminView={isAdminView}
            canEdit={canMove}
            onClose={closePanel}
          />
        </div>
      )}
    </div>
  );
}

function Card({
  order,
  labelFor,
  draggable,
  onDragStart,
  onDragEnd,
  canMove,
  onMoveTo,
  onToggleArchive,
  onSelect,
  isActive,
  showArchiveButton,
  showUnarchiveButton,
  dimmed,
}: {
  order: CakeOrder;
  labelFor: (kind: keyof CakeOptionsByKind, id: string | null) => string;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  canMove?: boolean;
  onMoveTo?: (orderId: string, target: CakeOrderStatus) => void;
  onToggleArchive?: (orderId: string, archive: boolean) => void;
  onSelect?: (orderId: string) => void;
  isActive?: boolean;
  showArchiveButton?: boolean;
  showUnarchiveButton?: boolean;
  dimmed?: boolean;
}) {
  const dt = new Date(order.scheduled_at);
  const dateLabel = isToday(dt)
    ? `Hari ini · ${format(dt, "HH:mm", { locale: idLocale })}`
    : isTomorrow(dt)
      ? `Besok · ${format(dt, "HH:mm", { locale: idLocale })}`
      : format(dt, "EEE, d MMM · HH:mm", { locale: idLocale });

  // Pickup detection: if delivery option is "Pickup" the lifecycle
  // skips the 'delivering' column. We rely on the option label since
  // the option id varies per environment.
  const deliveryLabel = labelFor("delivery", order.delivery_option_id);
  const isPickup = deliveryLabel.toLowerCase().includes("pickup");
  const next = nextAction(order, isPickup);

  return (
    <li
      className={`rounded-xl border-2 ${
        isActive ? "border-primary ring-2 ring-primary/30" : "border-foreground"
      } bg-card p-2.5 hover:bg-muted/30 transition-colors space-y-1.5 ${
        dimmed ? "opacity-60" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        onClick={() => onSelect?.(order.id)}
        className="block w-full text-left space-y-1.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-foreground truncate">
              {order.customer_name}
            </div>
            {order.customer_phone && (
              <div className="text-[10px] text-muted-foreground truncate">
                📱 {order.customer_phone}
              </div>
            )}
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-foreground shrink-0">
            Rp {formatIDR(order.total_idr)}
          </span>
        </div>

        <div className="text-[11px] text-muted-foreground truncate">
          {labelFor("base_cake", order.base_cake_option_id)}
          {" · "}
          {labelFor("shape", order.shape_option_id)}
          {order.shape_custom ? ` (${order.shape_custom})` : ""}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CalendarClock size={10} className="shrink-0" />
            {dateLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Truck size={10} className="shrink-0" />
            {deliveryLabel}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          <PaymentChip order={order} />
          <ProductionChip status={order.production_status} />
        </div>
      </button>

      {next && canMove && onMoveTo && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMoveTo(order.id, next.target);
          }}
          className="w-full flex items-center justify-center gap-1 rounded-lg bg-foreground/90 text-background px-2 py-1 text-[11px] font-medium hover:opacity-90 active:scale-95 transition-transform"
        >
          {next.label}
          <ChevronRight size={11} strokeWidth={2.5} />
        </button>
      )}

      {/* Archive on done; restore on archived. The two buttons are
          mutually exclusive — page passes whichever applies. */}
      {order.status === "done" &&
        showArchiveButton &&
        !order.archived_at &&
        onToggleArchive && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleArchive(order.id, true);
            }}
            className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
          >
            <Archive size={10} strokeWidth={2.5} />
            Arsipkan
          </button>
        )}
      {showUnarchiveButton && order.archived_at && onToggleArchive && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleArchive(order.id, false);
          }}
          className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
        >
          <ArchiveRestore size={10} strokeWidth={2.5} />
          Kembalikan
        </button>
      )}
    </li>
  );
}

function PaymentChip({ order }: { order: CakeOrder }) {
  // 5 visual states: refunded > partial_refund > paid > DP > unpaid.
  // We show the actual paid amount when DP is recorded so the kanban
  // tells the cake-input employee "Bu Tasya sudah DP Rp 50k" without
  // opening the side panel.
  const { payment_status, paid_idr, total_idr } = order;
  const formatRp = (n: number) => {
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
    if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  };
  if (payment_status === "refunded") {
    return (
      <span className="inline-block rounded-full border border-foreground bg-destructive/20 px-1.5 py-0 text-[10px] font-medium text-foreground">
        Refund
      </span>
    );
  }
  if (payment_status === "partial_refund") {
    return (
      <span className="inline-block rounded-full border border-foreground bg-pop-pink/20 px-1.5 py-0 text-[10px] font-medium text-foreground">
        Refund sebagian
      </span>
    );
  }
  if (payment_status === "paid") {
    return (
      <span className="inline-block rounded-full border border-foreground bg-pop-emerald/30 px-1.5 py-0 text-[10px] font-medium text-foreground">
        ● Lunas
      </span>
    );
  }
  if (paid_idr > 0 && paid_idr < total_idr) {
    return (
      <span className="inline-block rounded-full border border-foreground bg-tertiary/40 px-1.5 py-0 text-[10px] font-medium text-foreground tabular-nums">
        DP {formatRp(paid_idr)}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
      Belum dibayar
    </span>
  );
}

function ProductionChip({
  status,
}: {
  status: CakeOrder["production_status"];
}) {
  if (status === "pending") return null;
  const map: Record<
    CakeOrder["production_status"],
    { label: string; cls: string }
  > = {
    pending: { label: "Pending", cls: "" },
    in_progress: {
      label: "Diproduksi",
      cls: "bg-tertiary/40 text-foreground border-foreground",
    },
    done: {
      label: "Prod. selesai",
      cls: "bg-pop-emerald/30 text-foreground border-foreground",
    },
    cancelled: {
      label: "Batal",
      cls: "bg-muted text-muted-foreground border-border",
    },
  };
  const m = map[status];
  return (
    <span
      className={`inline-block rounded-full border px-1.5 py-0 text-[10px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
