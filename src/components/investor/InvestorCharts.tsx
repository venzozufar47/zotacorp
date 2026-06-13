"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  InvestorMonthlyBranchSlice,
  InvestorMonthlyRow,
} from "@/lib/investor/dashboard";
import { formatRp } from "@/lib/cashflow/format";
import {
  YEOBO_SPACE_CREDIT_CATEGORIES,
  YEOBO_SPACE_DEBIT_CATEGORIES,
} from "@/lib/cashflow/categories";
import type { YeoboBranchPnL, YeoboPnLReport } from "@/lib/cashflow/pnl-yeobo";
import type { PhotoSessionRow } from "@/lib/actions/yeobo-photo-sessions.actions";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function fmtMonth(r: { year: number; month: number }) {
  return `${MONTH_NAMES[r.month - 1]} ${String(r.year).slice(2)}`;
}
function toJt(n: number) {
  return Math.round(n / 1e6);
}

/**
 * Combined financial chart: single stacked bar per bulan.
 *
 * Composition (bottom → top):
 *   - COGS (light teal)
 *   - Opex (medium teal)
 *   - Top segment: Operating profit (hijau) ATAU Operating loss (merah)
 *
 * Bulan profitable: cogs + opex + profit (hijau) — total bar = revenue.
 *   Slice hijau di atas = "yang tersisa dari revenue setelah biaya".
 * Bulan rugi: cogs + opex + loss (merah) — total bar = total expense,
 *   yang overflow di atas level revenue. Slice merah di atas =
 *   "expense melebihi revenue sebanyak ini".
 *
 * Revenue tidak ada bar tersendiri (= tinggi bar di bulan profit, atau
 * = tinggi bar minus slice merah di bulan rugi). Tetap tampil di
 * tooltip untuk reference.
 *
 * Branch toggle: Semua / Semarang / Pare. Switch sumber data antara
 * BU-level aggregate (Semua) vs per-branch slice (`row.byBranch.X`).
 */

type SeriesKey = "cogs" | "opex" | "profit";
type BranchKey = "all" | "Semarang" | "Pare";

const SERIES_META: Record<SeriesKey, { label: string; color: string }> = {
  cogs: { label: "COGS", color: "#b5dde6" },
  opex: { label: "Opex", color: "#7fc3d4" },
  // profit/loss dijadikan satu toggle. Saat untung → slice hijau di
  // atas stack. Saat rugi → slice merah overflow di atas revenue line.
  // Sumber data: `r.operatingProfit` (yang juga sama dengan netProfit
  // di codebase ini; Investment + Dividend di-isolasi ke companyNet-
  // Dividen terpisah, tidak masuk sini).
  profit: { label: "Operating profit / loss", color: "#1d6b3a" },
};

const BRANCH_META: Record<BranchKey, string> = {
  all: "Semua cabang",
  Semarang: "Semarang",
  Pare: "Pare",
};

// Width tetap untuk sync chart × table. Kolom pertama tabel (Metrik)
// = ALIGN_METRIC_COL_W, juga = chart margin.left supaya plot area chart
// mulai di posisi sama dengan kolom bulan pertama tabel. Tiap kolom
// bulan = ALIGN_MONTH_COL_W. Dipakai untuk fixed table layout + chart
// container min-width, jadi keduanya scroll bersama secara aligned.
const ALIGN_METRIC_COL_W = 170;
const ALIGN_MONTH_COL_W = 100;

/**
 * Custom tooltip untuk FinancialOverviewChart. Revenue tidak punya bar
 * sendiri lagi (gabung ke dalam stack), tapi tetap tampil di tooltip
 * sebagai referensi top-level. Profit/loss formatted dengan label
 * "+Rp X.X jt" atau "−Rp X.X jt" supaya arahnya jelas.
 */
function FinancialTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload: { revJt: number; profitJt: number; lossJt: number };
  }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  // Filter out segment dengan value 0 supaya tooltip ringkas.
  const visibleItems = payload.filter((p) => p.value !== 0);
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #d2d2d7",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          color: "#6e6e73",
          paddingBottom: 4,
          marginBottom: 4,
          borderBottom: "1px solid #ececef",
        }}
      >
        Revenue: <strong style={{ color: "#0e7a8c" }}>Rp {row.revJt.toFixed(1)} jt</strong>
      </div>
      {visibleItems.map((item) => {
        const isLoss = item.name === "Operating loss";
        const sign = isLoss ? "−" : "";
        return (
          <div
            key={item.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                background: item.color,
                borderRadius: 2,
                display: "inline-block",
              }}
            />
            <span>
              {item.name}: {sign}Rp {item.value.toFixed(1)} jt
            </span>
          </div>
        );
      })}
    </div>
  );
}

const ZERO_SLICE: InvestorMonthlyBranchSlice = {
  revenue: 0,
  cogs: 0,
  opex: 0,
  grossProfit: 0,
  operatingProfit: 0,
};

const EMPTY_BRANCH_PNL: YeoboBranchPnL = {
  operatingRevenue: 0,
  operatingExpense: 0,
  operatingProfit: 0,
  nonOpRevenue: 0,
  nonOpExpense: 0,
  byCategory: [],
};

/**
 * Satu baris di tabel metrik gabungan. Model bersama antara kolom label
 * (sticky-left) dan kolom nilai per bulan supaya tinggi baris selalu
 * sejajar. `num` = nominal Rp, `count` = jumlah sesi, `pct` = persen,
 * `section` = header sub-bagian (Pendapatan / Beban / dst).
 */
type FinRow =
  | { kind: "section"; key: string; label: string }
  | {
      kind: "num";
      key: string;
      label: string;
      values: number[];
      accent?: boolean;
      strong?: boolean;
      indent?: boolean;
    }
  | {
      kind: "count";
      key: string;
      label: string;
      values: number[];
      strong?: boolean;
      indent?: boolean;
    }
  | {
      kind: "pct";
      key: string;
      label: string;
      values: (number | null)[];
      isGrowth: boolean;
    };

export function FinancialOverviewChart({
  rows,
  singleBranch = false,
  report,
  photoSessions,
  branchName,
}: {
  rows: InvestorMonthlyRow[];
  /** Yeobo per-cabang: tiap block sudah satu cabang → sembunyikan toggle
   *  Semua/Semarang/Pare dan selalu pakai angka block (aggregate). */
  singleBranch?: boolean;
  /** Yeobo per-cabang: laporan P&L per kategori (untuk rincian P&L yang
   *  bisa di-expand di bawah baris ringkasan). */
  report?: YeoboPnLReport;
  /** Yeobo per-cabang: data sesi foto (untuk baris "Jumlah sesi foto" +
   *  rincian per studio). Difilter ke `branchName`. */
  photoSessions?: PhotoSessionRow[];
  /** Cabang aktif — kunci ke report.byBranch & filter sesi foto. */
  branchName?: string;
}) {
  // Toggle visibility per series. Click pada legend chip → series
  // di-skip dari render → Recharts otomatis re-stack bar yang tersisa
  // (bukan jadi transparan, tapi shrink ke nilai yang masih aktif).
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    cogs: true,
    opex: true,
    profit: true,
  });
  const toggle = (k: SeriesKey) =>
    setVisible((v) => ({ ...v, [k]: !v[k] }));
  // Branch selector: scope data ke cabang tertentu atau aggregate.
  // Saat singleBranch (Yeobo per-cabang) dikunci ke "all" → angka block.
  const [branch, setBranch] = useState<BranchKey>("all");
  const effectiveBranch: BranchKey = singleBranch ? "all" : branch;
  // Toggle baris % di tabel. Di-lift ke parent karena kolom label
  // (sticky-left) dan kolom nilai (scrollable) harus rendering jumlah
  // baris yang sama supaya tinggi-nya sejajar.
  const [showPct, setShowPct] = useState(false);
  // Toggle rincian P&L per kategori (Yeobo): expand baris ringkasan jadi
  // spreadsheet penuh — Pendapatan/Beban per kategori, Laba, Non-op,
  // Sesi Foto per studio. Kolom bulan tetap sejajar chart.
  const [showDetail, setShowDetail] = useState(false);

  const data = rows.map((r) => {
    // Pilih sumber: BU-level aggregate atau per-branch slice.
    const slice =
      effectiveBranch === "all"
        ? {
            revenue: r.revenue,
            cogs: r.cogs,
            opex: r.opex,
            operatingProfit: r.operatingProfit,
          }
        : r.byBranch?.[effectiveBranch] ?? ZERO_SLICE;
    // Pakai nilai exact (tanpa Math.round) supaya nilai kecil tidak
    // ter-rounded jadi 0 dan disappear dari chart. Rounding cuma di
    // tick-formatter Y-axis (untuk display).
    const profitJtExact = slice.operatingProfit / 1e6;
    return {
      label: fmtMonth(r),
      revJt: slice.revenue / 1e6,
      cogsJt: slice.cogs / 1e6,
      opexJt: slice.opex / 1e6,
      // Profit jadi 2 series:
      //   profitJt → positive (hijau), saat untung.
      //   lossJt → positive magnitude (merah), saat rugi.
      // Keduanya selalu ≥ 0 supaya stack tetap di atas axis (tidak ada
      // bar di bawah 0). Saat untung: profitJt > 0, lossJt = 0 → slice
      // hijau di atas. Saat rugi: profitJt = 0, lossJt > 0 → slice
      // merah overflow di atas level revenue.
      profitJt: profitJtExact > 0 ? profitJtExact : 0,
      lossJt: profitJtExact < 0 ? -profitJtExact : 0,
    };
  });
  // Compute extents — semua bar selalu ≥ 0, jadi domain mulai dari 0.
  // leftMax = stack tertinggi dengan series yang aktif (kalau toggle
  // off, expand axis ikut menyusut).
  const stackTops = data.map(
    (d) =>
      (visible.cogs ? d.cogsJt : 0) +
      (visible.opex ? d.opexJt : 0) +
      (visible.profit ? d.profitJt + d.lossJt : 0)
  );
  const leftMax = stackTops.length ? Math.max(1, ...stackTops) : 1;
  // Bulatkan yMax ke kelipatan 10jt ke atas supaya tick paling atas
  // selalu round number. Min 10 supaya empty state tetap punya grid.
  const yMaxNice = Math.max(10, Math.ceil((leftMax * 1.05) / 10) * 10);
  const yDomain: [number, number] = [0, yMaxNice];
  // Grid lines:
  //   - solidTicks (kelipatan 10jt) → garis penuh + label di Y-axis.
  //   - dashedTicks (kelipatan 5jt tapi BUKAN 10jt) → garis putus-
  //     putus, tanpa label.
  const solidTicks: number[] = [];
  const dashedTicks: number[] = [];
  for (let t = 0; t <= yMaxNice; t += 5) {
    if (t % 10 === 0) solidTicks.push(t);
    else dashedTicks.push(t);
  }
  // SVG y-position untuk tiap dashed tick. Konstanta plot area harus
  // sinkron dengan ChartProps: margin.top=8, XAxis height=25.
  //   y_svg = margin.top + (1 − t/yMax) × plotHeight
  // Dipakai sebagai horizontalPoints CartesianGrid (yang selalu render
  // di layer grid, di BAWAH bars — bukan di atas seperti ReferenceLine).
  const PLOT_TOP = 8;
  const PLOT_HEIGHT = 300 - PLOT_TOP - 25;
  const dashedYPositions = dashedTicks.map(
    (t) => PLOT_TOP + (1 - t / yMaxNice) * PLOT_HEIGHT
  );

  // ── Model tabel metrik gabungan (ringkasan + rincian P&L + sesi) ──
  // Bulan = kolom (sejajar chart). Sumber ringkasan = slice yang sama
  // dgn chart; rincian per kategori + non-op = `report`; sesi = `photoSessions`.
  const hasPnl = !!(report && branchName);
  const monthLabels = rows.map((r) => fmtMonth(r));
  const monthKeys = rows.map((r) => `${r.year}-${r.month}`);
  const slices: InvestorMonthlyBranchSlice[] = rows.map((r) =>
    effectiveBranch === "all"
      ? {
          revenue: r.revenue,
          cogs: r.cogs,
          opex: r.opex,
          grossProfit: r.grossProfit,
          operatingProfit: r.operatingProfit,
        }
      : r.byBranch?.[effectiveBranch] ?? ZERO_SLICE
  );

  // P&L per kategori per bulan untuk cabang aktif (kalau ada report).
  const branchData: YeoboBranchPnL[] = rows.map((r) => {
    if (!report || !branchName) return EMPTY_BRANCH_PNL;
    const m = report.months.find(
      (x) => x.year === r.year && x.month === r.month
    );
    return m?.byBranch[branchName] ?? EMPTY_BRANCH_PNL;
  });
  // Kategori revenue/expense yang muncul di rentang — urut preset, lalu
  // kategori tak dikenal diklasifikasi by sisi (sama persis dgn admin
  // PnLYeoboSpreadsheet supaya angkanya identik).
  const seenRev = new Set<string>();
  const seenExp = new Set<string>();
  for (const d of branchData) {
    for (const c of d.byCategory) {
      if (c.kind !== "operating") continue;
      if ((YEOBO_SPACE_CREDIT_CATEGORIES as readonly string[]).includes(c.category)) {
        seenRev.add(c.category);
      } else if ((YEOBO_SPACE_DEBIT_CATEGORIES as readonly string[]).includes(c.category)) {
        seenExp.add(c.category);
      } else if (c.credit >= c.debit) {
        seenRev.add(c.category);
      } else {
        seenExp.add(c.category);
      }
    }
  }
  const orderCats = (preset: readonly string[], seen: Set<string>) => [
    ...preset.filter((c) => seen.has(c)),
    ...[...seen].filter((c) => !preset.includes(c)).sort(),
  ];
  const revenueCats = orderCats(YEOBO_SPACE_CREDIT_CATEGORIES, seenRev);
  const expenseCats = orderCats(YEOBO_SPACE_DEBIT_CATEGORIES, seenExp);
  const catNet = (d: YeoboBranchPnL, cat: string): number => {
    const c = d.byCategory.find((x) => x.category === cat);
    if (!c) return 0;
    return c.credit !== 0 ? c.credit : c.debit;
  };

  // Sesi foto per studio × bulan (cabang aktif).
  let sessions: {
    studios: string[];
    studioMonth: (s: string, i: number) => number;
    monthTotal: number[];
  } | null = null;
  if (photoSessions && branchName && photoSessions.length > 0) {
    const monthSet = new Set(monthKeys);
    const studioOrder = new Map<string, number>();
    const cell = new Map<string, number>();
    for (const s of photoSessions) {
      if (s.branch !== branchName) continue;
      const k = `${s.periodYear}-${s.periodMonth}`;
      if (!monthSet.has(k)) continue;
      if (!studioOrder.has(s.studio)) studioOrder.set(s.studio, s.sortOrder);
      const ck = `${s.studio}|${k}`;
      cell.set(ck, (cell.get(ck) ?? 0) + s.sessions);
    }
    const studios = [...studioOrder.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([s]) => s);
    if (studios.length > 0) {
      const studioMonth = (st: string, i: number) =>
        cell.get(`${st}|${monthKeys[i]}`) ?? 0;
      const monthTotal = rows.map((_, i) =>
        studios.reduce((acc, st) => acc + studioMonth(st, i), 0)
      );
      sessions = { studios, studioMonth, monthTotal };
    }
  }

  const pctDelta = (cur: number, base: number | null): number | null => {
    if (base == null) return null;
    if (Math.abs(base) < 1) return null;
    return ((cur - base) / Math.abs(base)) * 100;
  };

  // Baris selalu tampak: ringkasan + (kalau ada) Jumlah sesi foto.
  const tableRows: FinRow[] = [
    { kind: "num", key: "revenue", label: "Revenue", values: slices.map((s) => s.revenue) },
    { kind: "num", key: "gross", label: "Gross profit", values: slices.map((s) => s.grossProfit) },
    {
      kind: "num",
      key: "op",
      label: "Operating profit / loss",
      values: slices.map((s) => s.operatingProfit),
      accent: true,
    },
  ];
  if (sessions) {
    tableRows.push({
      kind: "count",
      key: "sesi",
      label: "Jumlah sesi foto",
      values: sessions.monthTotal,
      strong: true,
    });
  }
  if (showPct) {
    tableRows.push(
      {
        kind: "pct",
        key: "gm",
        label: "Gross margin",
        isGrowth: false,
        values: slices.map((s) => (s.revenue > 0 ? (s.grossProfit / s.revenue) * 100 : null)),
      },
      {
        kind: "pct",
        key: "om",
        label: "Operating margin",
        isGrowth: false,
        values: slices.map((s) => (s.revenue > 0 ? (s.operatingProfit / s.revenue) * 100 : null)),
      },
      {
        kind: "pct",
        key: "rg",
        label: "Revenue growth (MoM)",
        isGrowth: true,
        values: slices.map((s, i) => pctDelta(s.revenue, i > 0 ? slices[i - 1].revenue : null)),
      },
      {
        kind: "pct",
        key: "pg",
        label: "Profit growth (MoM)",
        isGrowth: true,
        values: slices.map((s, i) => pctDelta(s.operatingProfit, i > 0 ? slices[i - 1].operatingProfit : null)),
      }
    );
  }
  if (showDetail && hasPnl) {
    tableRows.push({ kind: "section", key: "sec-rev", label: "Pendapatan" });
    for (const cat of revenueCats) {
      tableRows.push({ kind: "num", key: `rev-${cat}`, label: cat, indent: true, values: branchData.map((d) => catNet(d, cat)) });
    }
    tableRows.push({ kind: "num", key: "tot-rev", label: "Total Pendapatan", strong: true, values: branchData.map((d) => d.operatingRevenue) });
    tableRows.push({ kind: "section", key: "sec-exp", label: "Beban Operasional" });
    for (const cat of expenseCats) {
      tableRows.push({ kind: "num", key: `exp-${cat}`, label: cat, indent: true, values: branchData.map((d) => catNet(d, cat)) });
    }
    tableRows.push({ kind: "num", key: "tot-exp", label: "Total Beban", strong: true, values: branchData.map((d) => d.operatingExpense) });
    tableRows.push({ kind: "num", key: "laba", label: "Laba Operasional", strong: true, accent: true, values: branchData.map((d) => d.operatingProfit) });
    // Baris non-operasional (Masuk/Keluar/Net non-op) dihapus — tidak
    // insightful per cabang.
    if (sessions) {
      const sess = sessions;
      tableRows.push({ kind: "section", key: "sec-sesi", label: "Sesi Foto" });
      for (const st of sess.studios) {
        tableRows.push({ kind: "count", key: `sesi-${st}`, label: st, indent: true, values: rows.map((_, i) => sess.studioMonth(st, i)) });
      }
      tableRows.push({ kind: "count", key: "sesi-total", label: "Total Sesi", strong: true, values: sess.monthTotal });
      tableRows.push({ kind: "num", key: "rev-per-sesi", label: "Revenue / sesi", values: branchData.map((d, i) => (sess.monthTotal[i] > 0 ? d.operatingRevenue / sess.monthTotal[i] : 0)) });
    }
  }

  return (
    <div>
      {/* Branch selector — segmented pill. Disembunyikan saat singleBranch
          (Yeobo per-cabang: block sudah satu cabang). */}
      {!singleBranch && (
      <div className="flex items-center gap-1 mb-3 p-0.5 rounded-full bg-muted/60 w-fit">
        {(Object.keys(BRANCH_META) as BranchKey[]).map((k) => {
          const active = branch === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setBranch(k)}
              aria-pressed={active}
              className={`press-feedback px-3 py-1 rounded-full text-[11px] font-semibold transition ${
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {BRANCH_META[k]}
            </button>
          );
        })}
      </div>
      )}
      {/* Legend dengan toggle. Click → hide/show series. Active state
          ditunjukkan dengan swatch berwarna penuh; inactive = outline
          + opacity rendah. */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(Object.keys(SERIES_META) as SeriesKey[]).map((k) => {
          const meta = SERIES_META[k];
          const active = visible[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={active}
              className={`press-feedback inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px] font-medium transition ${
                active
                  ? "bg-card border border-border text-foreground"
                  : "border border-border/60 text-muted-foreground line-through opacity-60 hover:opacity-100"
              }`}
            >
              <span
                className="size-2.5 rounded-sm"
                style={{
                  background: active ? meta.color : "transparent",
                  border: active ? "none" : "1.5px solid currentColor",
                }}
              />
              {meta.label}
            </button>
          );
        })}
      </div>
      {/* Shared horizontal scroll: chart + table scroll bersamaan.
          Layout flex 2-kolom:
            - Sticky-left panel (ALIGN_METRIC_COL_W): Y-axis labels +
              Metric column. Tetap visible saat scroll.
            - Scrollable panel: main chart bars + month columns table.
          Trik dual-chart: Recharts YAxis tidak bisa di-sticky terpisah
          dari plot area karena keduanya dalam SVG yang sama. Solusi:
          render mini chart Y-axis-only di sticky panel + main chart
          (YAxis hide) di scrollable panel. Keduanya share yDomain,
          height, margin.top/bottom → grid positions match. */}
      <div className="overflow-x-auto">
        <div
          className="flex"
          style={{
            minWidth: ALIGN_METRIC_COL_W + data.length * ALIGN_MONTH_COL_W,
          }}
        >
          {/* Sticky-left: Y-axis labels (HTML, absolute-positioned)
              + metric column table. Pakai HTML manual karena Recharts
              YAxis tidak render labels tanpa data series, dan dual-
              chart hack rentan miss-align. Labels ditempatkan presisi
              dengan rumus posisi grid line yang sama dengan main
              chart: y = margin.top + (1 − t/yMax) × plotHeight. */}
          <div
            className="sticky left-0 z-10 bg-card"
            style={{ width: ALIGN_METRIC_COL_W, flexShrink: 0 }}
          >
            <div
              style={{
                height: 300,
                position: "relative",
              }}
              aria-hidden="false"
            >
              {solidTicks.map((t) => {
                // plotHeight = chartHeight − margin.top − xAxisHeight
                // = 300 − 8 − 25 = 267. Match main chart's plot area.
                const plotHeight = 300 - 8 - 25;
                const yPos = 8 + (1 - t / yMaxNice) * plotHeight;
                return (
                  <span
                    key={t}
                    style={{
                      position: "absolute",
                      top: yPos,
                      right: 8,
                      transform: "translateY(-50%)",
                      fontSize: 10,
                      color: "#6e6e73",
                    }}
                    className="tabular-nums"
                  >
                    {Math.round(t)}jt
                  </span>
                );
              })}
            </div>
            <MetricLabelColumn rows={tableRows} />
          </div>
          {/* Scrollable: main chart + month-columns table */}
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                {/* Dashed grid untuk kelipatan 5jt. Pakai CartesianGrid
                    kedua (bukan ReferenceLine) supaya selalu render di
                    layer grid — di belakang bars, tidak motong stack. */}
                <CartesianGrid
                  stroke="#d2d2d7"
                  strokeDasharray="3 3"
                  vertical={false}
                  horizontalPoints={dashedYPositions}
                />
                <CartesianGrid stroke="#d2d2d7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#6e6e73" }}
                  axisLine={false}
                  tickLine={false}
                  height={25}
                />
                <YAxis domain={yDomain} ticks={solidTicks} hide />
                <Tooltip
                  content={<FinancialTooltip />}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                {visible.cogs && (
                  <Bar
                    dataKey="cogsJt"
                    stackId="fin"
                    name="COGS"
                    fill={SERIES_META.cogs.color}
                    isAnimationActive={false}
                  />
                )}
                {visible.opex && (
                  <Bar
                    dataKey="opexJt"
                    stackId="fin"
                    name="Opex"
                    fill={SERIES_META.opex.color}
                    isAnimationActive={false}
                  />
                )}
                {visible.profit && (
                  <Bar
                    dataKey="profitJt"
                    stackId="fin"
                    name="Operating profit"
                    fill={SERIES_META.profit.color}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                )}
                {visible.profit && (
                  <Bar
                    dataKey="lossJt"
                    stackId="fin"
                    name="Operating loss"
                    fill="#b42234"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            <MonthValuesTable rows={tableRows} monthLabels={monthLabels} />
          </div>
        </div>
      </div>
      {/* Kontrol expand: rincian P&L per kategori (Yeobo) + detail %. */}
      <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
        {hasPnl && (
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
            className="press-feedback inline-flex items-center gap-1 text-[11px] font-semibold text-foreground hover:text-primary transition-colors"
          >
            {showDetail ? "Tutup rincian P&L" : "Rincian P&L per kategori"}
            <ChevronDown
              size={13}
              strokeWidth={2.4}
              className="transition-transform"
              style={{ transform: showDetail ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowPct((v) => !v)}
          aria-expanded={showPct}
          className="press-feedback inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPct ? "Sembunyikan" : "Detail"} %
          <ChevronDown
            size={12}
            strokeWidth={2.4}
            className="transition-transform"
            style={{ transform: showPct ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
      </div>
    </div>
  );
}

/**
 * Kolom label metrik (sticky-left). Render label tiap baris dari model
 * `rows` yang sama dengan MonthValuesTable supaya tinggi baris sejajar.
 * Lebar fixed = ALIGN_METRIC_COL_W untuk sync dengan chart di atasnya.
 */
function MetricLabelColumn({ rows }: { rows: FinRow[] }) {
  return (
    <table
      className="text-[11px] border-separate border-spacing-0"
      style={{ tableLayout: "fixed", width: ALIGN_METRIC_COL_W }}
    >
      <thead>
        <tr>
          <th
            scope="col"
            className="text-left px-3 py-2 font-semibold text-muted-foreground border-b border-border whitespace-nowrap"
          >
            Metrik
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          if (row.kind === "section") {
            return (
              <tr key={row.key}>
                <th
                  scope="row"
                  style={{ height: 26 }}
                  className="text-left px-3 align-middle font-semibold text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border whitespace-nowrap"
                >
                  {row.label}
                </th>
              </tr>
            );
          }
          const isPct = row.kind === "pct";
          const strong = "strong" in row && row.strong;
          return (
            <tr key={row.key}>
              <th
                scope="row"
                title={row.label}
                className={
                  "text-left px-3 py-1.5 border-b border-border/50 whitespace-nowrap overflow-hidden text-ellipsis " +
                  ("indent" in row && row.indent ? "pl-6 " : "") +
                  (isPct
                    ? "bg-muted/30 text-muted-foreground "
                    : "text-foreground ") +
                  (strong ? "font-semibold " : "font-medium ")
                }
              >
                {row.label}
              </th>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Kolom nilai per bulan (scrollable). Render dari model `rows` yang sama
 * dengan MetricLabelColumn → tinggi tiap baris match. Lebar kolom fixed
 * ALIGN_MONTH_COL_W supaya sejajar dengan bar chart di atasnya.
 */
function MonthValuesTable({
  rows,
  monthLabels,
}: {
  rows: FinRow[];
  monthLabels: string[];
}) {
  const n = monthLabels.length;
  const renderNum = (val: number, accent?: boolean): React.ReactNode => {
    const negative = val < 0;
    const color = negative
      ? "var(--destructive, #b42234)"
      : accent && val > 0
        ? "#1d6b3a"
        : "inherit";
    return (
      <span style={{ color }}>
        {negative ? "−" : ""}
        {formatRp(Math.abs(val))}
      </span>
    );
  };
  const renderPct = (
    val: number | null,
    isGrowth: boolean
  ): React.ReactNode => {
    if (val == null) return <span className="text-muted-foreground">—</span>;
    if (isGrowth) {
      let color = "inherit";
      let prefix = "";
      if (val > 0.5) {
        color = "#1d6b3a";
        prefix = "+";
      } else if (val < -0.5) {
        color = "#b42234";
        prefix = "−";
      }
      return (
        <span style={{ color }} className="tabular-nums font-semibold">
          {prefix}
          {Math.abs(val).toFixed(1)}%
        </span>
      );
    }
    return (
      <span className="tabular-nums">
        {val < 0 ? "−" : ""}
        {Math.abs(val).toFixed(1)}%
      </span>
    );
  };
  const fmtCount = (v: number) =>
    new Intl.NumberFormat("id-ID").format(Math.round(v));
  return (
    <table
      className="text-[11px] border-separate border-spacing-0"
      style={{ tableLayout: "fixed", width: n * ALIGN_MONTH_COL_W }}
    >
      <colgroup>
        {monthLabels.map((_, i) => (
          <col key={i} style={{ width: ALIGN_MONTH_COL_W }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {monthLabels.map((l, i) => (
            <th
              key={i}
              scope="col"
              className="text-right px-2 py-2 font-semibold text-muted-foreground border-b border-border whitespace-nowrap overflow-hidden"
            >
              {l}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          if (row.kind === "section") {
            return (
              <tr key={row.key}>
                {Array.from({ length: n }).map((_, i) => (
                  <td
                    key={i}
                    style={{ height: 26 }}
                    className="bg-muted/40 border-b border-border"
                  />
                ))}
              </tr>
            );
          }
          const strong = "strong" in row && row.strong ? "font-semibold " : "";
          return (
            <tr key={row.key}>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className={
                    "text-right px-2 py-1.5 border-b border-border/50 whitespace-nowrap overflow-hidden text-ellipsis " +
                    (row.kind === "pct" ? "bg-muted/30 " : "tabular-nums ") +
                    strong
                  }
                >
                  {row.kind === "pct"
                    ? renderPct(v, row.isGrowth)
                    : row.kind === "count"
                      ? fmtCount(v as number)
                      : renderNum(v as number, row.accent)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Net dividen chart: bar per-bulan owner-level net dividend
 * (Investment + Dividend categories di cashflow). Owner-POV:
 *   - positif → owner menarik dividen bulan ini (bar ke atas, hijau)
 *   - negatif → owner menyetor modal (bar ke bawah, merah)
 * Bulan netral = 0 → bar tidak terlihat.
 *
 * Konvensi warna mengikuti operating profit/loss di chart finansial:
 * hijau = positif/menarik, merah = negatif/menyetor. Bukan dimensi
 * "baik/buruk" tapi semata-mata "naik/turun" relatif terhadap baseline.
 *
 * Sumber data: `r.netDividen` di InvestorMonthlyRow (= companyNetDividen
 * di PnL aggregator). Sama persis dengan angka "Net Dividen − Investment"
 * di admin finance dashboard, hanya scope-nya bulan-bulan periode
 * yang investor pilih.
 */
export function NetDividenChart({ rows }: { rows: InvestorMonthlyRow[] }) {
  const data = rows.map((r) => ({
    label: fmtMonth(r),
    // SATU series netJt yang bisa positif/negatif. Per-bulan dapat
    // warna lewat <Cell> di bawah supaya tidak ada slot bar yang
    // ter-reserved kosong (yang bikin gap rapat-jeda).
    netJt: r.netDividen / 1e6,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#e6e6ea" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6e6e73" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) =>
            Math.abs(v) >= 1
              ? `${Math.round(v)}jt`
              : `${Math.round(v * 1000)}rb`
          }
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #d2d2d7",
          }}
          formatter={
            ((v: number) => {
              if (v === 0) return null;
              const sign = v < 0 ? "−" : "+";
              const label =
                v > 0 ? "Tarikan dividen owner" : "Setoran modal owner";
              return [`${sign}Rp ${Math.abs(v).toFixed(1)} jt`, label];
            }) as never
          }
        />
        <Bar dataKey="netJt" name="Net dividen" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.netJt >= 0 ? "#1d6b3a" : "#b42234"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

