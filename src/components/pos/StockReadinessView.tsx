"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, ArrowUp, ArrowDown } from "lucide-react";
import {
  getStockTimeline,
  type StockTimeline,
  type StockTimelineCell,
  type StockTimelineRow,
} from "@/lib/actions/pos-stock.actions";

interface Props {
  bankAccountId: string;
}

const WINDOW_OPTIONS = [1, 3, 7] as const;

/**
 * Pantauan tab — line chart bertumpuk: tiap SKU = satu garis berwarna
 * di atas axis qty × waktu. Legend di samping nampilkan nama produk,
 * qty sekarang, dan ringkasan ↑in ↓out · net.
 *
 * Tujuan: dalam 1 layar tanpa scroll vertikal admin langsung tahu
 * trajectory semua SKU — mana yang ramai turun, mana yang naik produksi,
 * mana yang stagnan.
 */
export function StockReadinessView({ bankAccountId }: Props) {
  const [windowDays, setWindowDays] = useState<number>(7);
  const [data, setData] = useState<StockTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** SKU yang sedang di-hover/click di legend → di-highlight di chart.
   *  null = tampilkan semua dengan opacity normal. */
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getStockTimeline(bankAccountId, windowDays);
        if (cancelled) return;
        if (!res.ok) setError(res.error);
        else setData(res.data!);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Gagal memuat timeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bankAccountId, windowDays]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          Alur stok per jam
        </p>
        <div className="flex gap-1 rounded-full border border-border bg-muted/40 p-1">
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              className={
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition " +
                (windowDays === w
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {w}h
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 size={14} className="animate-spin" /> Memuat timeline…
        </div>
      ) : data ? (
        // Break-out wrapper: card lepas dari container parent dan
        // melar selebar viewport. `overflow-x: clip` mencegah dampak
        // ke scroll horizontal halaman kalau lebar 100vw kebetulan
        // melampaui content area parent (mis. saat ada scrollbar).
        <div
          className="relative left-1/2 right-1/2 -translate-x-1/2 w-screen px-2"
          style={{ overflowX: "clip" }}
        >
          <ChartView data={data} focused={focused} onFocus={setFocused} />
        </div>
      ) : null}
    </section>
  );
}

interface ColumnDef {
  date: string;
  hour: number;
  isDayStart: boolean;
}

function buildColumns(data: StockTimeline): ColumnDef[] {
  const cols: ColumnDef[] = [];
  const dates: string[] = [];
  const start = new Date(data.fromDate + "T00:00:00Z");
  const end = new Date(data.toDate + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  for (const date of dates) {
    for (let h = data.hourFrom; h <= data.hourTo; h += 1) {
      cols.push({ date, hour: h, isDayStart: h === data.hourFrom });
    }
  }
  return cols;
}

interface HourSlot {
  qty: number;
  delta: number;
  isEvent: boolean;
  events: number;
}

interface RowSummary {
  slots: HourSlot[];
  totalIn: number;
  totalOut: number;
  hasActivity: boolean;
  rowMax: number;
}

function buildSlots(
  cells: StockTimelineCell[],
  columns: ColumnDef[]
): RowSummary {
  const cellMap = new Map<string, StockTimelineCell>();
  for (const c of cells) cellMap.set(`${c.date}|${c.hour}`, c);
  const slots: HourSlot[] = [];
  let carry = 0;
  let totalIn = 0;
  let totalOut = 0;
  let sawFirstEvent = false;
  let rowMax = 0;
  for (const col of columns) {
    const key = `${col.date}|${col.hour}`;
    const cell = cellMap.get(key);
    if (cell) {
      const delta = cell.qty - carry;
      const isFirst = !sawFirstEvent;
      sawFirstEvent = true;
      slots.push({
        qty: cell.qty,
        delta: isFirst ? 0 : delta,
        isEvent: !isFirst,
        events: cell.events,
      });
      if (!isFirst) {
        if (delta > 0) totalIn += delta;
        else if (delta < 0) totalOut += -delta;
      }
      carry = cell.qty;
      if (cell.qty > rowMax) rowMax = cell.qty;
    } else {
      slots.push({ qty: carry, delta: 0, isEvent: false, events: 0 });
    }
  }
  return {
    slots,
    totalIn,
    totalOut,
    hasActivity: totalIn > 0 || totalOut > 0 || rowMax > 0,
    rowMax,
  };
}

/** Palette stabil berdasarkan index — golden-angle hue spacing
 *  supaya tetangga selalu kontras. */
function lineColor(i: number): string {
  const golden = 137.508;
  const hue = (i * golden) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

function ChartView({
  data,
  focused,
  onFocus,
}: {
  data: StockTimeline;
  focused: string | null;
  onFocus: (id: string | null) => void;
}) {
  const columns = useMemo(() => buildColumns(data), [data]);

  const enriched = useMemo(() => {
    return data.rows.map((row, idx) => {
      const summary = buildSlots(row.cells, columns);
      return {
        row,
        summary,
        color: lineColor(idx),
        id: rowKey(row),
      };
    });
  }, [data.rows, columns]);

  const activeRows = useMemo(
    () => enriched.filter((e) => e.summary.hasActivity),
    [enriched]
  );
  const inactiveRows = useMemo(
    () => enriched.filter((e) => !e.summary.hasActivity),
    [enriched]
  );

  const globalMax = useMemo(() => {
    let m = 0;
    for (const e of activeRows) {
      if (e.summary.rowMax > m) m = e.summary.rowMax;
    }
    return Math.max(1, m);
  }, [activeRows]);

  const nowIdx = useMemo(
    () => columns.findIndex((c) => c.date === data.nowDate && c.hour === data.nowHour),
    [columns, data.nowDate, data.nowHour]
  );

  // 2-kolom: legend (220px sticky left) + chart fills rest. Tinggi
  // total constraint = 70vh supaya admin lihat dalam 1 layar tanpa
  // scroll kalau monitor wajar.
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr]">
        <LegendList
          rows={enriched}
          focused={focused}
          onFocus={onFocus}
          inactiveCount={inactiveRows.length}
        />
        <ChartCanvas
          activeRows={activeRows}
          columns={columns}
          globalMax={globalMax}
          nowIdx={nowIdx}
          focused={focused}
        />
      </div>
    </div>
  );
}

function rowKey(row: StockTimelineRow): string {
  return `${row.productId}|${row.variantId ?? "-"}`;
}

interface EnrichedRow {
  row: StockTimelineRow;
  summary: RowSummary;
  color: string;
  id: string;
}

function LegendList({
  rows,
  focused,
  onFocus,
  inactiveCount,
}: {
  rows: EnrichedRow[];
  focused: string | null;
  onFocus: (id: string | null) => void;
  inactiveCount: number;
}) {
  return (
    <div className="border-b sm:border-b-0 sm:border-r border-border bg-muted/20">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border">
        Produk · qty · ↑in / ↓out
      </div>
      <ul className="overflow-y-auto max-h-[60vh] divide-y divide-border/40">
        {rows.map((e) => {
          const isFocused = focused === e.id;
          const dim = focused != null && !isFocused;
          const ready = e.row.currentQty > 0;
          const net = e.summary.totalIn - e.summary.totalOut;
          return (
            <li
              key={e.id}
              onMouseEnter={() => onFocus(e.id)}
              onMouseLeave={() => onFocus(null)}
              onClick={() => onFocus(isFocused ? null : e.id)}
              className={
                "flex items-center gap-2 px-3 py-1.5 text-[11px] cursor-pointer transition-opacity " +
                (dim ? "opacity-40" : "opacity-100") +
                (isFocused ? " bg-muted/50" : " hover:bg-muted/30")
              }
            >
              <span
                aria-hidden
                className="w-2.5 h-2.5 rounded-full shrink-0 border border-foreground/20"
                style={{ backgroundColor: e.color }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-foreground truncate text-[11px] font-medium">
                  {e.row.variantName
                    ? `${e.row.productName} — ${e.row.variantName}`
                    : e.row.productName}
                </span>
                <span className="flex items-center gap-1 text-[10px] tabular-nums leading-none mt-0.5">
                  <span
                    className={
                      "size-1 rounded-full " +
                      (ready ? "bg-pop-emerald" : "bg-destructive")
                    }
                  />
                  <span className="text-muted-foreground">
                    qty{" "}
                    <span className="text-foreground font-semibold">
                      {e.row.currentQty}
                    </span>
                  </span>
                  {e.summary.totalIn > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-pop-emerald font-semibold">
                      <ArrowUp size={8} strokeWidth={3} />
                      {e.summary.totalIn}
                    </span>
                  )}
                  {e.summary.totalOut > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-destructive font-semibold">
                      <ArrowDown size={8} strokeWidth={3} />
                      {e.summary.totalOut}
                    </span>
                  )}
                  {(e.summary.totalIn > 0 || e.summary.totalOut > 0) && (
                    <span
                      className={
                        "ml-auto font-semibold " +
                        (net > 0
                          ? "text-pop-emerald"
                          : net < 0
                            ? "text-destructive"
                            : "text-muted-foreground")
                      }
                    >
                      {net > 0 ? "+" : net < 0 ? "−" : ""}
                      {Math.abs(net) || 0}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
        {inactiveCount > 0 && (
          <li className="px-3 py-1.5 text-[10px] text-muted-foreground/70 italic">
            + {inactiveCount} SKU tanpa aktivitas
          </li>
        )}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------
   SVG chart
   ---------------------------------------------------------------- */

const CHART_H = 360;
const PAD_TOP = 16;
const PAD_BOTTOM = 36;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setW(Math.round(cr.width));
    });
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function ChartCanvas({
  activeRows,
  columns,
  globalMax,
  nowIdx,
  focused,
}: {
  activeRows: EnrichedRow[];
  columns: ColumnDef[];
  globalMax: number;
  nowIdx: number;
  focused: string | null;
}) {
  const [wrapRef, wrapWidth] = useContainerWidth<HTMLDivElement>();
  const innerW = Math.max(300, wrapWidth);
  const plotW = innerW - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

  // X mapper: pusat dari setiap cell jam.
  const xAt = (i: number): number => {
    if (columns.length <= 1) return PAD_LEFT + plotW / 2;
    return PAD_LEFT + (i / (columns.length - 1)) * plotW;
  };
  const yAt = (qty: number): number => {
    return PAD_TOP + plotH - (qty / globalMax) * plotH;
  };

  // Y-axis ticks: 0, mid, max.
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const niceMax = niceCeil(globalMax);
    ticks.push(0);
    ticks.push(Math.round(niceMax / 2));
    ticks.push(niceMax);
    return Array.from(new Set(ticks));
  }, [globalMax]);

  // Day separators.
  const dayBoundaries = useMemo(() => {
    const out: { date: string; left: number; width: number; centerX: number }[] = [];
    let i = 0;
    while (i < columns.length) {
      const date = columns[i].date;
      let j = i;
      while (j < columns.length && columns[j].date === date) j += 1;
      const startX = xAt(i);
      const endX = xAt(j - 1);
      out.push({
        date,
        left: startX,
        width: endX - startX,
        centerX: (startX + endX) / 2,
      });
      i = j;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, innerW]);

  // Hover tooltip — pointer x → nearest column index.
  const [hover, setHover] = useState<{ idx: number; x: number } | null>(null);
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * innerW;
    if (x < PAD_LEFT || x > innerW - PAD_RIGHT) {
      setHover(null);
      return;
    }
    const rel = (x - PAD_LEFT) / plotW;
    const idx = Math.round(rel * (columns.length - 1));
    if (idx < 0 || idx >= columns.length) {
      setHover(null);
      return;
    }
    setHover({ idx, x: xAt(idx) });
  };
  const onPointerLeave = () => setHover(null);

  const hoverCol = hover ? columns[hover.idx] : null;
  const nowX = nowIdx >= 0 ? xAt(nowIdx) : null;

  return (
    <div ref={wrapRef} className="relative" style={{ height: CHART_H }}>
      {wrapWidth > 0 ? (
        <svg
          width={innerW}
          height={CHART_H}
          viewBox={`0 0 ${innerW} ${CHART_H}`}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          style={{ display: "block" }}
        >
          {/* Day boundary verticals + background banding */}
          {dayBoundaries.map((d, i) => (
            <rect
              key={d.date}
              x={d.left - (i === 0 ? 0 : 0)}
              y={PAD_TOP}
              width={d.width || 1}
              height={plotH}
              fill={i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.025)"}
            />
          ))}

          {/* Y grid + ticks */}
          {yTicks.map((t) => {
            const y = yAt(t);
            return (
              <g key={t}>
                <line
                  x1={PAD_LEFT}
                  x2={innerW - PAD_RIGHT}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? "0" : "2 3"}
                />
                <text
                  x={PAD_LEFT - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  style={{ fontSize: 9 }}
                >
                  {t}
                </text>
              </g>
            );
          })}

          {/* Day separators (subtle vertical lines) */}
          {dayBoundaries.slice(1).map((d) => (
            <line
              key={`sep-${d.date}`}
              x1={d.left}
              x2={d.left}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}

          {/* Lines per SKU */}
          {activeRows.map((e) => {
            const isFocused = focused === e.id;
            const dim = focused != null && !isFocused;
            const opacity = dim ? 0.15 : isFocused ? 1 : 0.85;
            const strokeWidth = isFocused ? 2.5 : 1.5;
            const points = e.summary.slots
              .map((s, i) => `${xAt(i)},${yAt(s.qty)}`)
              .join(" ");
            return (
              <g key={e.id} style={{ pointerEvents: "none" }}>
                <polyline
                  fill="none"
                  stroke={e.color}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={opacity}
                  points={points}
                />
                {/* Event markers — small filled dot di posisi event */}
                {e.summary.slots.map((s, i) =>
                  s.isEvent ? (
                    <circle
                      key={i}
                      cx={xAt(i)}
                      cy={yAt(s.qty)}
                      r={isFocused ? 3 : 2}
                      fill={e.color}
                      opacity={opacity}
                    />
                  ) : null
                )}
              </g>
            );
          })}

          {/* Now line */}
          {nowX != null && (
            <line
              x1={nowX}
              x2={nowX}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              stroke="currentColor"
              className="text-primary"
              strokeWidth={1.5}
              opacity={0.6}
            />
          )}

          {/* Hover crosshair */}
          {hover && (
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              stroke="currentColor"
              className="text-foreground"
              strokeWidth={1}
              opacity={0.25}
            />
          )}

          {/* Day labels at bottom */}
          {dayBoundaries.map((d) => (
            <text
              key={`lab-${d.date}`}
              x={d.centerX}
              y={CHART_H - 18}
              textAnchor="middle"
              className="fill-foreground"
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {formatDayLabel(d.date)}
            </text>
          ))}

          {/* Hour labels — only on boundary + now to avoid clutter */}
          {hoverCol && hover && (
            <text
              x={hover.x}
              y={CHART_H - 4}
              textAnchor="middle"
              className="fill-foreground"
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {String(hoverCol.hour).padStart(2, "0")}:00
            </text>
          )}
        </svg>
      ) : null}

      {/* Tooltip (HTML overlay) — listing qty per SKU di kolom hover. */}
      {hover && hoverCol && (
        <HoverTooltip
          x={hover.x}
          width={innerW}
          rows={activeRows}
          idx={hover.idx}
          col={hoverCol}
        />
      )}
    </div>
  );
}

function HoverTooltip({
  x,
  width,
  rows,
  idx,
  col,
}: {
  x: number;
  width: number;
  rows: EnrichedRow[];
  idx: number;
  col: ColumnDef;
}) {
  // Render tooltip ke sisi yang punya ruang. Tooltip max-w 220.
  const W = 220;
  const flipRight = x + W + 12 > width;
  const left = flipRight ? x - W - 12 : x + 12;
  // Top: pakai posisi vertikal moderate supaya tidak menempel garis.
  const top = PAD_TOP + 6;
  const visible = rows
    .map((e) => ({ e, slot: e.summary.slots[idx] }))
    .filter(({ slot }) => slot.qty > 0 || slot.isEvent)
    .sort((a, b) => b.slot.qty - a.slot.qty)
    .slice(0, 10);
  return (
    <div
      className="pointer-events-none absolute rounded-lg border border-border bg-card/95 backdrop-blur shadow-md text-[10px] p-2 space-y-1"
      style={{ left, top, width: W }}
    >
      <p className="font-semibold text-foreground">
        {formatDayLabel(col.date)} · {String(col.hour).padStart(2, "0")}:00
      </p>
      {visible.length === 0 && (
        <p className="text-muted-foreground italic">Tidak ada qty &gt; 0</p>
      )}
      {visible.map(({ e, slot }) => (
        <div
          key={e.id}
          className="flex items-center gap-1.5 leading-tight"
        >
          <span
            aria-hidden
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: e.color }}
          />
          <span className="flex-1 min-w-0 truncate text-foreground">
            {e.row.variantName
              ? `${e.row.productName} — ${e.row.variantName}`
              : e.row.productName}
          </span>
          <span className="tabular-nums font-semibold text-foreground">
            {slot.qty}
          </span>
          {slot.isEvent && slot.delta !== 0 && (
            <span
              className={
                "tabular-nums font-semibold " +
                (slot.delta > 0 ? "text-pop-emerald" : "text-destructive")
              }
            >
              {slot.delta > 0 ? "+" : "−"}
              {Math.abs(slot.delta)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 0) return 1;
  if (n <= 5) return n;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  if (n <= 50) return Math.ceil(n / 10) * 10;
  return Math.ceil(n / 50) * 50;
}

function formatDayLabel(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  const weekday = d.toLocaleDateString("id-ID", {
    timeZone: "UTC",
    weekday: "short",
  });
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("id-ID", {
    timeZone: "UTC",
    month: "short",
  });
  return `${weekday} ${day} ${month}`;
}
