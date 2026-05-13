"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  setCakeOrderArchived,
  setCakeOrderStatus,
} from "@/lib/actions/cake-orders.actions";
import { formatIDR } from "@/lib/cashflow/format";
import { makeLabelFor } from "@/lib/cake-orders/helpers";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { CakeOrderDetailLoader } from "./CakeOrderDetailLoader";
import { BranchBadge } from "./BranchBadge";
import type {
  CakeBaseDiameterPrice,
  CakeDiameterOption,
  CakeOrder,
  CakeOptionsByKind,
  CakeOrderStatus,
} from "@/lib/cake-orders/types";

interface Props {
  orders: CakeOrder[];
  optionsByKind: CakeOptionsByKind | null;
  /** Preset diameter + matriks harga, di-pass ke editor inline. */
  diameters?: CakeDiameterOption[];
  prices?: CakeBaseDiameterPrice[];
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
  /** Render a flat responsive grid of cards (no kanban columns,
   *  no drag-and-drop, no cancelled section). Dipakai untuk halaman
   *  Arsip dimana semua order sudah `done` — kanban 5 kolom hampir
   *  semua kosong dan cuma menghabiskan space. */
  flatLayout?: boolean;
  /** Tampilkan input search di atas board. Mem-filter berdasarkan
   *  customer name/phone + text fields (greeting card, color/shape/
   *  decoration/accessories notes). Case-insensitive. */
  enableSearch?: boolean;
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
 *  Transitions yang INTENTIONALLY null:
 *  - `submitted → in_progress`: hanya dipicu otomatis saat admin
 *    `sendSlip` (slip produksi terkirim ke bagian produksi).
 *  - `in_progress → ready`: hanya dipicu otomatis saat bagian
 *    produksi men-set `production_status='done'`. Admin/orders staff
 *    TIDAK boleh menandai siap manual karena itu menyembunyikan apakah
 *    kue benar-benar sudah selesai dipanggang.
 */
function nextAction(
  order: CakeOrder,
  isPickup: boolean
): { label: string; target: CakeOrderStatus } | null {
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
  diameters = [],
  prices = [],
  canMove = true,
  showArchiveButton = true,
  showUnarchiveButton = false,
  isAdminView = false,
  flatLayout = false,
  enableSearch = false,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showCancelled, setShowCancelled] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] =
    useState<CakeOrderStatus | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  /** Filter cabang admin: 'all' (default) menampilkan kedua cabang;
   *  'pare' / 'semarang' menyaring. */
  const [branchFilter, setBranchFilter] = useState<
    "all" | "pare" | "semarang"
  >("all");

  // Apply branch filter SEBELUM grouping/search supaya counts + match
  // hanya mencakup orders yang relevan dengan filter aktif.
  const visibleOrders = useMemo(
    () =>
      branchFilter === "all"
        ? orders
        : orders.filter((o) => o.branch === branchFilter),
    [orders, branchFilter]
  );

  // Counts untuk pill filter — satu reduce supaya tidak 2× filter
  // per render saat board ramai card.
  const branchCounts = useMemo(() => {
    let pare = 0;
    let semarang = 0;
    for (const o of orders) {
      if (o.branch === "pare") pare++;
      else if (o.branch === "semarang") semarang++;
    }
    return { all: orders.length, pare, semarang };
  }, [orders]);

  const labelFor = makeLabelFor(optionsByKind);

  // Search: jangan filter (sembunyikan) card lain — admin sering perlu
  // konteks kanban tetap utuh. Sebagai gantinya hitung set id yang
  // match supaya UI bisa highlight + scroll ke match pertama.
  const matchedIds = useMemo(() => {
    if (!enableSearch) return null;
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) return null;
    const set = new Set<string>();
    for (const o of visibleOrders) {
      const hay = [
        o.customer_name,
        o.customer_phone,
        o.greeting_card,
        o.shape_custom,
        o.color_notes,
        o.texture_notes,
        o.decoration_notes,
        o.accessories_notes,
        o.delivery_address,
      ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .join(" ")
        .toLowerCase();
      if (hay.includes(q)) set.add(o.id);
    }
    return set;
  }, [visibleOrders, searchQuery, enableSearch]);
  const matchCount = matchedIds?.size ?? 0;

  // Scroll ke match pertama saat query berubah. Pakai data-attribute
  // pada Card supaya selector aman terhadap tree-shake nama class.
  useEffect(() => {
    if (!matchedIds || matchedIds.size === 0) return;
    const firstId = visibleOrders.find((o) => matchedIds.has(o.id))?.id;
    if (!firstId) return;
    const el = document.querySelector<HTMLElement>(
      `[data-cake-order-id="${firstId}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [matchedIds, visibleOrders]);

  const grouped = useMemo(() => {
    const map = new Map<CakeOrderStatus, CakeOrder[]>();
    for (const c of COLUMNS) map.set(c.status, []);
    map.set("cancelled", []);
    for (const o of visibleOrders) {
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
  }, [visibleOrders]);

  const cancelled = grouped.get("cancelled") ?? [];

  const moveTo = (orderId: string, target: CakeOrderStatus) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === target) return;
    // Kolom "Baru" & "Dikerjakan" sepenuhnya auto-only — admin tidak
    // boleh drag card ke sana (atau ke arah sebaliknya). Reverting
    // hanya bisa dari "Siap"/"Pengiriman" mundur ke "Selesai" atau
    // alur normal lewat tombol next-action.
    if (target === "submitted" || target === "in_progress") {
      toast.error(
        target === "submitted"
          ? "Card tidak bisa dipindah ke kolom Baru — itu khusus pesanan masuk"
          : "Card pindah ke Dikerjakan otomatis lewat kirim slip produksi"
      );
      return;
    }
    // `in_progress → ready` adalah auto-advance dari sisi produksi
    // (production_status='done'); admin tidak boleh menggesernya manual.
    if (order.status === "in_progress" && target === "ready") {
      toast.error("Hanya bagian produksi yang bisa menandai pesanan Siap");
      return;
    }
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

  if (flatLayout) {
    const flatGridCls = panelOpen
      ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2"
      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2";
    return (
      <div className="flex gap-3">
        <div className="flex-1 min-w-0 space-y-3">
          {enableSearch && (
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              matchCount={matchCount}
              totalCount={visibleOrders.length}
            />
          )}
          <BranchFilterPills
            value={branchFilter}
            onChange={setBranchFilter}
            counts={branchCounts}
          />
          <ul className={flatGridCls}>
            {visibleOrders.map((o) => (
              <Card
                key={o.id}
                order={o}
                labelFor={labelFor}
                canMove={false}
                onToggleArchive={toggleArchive}
                onSelect={setSelectedOrderId}
                isActive={selectedOrderId === o.id}
                isMatch={matchedIds?.has(o.id) ?? false}
                hasSearch={matchedIds != null}
                showArchiveButton={showArchiveButton}
                showUnarchiveButton={showUnarchiveButton}
              />
            ))}
          </ul>
        </div>
        {selectedOrderId && (
          <aside className="hidden md:block w-[440px] xl:w-[520px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border-2 border-foreground bg-card shadow-lg p-3">
            <CakeOrderDetailLoader
              orderId={selectedOrderId}
              optionsByKind={optionsByKind}
              diameters={diameters}
              prices={prices}
              isAdminView={isAdminView}
              canEdit={false}
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
              diameters={diameters}
              prices={prices}
              isAdminView={isAdminView}
              canEdit={false}
              onClose={closePanel}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 space-y-3">
        {enableSearch && (
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            matchCount={matchCount}
            totalCount={visibleOrders.length}
          />
        )}
        <BranchFilterPills
          value={branchFilter}
          onChange={setBranchFilter}
          counts={branchCounts}
        />
        <UrgencyLegend />
        <div className={gridCls}>
          {COLUMNS.map((col) => {
          const list = grouped.get(col.status) ?? [];
          const isOver = dragOverStatus === col.status;
          // Auto-only columns — drag-and-drop ke sini di-block penuh.
          const isAutoOnly =
            col.status === "submitted" || col.status === "in_progress";
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                if (!canMove || !draggingId) return;
                if (isAutoOnly) return; // jangan signal droppable
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
                      isMatch={matchedIds?.has(o.id) ?? false}
                      hasSearch={matchedIds != null}
                      showArchiveButton={showArchiveButton}
                      showUnarchiveButton={showUnarchiveButton}
                      draggable={
                        canMove &&
                        o.status !== "submitted" &&
                        o.status !== "in_progress"
                      }
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
                      isMatch={matchedIds?.has(o.id) ?? false}
                      hasSearch={matchedIds != null}
                      draggable={
                        canMove &&
                        o.status !== "submitted" &&
                        o.status !== "in_progress"
                      }
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
            diameters={diameters}
            prices={prices}
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
            diameters={diameters}
            prices={prices}
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
  isMatch,
  hasSearch,
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
  /** True kalau card ini cocok dengan query search (jika ada). */
  isMatch?: boolean;
  /** True kalau ada query search aktif (untuk dim non-match). */
  hasSearch?: boolean;
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

  // Urgency color berdasarkan selisih hari (Jakarta) antara
  // scheduled_at dan hari ini:
  //   <0  (sudah lewat)         → merah  (kelewat dikerjakan)
  //   0–1 (hari ini / besok)    → hijau  (prioritas tinggi)
  //   2–5 (minggu ini)          → kuning (perhatian)
  //   >5                        → default card
  // `subText` ikut shift saat ada tint: muted-foreground (abu-abu)
  // kontrasnya buruk di atas pink/emerald/warning — pakai foreground
  // dengan opacity supaya tetap readable.
  const urgency = (() => {
    const today = jakartaDateString(new Date());
    const sched = jakartaDateString(dt);
    const todayMs = Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10))
    );
    const schedMs = Date.UTC(
      Number(sched.slice(0, 4)),
      Number(sched.slice(5, 7)) - 1,
      Number(sched.slice(8, 10))
    );
    const diff = Math.round((schedMs - todayMs) / 86_400_000);
    if (diff < 0)
      return {
        bg: "bg-destructive/25",
        sub: "text-foreground/75",
        chipRing: "ring-1 ring-foreground/20",
      };
    if (diff <= 1)
      return {
        bg: "bg-pop-emerald/30",
        sub: "text-foreground/75",
        chipRing: "ring-1 ring-foreground/20",
      };
    if (diff <= 5)
      return {
        // Warning token (#FBBF24 amber default) butuh opacity penuh
        // supaya kuning jelas terpisah dari card default — opacity
        // parsial bleed jadi cream pucat.
        bg: "bg-warning",
        sub: "text-foreground/85",
        chipRing: "ring-1 ring-foreground/20",
      };
    return {
      bg: "bg-card",
      sub: "text-muted-foreground",
      chipRing: "",
    };
  })();

  // Search highlight: card yang match dapat ring tebal kuning + glow,
  // non-match di-redam (opacity & saturate) supaya match menonjol tapi
  // konteks kanban masih terlihat.
  const matchHighlight = isMatch
    ? "ring-4 ring-warning ring-offset-1 ring-offset-background"
    : "";
  const nonMatchDim =
    hasSearch && !isMatch ? "opacity-40 saturate-50" : "";
  return (
    <li
      data-cake-order-id={order.id}
      className={`rounded-xl border-2 ${
        isActive ? "border-primary ring-2 ring-primary/30" : "border-foreground"
      } ${urgency.bg} ${matchHighlight} ${nonMatchDim} p-2.5 hover:brightness-95 transition-[filter,background-color,opacity] space-y-1.5 ${
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
            <div className="flex items-center gap-1.5">
              <BranchBadge branch={order.branch} short />
              <div className="font-semibold text-sm text-foreground truncate">
                {order.customer_name}
              </div>
            </div>
            {order.customer_phone && (
              <div className={`text-[10px] truncate ${urgency.sub}`}>
                📱 {order.customer_phone}
              </div>
            )}
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-foreground shrink-0">
            Rp {formatIDR(order.total_idr)}
          </span>
        </div>

        <div className={`text-[11px] truncate ${urgency.sub}`}>
          {labelFor("base_cake", order.base_cake_option_id)}
          {" · "}
          {labelFor("shape", order.shape_option_id)}
          {order.shape_custom ? ` (${order.shape_custom})` : ""}
          {order.dimension_cm != null ? (
            <span className="ml-1 inline-block rounded-full border border-foreground bg-card px-1 py-0 text-[10px] font-semibold tabular-nums text-foreground align-middle">
              {order.dimension_cm} cm
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className={`inline-flex items-center gap-1 ${urgency.sub}`}>
            <CalendarClock size={10} className="shrink-0" />
            {dateLabel}
          </span>
          <span className={`inline-flex items-center gap-1 ${urgency.sub}`}>
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
    decorating: {
      label: "Digambar",
      cls: "bg-pop-pink/30 text-foreground border-foreground",
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

/**
 * Mini legend untuk urgency color di card kanban. Selalu visible
 * supaya admin tidak perlu menebak arti warna. Kompak: 4 chip
 * berwarna + label di satu baris (wrap di mobile).
 */
function UrgencyLegend() {
  // Swatch size kecil (3×3) jadi tint /30 hampir tak terlihat —
  // pakai opacity penuh + thin border foreground supaya semua warna
  // (terutama warning kuning yang light) jelas.
  const items: Array<{ bg: string; label: string }> = [
    { bg: "bg-destructive", label: "Lewat" },
    { bg: "bg-pop-emerald", label: "Hari ini / besok" },
    { bg: "bg-warning", label: "2–5 hari lagi" },
    { bg: "bg-card", label: ">5 hari" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wider">Warna kartu:</span>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span
            className={`inline-block size-3 rounded border border-foreground ${it.bg}`}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  matchCount,
  totalCount,
}: {
  value: string;
  onChange: (v: string) => void;
  matchCount: number;
  totalCount: number;
}) {
  const filtering = value.trim().length > 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <Search
          size={14}
          strokeWidth={2.5}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cari nama, HP, kartu ucapan…"
          className="w-full h-10 sm:h-9 pl-9 pr-14 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-foreground outline-none"
          aria-label="Cari pesanan"
        />
        {/* Counter ditempel ke dalam input area di kanan (sebelum X)
            supaya tidak mendorong input shrink di mobile sempit. */}
        {filtering && (
          <span className="absolute right-9 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground shrink-0 pointer-events-none">
            {matchCount}/{totalCount}
          </span>
        )}
        {filtering && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Bersihkan pencarian"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Toggle pill row for filtering kanban by branch. */
function BranchFilterPills({
  value,
  onChange,
  counts,
}: {
  value: "all" | "pare" | "semarang";
  onChange: (v: "all" | "pare" | "semarang") => void;
  counts: { all: number; pare: number; semarang: number };
}) {
  const opts: Array<{
    id: "all" | "pare" | "semarang";
    label: string;
    activeCls: string;
  }> = [
    { id: "all", label: "Semua", activeCls: "bg-foreground text-background" },
    {
      id: "pare",
      label: "Pare",
      activeCls: "bg-pop-emerald/40 text-foreground border-foreground",
    },
    {
      id: "semarang",
      label: "Semarang",
      activeCls: "bg-pop-pink/40 text-foreground border-foreground",
    },
  ];
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground font-medium">Cabang:</span>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full border-2 px-2.5 py-0.5 font-semibold transition-colors ${
            value === o.id
              ? o.activeCls
              : "border-border bg-card text-muted-foreground hover:border-foreground"
          }`}
        >
          {o.label}
          <span className="ml-1 tabular-nums opacity-70">{counts[o.id]}</span>
        </button>
      ))}
    </div>
  );
}
