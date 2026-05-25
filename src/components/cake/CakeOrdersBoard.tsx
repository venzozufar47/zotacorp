"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Cake as CakeIcon,
  Clock,
  Phone,
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
import { UrgencyLegend as DesignUrgencyLegend } from "./parts/UrgencyLegend";
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
  /** Subtitle below the column header, per Haengbocake design. */
  sub: string;
  /** Inline-style background for the column shell (cake- CSS var). */
  colBg: string;
  /** Inline-style background for the small chip in the header. */
  chipBg: string;
  chipFg: string;
}

const COLUMNS: Column[] = [
  {
    status: "submitted",
    label: "Baru",
    emoji: "🆕",
    sub: "Order baru masuk",
    colBg: "var(--cake-col-baru)",
    chipBg: "var(--cake-col-baru-chip)",
    chipFg: "var(--cake-col-baru-chip-fg)",
  },
  {
    status: "in_progress",
    label: "Dikerjakan",
    emoji: "👨‍🍳",
    sub: "Sedang produksi",
    colBg: "var(--cake-col-kerja)",
    chipBg: "var(--cake-col-kerja-chip)",
    chipFg: "var(--cake-col-kerja-chip-fg)",
  },
  {
    status: "ready",
    label: "Siap",
    emoji: "📦",
    sub: "Siap diambil / dikirim",
    colBg: "var(--cake-col-siap)",
    chipBg: "var(--cake-col-siap-chip)",
    chipFg: "var(--cake-col-siap-chip-fg)",
  },
  {
    status: "delivering",
    label: "Pengiriman",
    emoji: "🚚",
    sub: "Dalam perjalanan",
    colBg: "var(--cake-col-kirim)",
    chipBg: "var(--cake-col-kirim-chip)",
    chipFg: "var(--cake-col-kirim-chip-fg)",
  },
  {
    status: "done",
    label: "Selesai",
    emoji: "✅",
    sub: "Tutup buku",
    colBg: "var(--cake-col-selesai)",
    chipBg: "var(--cake-col-selesai-chip)",
    chipFg: "var(--cake-col-selesai-chip-fg)",
  },
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
        <DesignUrgencyLegend />
        <div className={gridCls}>
          {COLUMNS.map((col) => {
          const list = grouped.get(col.status) ?? [];
          const isOver = dragOverStatus === col.status;
          const isAutoOnly =
            col.status === "submitted" || col.status === "in_progress";
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                if (!canMove || !draggingId) return;
                if (isAutoOnly) return;
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
              className="flex flex-col rounded-[22px] p-2.5 pb-3 min-h-[320px] transition-colors"
              style={{
                background: col.colBg,
                outline: isOver ? "2px dashed var(--cake-fg)" : "none",
                outlineOffset: -4,
              }}
            >
              {/* Column header per Haengbocake design: chip + UPPERCASE
                  label on left, count on right. Subtitle below. */}
              <div className="flex items-center justify-between px-2 pt-1.5 pb-2.5">
                <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--cake-fg)" }}>
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-[7px] text-[11px]"
                    style={{ background: col.chipBg, color: col.chipFg }}
                  >
                    {col.emoji}
                  </span>
                  <span>{col.label}</span>
                </span>
                <span
                  className="text-[12px] font-bold tabular-nums"
                  style={{ color: "var(--cake-fg-soft)" }}
                >
                  {list.length}
                </span>
              </div>
              <div
                className="text-[10.5px] mb-2 px-2"
                style={{ color: "var(--cake-fg-soft)" }}
              >
                {col.sub}
              </div>
              <ul className="flex flex-col gap-2">
                {list.length === 0 ? (
                  <li
                    className="text-[11px] italic text-center px-1 py-3"
                    style={{ color: "var(--cake-muted)" }}
                  >
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

/**
 * Card visuals match the Haengbocake design (cake_design_pages.jsx).
 * Key details:
 *  - white surface with subtle border
 *  - 3px urgency stripe on the left (::before-like)
 *  - tinted left wash (linear-gradient first 6px) for late/soon/week
 *  - branch chip (PARE/SEM) + uppercase name + total on top row
 *  - 4 info rows (phone when not submitted, base/shape/dim, when/delivery)
 *  - payment + production chips
 *  - per-status action footer (Sudah diambil / Kirim sekarang / Terkirim
 *    & diterima) and archive/unarchive secondary actions
 */
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
  isMatch?: boolean;
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

  const deliveryLabel = labelFor("delivery", order.delivery_option_id);
  const isPickup = deliveryLabel.toLowerCase().includes("pickup");
  const next = nextAction(order, isPickup);

  // Urgency (calendar-day diff, Jakarta TZ).
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
    if (diff < 0) return "late" as const;
    if (diff <= 1) return "soon" as const;
    if (diff <= 5) return "week" as const;
    return "far" as const;
  })();

  // Map urgency → stripe color + left wash.
  const URGENCY_STRIPE: Record<typeof urgency, string> = {
    late: "var(--cake-late)",
    soon: "var(--cake-today)",
    week: "var(--cake-week)",
    far: "var(--cake-muted-2, #CBD5E1)",
  };
  const URGENCY_WASH: Record<typeof urgency, string> = {
    late: "linear-gradient(90deg, #FEF2F2 0 6px, var(--cake-surface) 6px)",
    soon: "linear-gradient(90deg, #ECFDF5 0 6px, var(--cake-surface) 6px)",
    week: "linear-gradient(90deg, #FFFBEB 0 6px, var(--cake-surface) 6px)",
    far: "var(--cake-surface)",
  };

  // Active/match/dim visual states.
  const activeRing = isActive
    ? "shadow-[0_0_0_3px_rgba(42,127,98,0.15)]"
    : "";
  const matchRing = isMatch
    ? "shadow-[0_0_0_3px_rgba(245,158,11,0.45)]"
    : "";
  const dimCls =
    hasSearch && !isMatch ? "opacity-[0.35] saturate-[0.5]" : "";

  return (
    <li
      data-cake-order-id={order.id}
      className={`relative rounded-[14px] overflow-hidden transition-all hover:-translate-y-px ${activeRing} ${matchRing} ${dimCls} ${
        dimmed ? "opacity-60" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        background: URGENCY_WASH[urgency],
        boxShadow:
          isActive || isMatch
            ? undefined
            : "var(--cake-shadow-card, 0 1px 2px rgba(27,37,64,0.06))",
        border: `1px solid ${
          isActive
            ? "var(--cake-primary)"
            : "rgba(27, 37, 64, 0.06)"
        }`,
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Urgency stripe (::before equivalent) */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: URGENCY_STRIPE[urgency] }}
      />
      <button
        type="button"
        onClick={() => onSelect?.(order.id)}
        className="block w-full text-left px-3 pt-2.5 pb-3 space-y-[3px]"
      >
        {/* Top row: branch chip + name + total */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <BranchChipInline branch={order.branch} />
            <span
              className="font-bold text-[14px] tracking-[-0.005em] truncate uppercase"
              style={{ color: "var(--cake-fg)" }}
            >
              {order.customer_name}
            </span>
          </div>
          <span
            className="text-[12px] font-bold tabular-nums whitespace-nowrap"
            style={{ color: "var(--cake-fg)" }}
          >
            Rp {formatIDR(order.total_idr)}
          </span>
        </div>

        {/* Phone (skip on submitted to keep early cards minimal) */}
        {order.customer_phone && order.status !== "submitted" && (
          <CardRow icon={<Phone size={11} />}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {order.customer_phone}
            </span>
          </CardRow>
        )}

        {/* Base · Shape (· dim chip) */}
        <CardRow icon={<CakeIcon size={11} />}>
          <span>
            {labelFor("base_cake", order.base_cake_option_id)}
            {" · "}
            {labelFor("shape", order.shape_option_id)}
            {order.shape_custom ? ` (${order.shape_custom})` : ""}
            {order.dimension_cm != null && (
              <span
                className="ml-1.5 inline-flex items-center px-1.5 h-[19px] rounded-full text-[10.5px] font-medium tabular-nums align-middle"
                style={{
                  background: "rgba(27, 37, 64, 0.06)",
                  color: "var(--cake-fg)",
                }}
              >
                {order.dimension_cm} cm
              </span>
            )}
          </span>
        </CardRow>

        {/* When · Delivery */}
        <CardRow icon={<Clock size={11} />}>
          <span>{dateLabel}</span>
          <span className="mx-1" style={{ color: "var(--cake-muted)" }}>
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <Truck size={11} style={{ color: "var(--cake-muted)" }} />
            {deliveryLabel}
          </span>
        </CardRow>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5 mt-2">
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
          className="mx-3 mb-2.5 w-[calc(100%-1.5rem)] inline-flex items-center justify-center gap-1 h-8 rounded-[10px] text-[12px] font-semibold hover:opacity-90"
          style={{
            background: "var(--cake-fg)",
            color: "#fff",
          }}
        >
          {next.label}
          <ChevronRight size={12} strokeWidth={2.5} />
        </button>
      )}

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
            className="mx-3 mb-2.5 w-[calc(100%-1.5rem)] inline-flex items-center justify-center gap-1 h-7 rounded-[8px] border border-dashed text-[10.5px] font-medium transition-colors"
            style={{
              borderColor: "var(--cake-border)",
              color: "var(--cake-muted)",
            }}
          >
            <Archive size={11} strokeWidth={2.5} />
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
          className="mx-3 mb-2.5 w-[calc(100%-1.5rem)] inline-flex items-center justify-center gap-1 h-7 rounded-[8px] border text-[10.5px] font-medium transition-colors"
          style={{
            borderColor: "var(--cake-primary)",
            color: "var(--cake-primary)",
          }}
        >
          <ArchiveRestore size={11} strokeWidth={2.5} />
          Kembalikan ke daftar utama
        </button>
      )}
    </li>
  );
}

/** Inline branch chip per design's `.branch-chip` style. */
function BranchChipInline({ branch }: { branch: "pare" | "semarang" }) {
  const isPare = branch === "pare";
  return (
    <span
      className="inline-flex items-center px-1.5 h-[18px] rounded-[5px] text-[10px] font-bold uppercase tracking-[0.06em]"
      style={{
        background: isPare ? "var(--cake-pare-soft)" : "var(--cake-sem-soft)",
        color: isPare ? "var(--cake-pare-fg)" : "var(--cake-sem-fg)",
      }}
    >
      {isPare ? "PARE" : "SEM"}
    </span>
  );
}

/** Card info-row with leading lucide icon per design. */
function CardRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-[11.5px] leading-tight"
      style={{ color: "var(--cake-fg-soft)" }}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-3.5 shrink-0"
        style={{ color: "var(--cake-muted)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

/**
 * Chip styles match design: pill-shaped, no border, soft pastel
 * background + ink-toned text. 10.5px / 600 / tabular numerals.
 */
const CHIP_BASE = "inline-flex items-center px-2 h-[20px] rounded-full text-[10.5px] font-semibold tabular-nums";

function PaymentChip({ order }: { order: CakeOrder }) {
  const { payment_status, paid_idr, total_idr } = order;
  const formatRp = (n: number) => {
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
    if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  };
  if (payment_status === "refunded") {
    return (
      <span
        className={CHIP_BASE}
        style={{ background: "var(--cake-unpaid-soft)", color: "var(--cake-unpaid-fg)" }}
      >
        Refund
      </span>
    );
  }
  if (payment_status === "partial_refund") {
    return (
      <span
        className={CHIP_BASE}
        style={{ background: "var(--cake-sem-soft)", color: "var(--cake-sem-fg)" }}
      >
        Refund sebagian
      </span>
    );
  }
  if (payment_status === "paid") {
    return (
      <span
        className={CHIP_BASE}
        style={{ background: "var(--cake-paid-soft)", color: "var(--cake-paid-fg)" }}
      >
        ● Lunas
      </span>
    );
  }
  if (paid_idr > 0 && paid_idr < total_idr) {
    return (
      <span
        className={CHIP_BASE}
        style={{ background: "var(--cake-dp-soft)", color: "var(--cake-dp-fg)" }}
      >
        DP {formatRp(paid_idr)}
      </span>
    );
  }
  return (
    <span
      className={CHIP_BASE}
      style={{ background: "var(--cake-unpaid-soft)", color: "var(--cake-unpaid-fg)" }}
    >
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
  const STYLES: Record<
    CakeOrder["production_status"],
    { label: string; bg: string; fg: string } | null
  > = {
    pending: null,
    in_progress: {
      label: "Diproduksi",
      bg: "var(--cake-prod-soft)",
      fg: "var(--cake-prod-fg)",
    },
    decorating: {
      label: "Digambar",
      bg: "var(--cake-deco-soft)",
      fg: "var(--cake-deco-fg)",
    },
    done: {
      label: "Prod. selesai",
      bg: "var(--cake-paid-soft)",
      fg: "var(--cake-paid-fg)",
    },
    cancelled: {
      label: "Batal",
      bg: "var(--cake-bg-elev)",
      fg: "var(--cake-muted)",
    },
  };
  const s = STYLES[status];
  if (!s) return null;
  return (
    <span className={CHIP_BASE} style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

/**
 * Mini legend untuk urgency color di card kanban. Selalu visible
 * supaya admin tidak perlu menebak arti warna. Kompak: 4 chip
 * berwarna + label di satu baris (wrap di mobile).
 */
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
