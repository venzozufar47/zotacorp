"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getStockTimeline,
  type StockTimeline,
  type StockTimelineRow,
} from "@/lib/actions/pos-stock.actions";

interface Props {
  bankAccountId: string;
}

/** Lebar 1 cell jam di grid (px). 44 cukup untuk angka qty 2-3 digit
 *  dengan bar pendek di bawahnya, masih nyaman di-scroll mobile. */
const CELL_WIDTH = 44;
/** Lebar kolom kiri (nama produk + qty current). */
const NAME_COL_WIDTH = 180;
/** Tinggi tiap row produk (px). */
const ROW_HEIGHT = 40;
/** Tinggi header axis. */
const HEAD_HEIGHT = 30;

const WINDOW_OPTIONS = [1, 3, 7] as const;

/**
 * Pantauan tab — Gantt-style grid: row = SKU, column = jam (di-stretch
 * lewat 1..7 hari). Cell di-fill saat ada perubahan qty di jam tsb;
 * isinya angka qty + bar proporsional ke max qty SKU itu di window.
 *
 * Konsep visual mengikuti tab Live attendance: vertical "now" cursor,
 * sticky left column (nama produk), horizontal scroll axis.
 */
export function StockReadinessView({ bankAccountId }: Props) {
  const [windowDays, setWindowDays] = useState<number>(7);
  const [data, setData] = useState<StockTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getStockTimeline(bankAccountId, windowDays);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
        } else {
          setData(res.data!);
        }
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

  // Scroll ke "now" saat data baru tiba supaya jam sekarang langsung
  // terlihat (bukan dari tanggal paling kiri yang lama).
  useEffect(() => {
    if (!data || !scrollRef.current) return;
    const cols = buildColumns(data);
    const idx = cols.findIndex(
      (c) => c.date === data.nowDate && c.hour === data.nowHour
    );
    if (idx < 0) return;
    const el = scrollRef.current;
    // Sticky kolom nama berada di kiri inner content, jadi posisi
    // "now" dari awal grid = NAME_COL_WIDTH + idx*CELL. Centerkan
    // di viewport — tapi jangan scroll lewat sticky column area.
    const target =
      NAME_COL_WIDTH +
      idx * CELL_WIDTH +
      CELL_WIDTH / 2 -
      el.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
  }, [data]);

  const columns = useMemo(() => (data ? buildColumns(data) : []), [data]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          Riwayat stok per jam
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
        <Grid
          data={data}
          columns={columns}
          scrollRef={scrollRef}
        />
      ) : null}
    </section>
  );
}

interface ColumnDef {
  date: string;
  hour: number;
  /** True untuk kolom pertama tiap tanggal — render label tanggal di
   *  header. */
  isDayStart: boolean;
}

function buildColumns(data: StockTimeline): ColumnDef[] {
  const cols: ColumnDef[] = [];
  // Iterate dari fromDate s/d toDate inklusif, kemudian per jam dalam
  // [hourFrom, hourTo].
  const dates: string[] = [];
  // Walk YMD strings via UTC math.
  const start = new Date(data.fromDate + "T00:00:00Z");
  const end = new Date(data.toDate + "T00:00:00Z");
  for (
    let d = new Date(start);
    d <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }
  for (const date of dates) {
    for (let h = data.hourFrom; h <= data.hourTo; h += 1) {
      cols.push({ date, hour: h, isDayStart: h === data.hourFrom });
    }
  }
  return cols;
}

function Grid({
  data,
  columns,
  scrollRef,
}: {
  data: StockTimeline;
  columns: ColumnDef[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const totalWidth = columns.length * CELL_WIDTH;
  const innerWidth = NAME_COL_WIDTH + totalWidth;
  const nowColIdx = columns.findIndex(
    (c) => c.date === data.nowDate && c.hour === data.nowHour
  );

  // Single scroll container untuk X dan Y sekaligus — kolom nama
  // pakai `position: sticky; left: 0` supaya tetap terlihat saat
  // scroll horizontal, header pakai `top: 0` untuk vertikal. Pendekatan
  // ini menjamin baris kiri & kanan TIDAK pernah desync (mereka
  // berada di flex-row yang sama, scroll satu kontainer).

  return (
    <div
      ref={scrollRef}
      className="rounded-2xl border border-border bg-card overflow-auto max-h-[70vh] relative"
    >
      <div style={{ width: innerWidth, position: "relative" }}>
        {/* Header row — sticky top */}
        <div
          className="flex sticky top-0 z-20 bg-muted/95 backdrop-blur border-b border-border"
        >
          <div
            style={{ width: NAME_COL_WIDTH, minWidth: NAME_COL_WIDTH }}
            className="sticky left-0 z-30 bg-muted/95 backdrop-blur px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-r border-border"
          >
            Produk
          </div>
          <div style={{ width: totalWidth, position: "relative" }}>
            <DayLabels columns={columns} />
            <HourLabels columns={columns} />
          </div>
        </div>

        {/* Body rows — name cell sticky left, cells flow horizontally */}
        {data.rows.length === 0 && (
          <div className="text-xs text-muted-foreground px-3 py-6 text-center">
            Tidak ada produk track-stok aktif.
          </div>
        )}
        {data.rows.map((row, rowIdx) => (
          <div
            key={rowKey(row)}
            className="flex border-b border-border"
            style={{
              backgroundColor:
                rowIdx % 2 === 1 ? "rgba(0,0,0,0.015)" : undefined,
            }}
          >
            <div
              style={{ width: NAME_COL_WIDTH, minWidth: NAME_COL_WIDTH }}
              className="sticky left-0 z-10 bg-card border-r border-border"
            >
              <NameCell row={row} />
            </div>
            <div
              style={{
                width: totalWidth,
                height: ROW_HEIGHT,
                position: "relative",
              }}
            >
              <RowCells row={row} columns={columns} />
            </div>
          </div>
        ))}

        {/* "Now" bar — span seluruh body, di-overlay di atas cells.
            Posisi left dihitung relatif ke `innerWidth` (offset kolom
            nama + posisi kolom dalam grid). */}
        {nowColIdx >= 0 && data.rows.length > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute bg-primary/40"
            style={{
              left:
                NAME_COL_WIDTH +
                nowColIdx * CELL_WIDTH +
                CELL_WIDTH / 2 -
                1,
              top: HEAD_HEIGHT,
              width: 2,
              bottom: 0,
              zIndex: 5,
            }}
          />
        )}
      </div>
    </div>
  );
}

function rowKey(row: StockTimelineRow): string {
  return `${row.productId}|${row.variantId ?? "-"}`;
}

function DayLabels({ columns }: { columns: ColumnDef[] }) {
  const items: Array<{ date: string; left: number; width: number }> = [];
  let i = 0;
  while (i < columns.length) {
    const date = columns[i].date;
    let j = i;
    while (j < columns.length && columns[j].date === date) j += 1;
    items.push({
      date,
      left: i * CELL_WIDTH,
      width: (j - i) * CELL_WIDTH,
    });
    i = j;
  }
  return (
    <div className="relative h-[18px] border-b border-border">
      {items.map((it) => (
        <div
          key={it.date}
          style={{
            position: "absolute",
            left: it.left,
            width: it.width,
          }}
          className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground border-r border-border last:border-r-0"
        >
          {formatDayLabel(it.date)}
        </div>
      ))}
    </div>
  );
}

function HourLabels({ columns }: { columns: ColumnDef[] }) {
  return (
    <div className="relative h-[18px]">
      {columns.map((c, i) => (
        <div
          key={`${c.date}-${c.hour}`}
          style={{
            position: "absolute",
            left: i * CELL_WIDTH,
            width: CELL_WIDTH,
          }}
          className="px-1 py-0.5 text-[9px] tabular-nums text-muted-foreground text-center"
        >
          {String(c.hour).padStart(2, "0")}
        </div>
      ))}
    </div>
  );
}

function NameCell({ row }: { row: StockTimelineRow }) {
  const ready = row.currentQty > 0;
  return (
    <div
      style={{ height: ROW_HEIGHT }}
      className="flex items-center gap-2 px-3"
    >
      <span
        className={
          "size-1.5 rounded-full shrink-0 " +
          (ready ? "bg-pop-emerald" : "bg-destructive")
        }
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {row.variantName
            ? `${row.productName} — ${row.variantName}`
            : row.productName}
        </p>
      </div>
      <span className="text-[10px] tabular-nums shrink-0 text-muted-foreground">
        qty {row.currentQty}
      </span>
    </div>
  );
}

function RowCells({
  row,
  columns,
}: {
  row: StockTimelineRow;
  columns: ColumnDef[];
}) {
  // Map quick-lookup cell by "date|hour".
  const cellByKey = useMemo(() => {
    const m = new Map<string, (typeof row.cells)[number]>();
    for (const c of row.cells) m.set(`${c.date}|${c.hour}`, c);
    return m;
  }, [row.cells]);
  const max = Math.max(1, row.maxQty);

  return (
    <div
      style={{
        height: ROW_HEIGHT,
        position: "relative",
      }}
      className="border-b border-border"
    >
      {columns.map((col, i) => {
        const cell = cellByKey.get(`${col.date}|${col.hour}`);
        return (
          <div
            key={`${col.date}-${col.hour}`}
            style={{
              position: "absolute",
              left: i * CELL_WIDTH,
              top: 0,
              width: CELL_WIDTH,
              height: ROW_HEIGHT,
            }}
            className="border-r border-border/50 last:border-r-0 flex flex-col items-stretch justify-center px-1 py-0.5"
            title={
              cell
                ? `${col.date} ${String(col.hour).padStart(2, "0")}:00 — qty ${cell.qty}${cell.events > 1 ? ` · ${cell.events} event` : ""}`
                : undefined
            }
          >
            {cell && (
              <>
                <span
                  className={
                    "text-[10px] font-bold tabular-nums leading-none text-center " +
                    (cell.qty > 0
                      ? "text-foreground"
                      : "text-muted-foreground")
                  }
                >
                  {cell.qty}
                </span>
                <div className="mt-0.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={
                      "h-full " +
                      (cell.qty > 0 ? "bg-pop-emerald" : "bg-destructive/40")
                    }
                    style={{
                      width: `${Math.max(
                        cell.qty > 0 ? 6 : 0,
                        Math.round((cell.qty / max) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatDayLabel(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  // Pakai weekday + day saja supaya muat dalam 1 row tipis.
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
