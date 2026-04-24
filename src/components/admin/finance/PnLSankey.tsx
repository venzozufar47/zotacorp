"use client";

import { useMemo } from "react";
import type { PnLReport } from "@/lib/cashflow/pnl";

/**
 * Sankey-style Income Statement — port of the Claude Design mockup
 * `Haengbocake Flowchart.html` yang dikirim user. Geometri, skala, dan
 * palet dipertahankan 1:1 dari desain (viewBox 1600×900, kolom-kolom
 * tetap di x yang sama) supaya layout bisa dibaca sekali pandang
 * seperti Alphabet income-statement chart.
 *
 * Data sumber: `PnLReport` yang sama yang dipakai tabel/chart lain di
 * halaman PnL. Total di-aggregate lintas seluruh rentang bulan +
 * kedua cabang (Semarang & Pare). Net Dividen pakai
 * `companyNetDividen` (terpusat). Retained = Operating Profit − Net
 * Dividen.
 */

interface Props {
  report: PnLReport;
}

const COGS_CATEGORY = "Cost of Goods Sold";

/** Rupiah compact: "Rp 1.8M" untuk 1.8 miliar, "Rp 400jt", dst. */
function fmt(rp: number): string {
  const abs = Math.abs(rp);
  const sign = rp < 0 ? "−" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000).toLocaleString("id-ID")}rb`;
  }
  return `${sign}Rp ${Math.round(abs).toLocaleString("id-ID")}`;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function periodLabel(
  from: { year: number; month: number },
  to: { year: number; month: number }
): string {
  const f = `${MONTH_NAMES[from.month - 1]} ${from.year}`;
  const t = `${MONTH_NAMES[to.month - 1]} ${to.year}`;
  if (from.year === to.year && from.month === to.month) return f;
  return `${f} – ${t}`;
}

interface LeafDatum {
  id: string;
  label: string;
  amt: number;
  sub?: string;
  yy?: string;
  cls: "rev" | "profit" | "exp" | "other" | "ink";
}

interface SankeyNode {
  id: string;
  x: number;
  y: number;
  h: number;
  amt: number;
  cls: "rev" | "profit" | "exp" | "other" | "ink";
  label?: string;
  sub?: string;
  yy?: string;
  labelY?: number;
  /**
   * Kalau di-set, formatter label pakai angka ini alih-alih `amt`.
   * Dipakai untuk Net Dividen ketika shortfall > 0: bar di-size pakai
   * `dividendFromOp` (konsisten dengan ribbon), tapi label wajib
   * menampilkan total aktual yang dibayarkan ke owner.
   */
  displayAmt?: number;
}

interface Flow {
  f: string;
  t: string;
  a: number;
  c: "rev" | "profit" | "exp" | "other" | "ink";
}

export function PnLSankey({ report }: Props) {
  const computed = useMemo(() => {
    // Agregat operating revenue & expense per-kategori lintas semua
    // bulan & kedua cabang. Non-op (Wealth Transfer/Pinjaman) di-skip
    // karena Sankey ini khusus income statement operating.
    const revByCat = new Map<string, number>();
    const expByCat = new Map<string, number>();
    let companyNetDividen = 0;

    for (const m of report.months) {
      companyNetDividen += m.companyNetDividen;
      for (const branch of [m.byBranch.Semarang, m.byBranch.Pare]) {
        for (const c of branch.byCategory) {
          if (c.kind !== "operating") continue;
          if (c.credit > 0) {
            revByCat.set(c.category, (revByCat.get(c.category) ?? 0) + c.credit);
          }
          if (c.debit > 0) {
            expByCat.set(c.category, (expByCat.get(c.category) ?? 0) + c.debit);
          }
        }
      }
    }

    // Revenue leaves, sorted desc.
    const revLeaves: LeafDatum[] = Array.from(revByCat.entries())
      .map(([label, amt]) => ({
        id: `rev:${label}`,
        label,
        amt,
        cls: label === "Other Revenue" ? ("other" as const) : ("rev" as const),
      }))
      .sort((a, b) => b.amt - a.amt);

    const revenueTotal = revLeaves.reduce((s, r) => s + r.amt, 0);
    const cogs = expByCat.get(COGS_CATEGORY) ?? 0;
    const grossProfit = Math.max(0, revenueTotal - cogs);

    const opexLeaves: LeafDatum[] = Array.from(expByCat.entries())
      .filter(([label]) => label !== COGS_CATEGORY)
      .map(([label, amt]) => ({
        id: `exp:${label}`,
        label,
        amt,
        cls: "exp" as const,
      }))
      .sort((a, b) => b.amt - a.amt);

    const opexTotal = opexLeaves.reduce((s, r) => s + r.amt, 0);
    const opProfit = Math.max(0, grossProfit - opexTotal);
    const actualNetDividen = Math.max(0, companyNetDividen);
    // Shortfall = dividen dibayarkan melebihi laba operasi. Biasanya
    // berarti owner menarik dari saldo kas akumulasi (retained
    // earnings periode sebelumnya), cadangan, atau pinjaman. Sankey
    // geometri TIDAK bisa merepresentasikan ini dari sumber op-profit
    // saja — kita clamp ribbon ke opProfit dan surface selisih di
    // banner + sub-label Net Dividen supaya angka total tetap jujur.
    const dividendFromOp = Math.min(actualNetDividen, opProfit);
    const shortfall = Math.max(0, actualNetDividen - opProfit);
    const retained = Math.max(0, opProfit - actualNetDividen);

    return {
      revLeaves,
      revenueTotal,
      cogs,
      grossProfit,
      opexLeaves,
      opexTotal,
      opProfit,
      actualNetDividen,
      dividendFromOp,
      shortfall,
      retained,
    };
  }, [report]);

  // Jika belum ada revenue sama sekali, tampilkan placeholder dan
  // skip geometry calculation (yang akan bagi-nol pada PX_PER_UNIT).
  if (computed.revenueTotal <= 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Belum ada revenue operasional di rentang ini — Sankey income
          statement tidak bisa digambar.
        </p>
      </div>
    );
  }

  // ===== Layout (port persis dari desain, x/y di viewBox 1600×900) =====
  const COL = { src: 220, rev: 540, gross: 830, op: 1090, leaf: 1400 };
  const CH_TOP = 170;
  const CH_BOT = 790;
  const CH_H = CH_BOT - CH_TOP;
  const PX_PER_UNIT = CH_H / computed.revenueTotal;
  const BAR_W = 18;
  const GAP = 14;

  const makeNode = (
    id: string,
    x: number,
    y: number,
    amt: number,
    cls: SankeyNode["cls"],
    extra: Partial<SankeyNode> = {}
  ): SankeyNode => ({
    id,
    x,
    y,
    h: Math.max(3, amt * PX_PER_UNIT),
    amt,
    cls,
    ...extra,
  });

  // Sources: small leaves stacked on top, largest (Sales) at bottom
  // — persis seperti desain final setelah iterasi.
  const MIN_SRC = 46;
  const sortedDesc = [...computed.revLeaves];
  const largest = sortedDesc.shift();
  const smallSources = sortedDesc;

  let sy = CH_TOP;
  const srcNodes: SankeyNode[] = [];
  for (const s of smallSources) {
    const realH = Math.max(3, s.amt * PX_PER_UNIT);
    const slotH = Math.max(MIN_SRC, realH);
    const yCenter = sy + slotH / 2;
    srcNodes.push(
      makeNode(s.id, COL.src, yCenter - realH / 2, s.amt, s.cls, {
        label: s.label,
        sub: s.sub,
        yy: s.yy,
        labelY: yCenter,
      })
    );
    sy += slotH + GAP;
  }
  if (largest) {
    const realH = Math.max(3, largest.amt * PX_PER_UNIT);
    srcNodes.push(
      makeNode(largest.id, COL.src, sy, largest.amt, largest.cls, {
        label: largest.label,
        sub: largest.sub,
        yy: largest.yy,
        labelY: sy + realH / 2,
      })
    );
  }

  const revNode = makeNode("revenue", COL.rev, CH_TOP, computed.revenueTotal, "rev", {
    label: "Revenue",
  });
  const grossNode = makeNode("gross", COL.gross, CH_TOP, computed.grossProfit, "profit", {
    label: "Gross profit",
    yy: `${Math.round((computed.grossProfit / computed.revenueTotal) * 100)}% margin`,
  });
  const cogsNode = makeNode(
    "cogs",
    COL.gross,
    grossNode.y + grossNode.h + GAP * 2,
    computed.cogs,
    "exp",
    { label: "Cost of revenues", sub: "Cost of Goods Sold" }
  );
  const opProfitNode = makeNode("op", COL.op, CH_TOP, computed.opProfit, "profit", {
    label: "Operating profit",
    yy: `${Math.round((computed.opProfit / computed.revenueTotal) * 100)}% margin`,
  });

  // Shortfall node: ditempatkan di kolom Op tepat di bawah opProfit
  // (dengan GAP) supaya ribbon ke Net Dividen cuma menyeberang
  // HORIZONTAL dari COL.op ke COL.leaf — sama dengan op→dividend —
  // tidak melintasi area opex leaves. Op + PrevRetained bar bentuk
  // stack vertikal di kolom yang sama, terpisah visual oleh GAP.
  const prevRetainedNode =
    computed.shortfall > 0
      ? makeNode(
          "prevRetained",
          COL.op,
          opProfitNode.y + opProfitNode.h + GAP,
          computed.shortfall,
          "ink",
          {
            label: "Saldo akumulasi",
            sub: "Retained earnings periode sebelumnya",
          }
        )
      : null;

  // Opex bar selalu di bawah stack (opProfit + prevRetained), pakai
  // GAP*3 sebagai pemisah visual. Kalau tidak ada shortfall,
  // opexNode.y = opProfit bottom + GAP*3 (behaviour lama).
  const stackBottom = prevRetainedNode
    ? prevRetainedNode.y + prevRetainedNode.h
    : opProfitNode.y + opProfitNode.h;
  const opexNode = makeNode(
    "opex",
    COL.op,
    stackBottom + GAP * 3,
    computed.opexTotal,
    "exp",
    { label: "Operating expenses" }
  );

  // Right leaves (net dividen + retained) di kolom leaf, align di
  // atas dengan opProfitNode. Bar Net Dividen di-size terhadap total
  // actualNetDividen — shortfall (kalau ada) divisualisasi sebagai
  // ribbon tambahan dari `prevRetained` node ke Net Dividen.
  let ly = opProfitNode.y;
  const netDivNode = makeNode(
    "dividend",
    COL.leaf,
    ly,
    computed.actualNetDividen,
    "profit",
    {
      label: "Net Dividen",
      sub: "Owner payout (company-wide)",
    }
  );
  ly += netDivNode.h + GAP;
  const retainedNode = makeNode("retained", COL.leaf, ly, computed.retained, "ink", {
    label: "Retained",
    sub: "Tersimpan di bisnis",
  });


  // Opex leaves: MIN slot height supaya label tidak numpuk.
  const MIN_LEAF = 44;
  let ey = opexNode.y;
  const opexLeafNodes: SankeyNode[] = [];
  for (const d of computed.opexLeaves) {
    const realH = Math.max(3, d.amt * PX_PER_UNIT);
    const slotH = Math.max(MIN_LEAF, realH);
    const yCenter = ey + slotH / 2;
    opexLeafNodes.push(
      makeNode(d.id, COL.leaf, yCenter - realH / 2, d.amt, "exp", {
        label: d.label,
        sub: d.sub,
        labelY: yCenter,
      })
    );
    ey += slotH + 4;
  }

  const allNodes = [
    ...srcNodes,
    revNode,
    grossNode,
    cogsNode,
    opProfitNode,
    opexNode,
    netDivNode,
    retainedNode,
    ...opexLeafNodes,
    ...(prevRetainedNode ? [prevRetainedNode] : []),
  ];

  // Opex leaves numpuk ke bawah: kalau jumlah kategori banyak atau
  // opex > operating profit, tumpukan bisa lewat CH_BOT=790 dan bahkan
  // viewBox default 900. Hitung ekstensi dinamis + padding bawah untuk
  // label kecil, sehingga svg viewBox membesar supaya tidak terpotong.
  const bottomMostY = allNodes.reduce(
    (max, n) => Math.max(max, n.y + n.h),
    0
  );
  const VIEWBOX_MIN_H = 900;
  const BOTTOM_PADDING = 40; // ruang untuk label kecil di bawah bar
  const viewBoxH = Math.max(
    VIEWBOX_MIN_H,
    Math.ceil(bottomMostY + BOTTOM_PADDING)
  );
  const nodeById = Object.fromEntries(allNodes.map((n) => [n.id, n]));

  // Flows (urutan penting — menentukan urutan stacking ribbon di
  // kedua sisi node yang sama).
  const flows: Flow[] = [];
  for (const s of srcNodes) {
    flows.push({ f: s.id, t: "revenue", a: s.amt, c: s.cls });
  }
  flows.push({ f: "revenue", t: "gross", a: computed.grossProfit, c: "profit" });
  flows.push({ f: "revenue", t: "cogs", a: computed.cogs, c: "exp" });
  flows.push({ f: "gross", t: "op", a: computed.opProfit, c: "profit" });
  flows.push({ f: "gross", t: "opex", a: computed.opexTotal, c: "exp" });
  flows.push({ f: "op", t: "dividend", a: computed.dividendFromOp, c: "profit" });
  if (prevRetainedNode) {
    // Shortfall ribbon: masuk setelah op→dividend jadi dia isi bagian
    // BAWAH bar Net Dividen (order di `flows` menentukan stacking).
    flows.push({
      f: "prevRetained",
      t: "dividend",
      a: computed.shortfall,
      c: "ink",
    });
  }
  flows.push({ f: "op", t: "retained", a: computed.retained, c: "ink" });
  for (const d of computed.opexLeaves) {
    flows.push({ f: "opex", t: d.id, a: d.amt, c: "exp" });
  }

  // Cursor di sisi out/in tiap node.
  const outC: Record<string, number> = {};
  const inC: Record<string, number> = {};
  for (const n of allNodes) {
    outC[n.id] = n.y;
    inC[n.id] = n.y;
  }

  // Palet di-remap ke semantic theme tokens supaya Sankey ikut theme
  // aktif (Oceanic Editorial, Playful, dsb.) alih-alih hardcode hex
  // dari desain. Ribbon dirender dengan fill=var(...) + fillOpacity
  // sehingga transparansi konsisten meski theme berubah warna dasarnya.
  const BAR_COLOR: Record<Flow["c"], string> = {
    rev: "var(--primary)",
    profit: "var(--success)",
    exp: "var(--destructive)",
    other: "var(--warning)",
    ink: "var(--foreground)",
  };
  const FILL_OPACITY: Record<Flow["c"], number> = {
    rev: 0.55,
    profit: 0.5,
    exp: 0.45,
    other: 0.6,
    ink: 0.3,
  };

  const ribbonPaths: Array<{
    d: string;
    fill: string;
    opacity: number;
    key: string;
  }> = [];
  for (let i = 0; i < flows.length; i++) {
    const f = flows[i];
    const a = nodeById[f.f];
    const b = nodeById[f.t];
    if (!a || !b) continue;
    const h = f.a * PX_PER_UNIT;
    const y1a = outC[a.id];
    const y1b = y1a + h;
    const y2a = inC[b.id];
    const y2b = y2a + h;
    outC[a.id] = y1b;
    inC[b.id] = y2b;
    const x1 = a.x + BAR_W;
    const x2 = b.x;
    const cx = (x1 + x2) / 2;
    const d = `M ${x1} ${y1a} C ${cx} ${y1a}, ${cx} ${y2a}, ${x2} ${y2a} L ${x2} ${y2b} C ${cx} ${y2b}, ${cx} ${y1b}, ${x1} ${y1b} Z`;
    ribbonPaths.push({
      d,
      fill: BAR_COLOR[f.c] ?? BAR_COLOR.ink,
      opacity: FILL_OPACITY[f.c] ?? FILL_OPACITY.ink,
      key: `${f.f}->${f.t}:${i}`,
    });
  }

  // ===== Label rendering helpers (JSX-native port) =====
  type LabelSide = "left" | "right" | "top";
  interface LabelProps {
    node: SankeyNode;
    side: LabelSide;
    w?: number;
    h?: number;
    topOffset?: number;
    sm?: boolean;
  }
  const labels: Array<{ key: string; props: LabelProps }> = [];

  for (const n of srcNodes) {
    labels.push({ key: `lbl:${n.id}`, props: { node: n, side: "left", w: 210, h: 80 } });
  }
  labels.push({ key: "lbl:revenue", props: { node: revNode, side: "top", topOffset: 70, w: 200 } });
  labels.push({ key: "lbl:gross", props: { node: grossNode, side: "top", topOffset: 70, w: 200 } });
  labels.push({ key: "lbl:op", props: { node: opProfitNode, side: "top", topOffset: 70, w: 200 } });
  labels.push({ key: "lbl:opex", props: { node: opexNode, side: "top", topOffset: 38, w: 170, sm: true } });
  labels.push({ key: "lbl:netdiv", props: { node: netDivNode, side: "right", w: 220 } });
  if (computed.retained > 0) {
    labels.push({
      key: "lbl:retained",
      props: { node: retainedNode, side: "right", w: 220 },
    });
  }
  if (prevRetainedNode) {
    labels.push({
      key: "lbl:prevRetained",
      props: { node: prevRetainedNode, side: "left", w: 170, h: 60, sm: true },
    });
  }
  for (const n of opexLeafNodes) {
    labels.push({ key: `lbl:${n.id}`, props: { node: n, side: "right", w: 200, h: 56, sm: true } });
  }

  function renderLabel({ node, side, w = 200, h = 90, topOffset, sm }: LabelProps) {
    let lx: number;
    let ly: number;
    let textAlign: "left" | "right" | "center";
    if (side === "left") {
      lx = node.x - w - 12;
      const centerY = node.labelY !== undefined ? node.labelY : node.y + node.h / 2;
      ly = centerY - 32;
      textAlign = "right";
    } else if (side === "right") {
      lx = node.x + BAR_W + 12;
      const centerY = node.labelY !== undefined ? node.labelY : node.y + node.h / 2;
      ly = centerY - 20;
      textAlign = "left";
    } else {
      lx = node.x + BAR_W / 2 - w / 2;
      ly = node.y - (topOffset ?? 64);
      textAlign = "center";
    }
    return (
      <foreignObject x={lx} y={ly} width={w} height={h}>
        <div
          className={`sankey-lbl sankey-${node.cls}${sm ? " sankey-sm" : ""}`}
          style={{ textAlign }}
        >
          {node.label ? <div className="sankey-nm">{node.label}</div> : null}
          <div className="sankey-amt">{fmt(node.displayAmt ?? node.amt)}</div>
          {node.yy ? <div className="sankey-yy">{node.yy}</div> : null}
          {node.sub ? <div className="sankey-ext">{node.sub}</div> : null}
        </div>
      </foreignObject>
    );
  }

  // COGS label — ditaruh di SISI KANAN bar, bukan kiri, supaya tidak
  // numpang di atas ribbon Revenue→COGS yang warnanya merah (kontras
  // jadi buruk: teks merah di atas ribbon merah). Sisi kanan bar COGS
  // adalah area kosong (tidak ada flow keluar dari COGS) jadi teks
  // terbaca jelas di atas background card.
  function renderMidLabel(node: SankeyNode) {
    const w = 180;
    const lx = node.x + BAR_W + 12;
    const ly = node.y + node.h / 2 - 28;
    return (
      <foreignObject x={lx} y={ly} width={w} height={80}>
        <div
          className={`sankey-lbl sankey-${node.cls}`}
          style={{ textAlign: "left" }}
        >
          {node.label ? <div className="sankey-nm">{node.label}</div> : null}
          <div className="sankey-amt">{fmt(node.displayAmt ?? node.amt)}</div>
          {node.sub ? <div className="sankey-ext">{node.sub}</div> : null}
        </div>
      </foreignObject>
    );
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden sankey-card">
      {/* Warna bg, font, dan palet disimpan self-contained di scope
          .sankey-card supaya tidak bocor ke komponen lain. */}
      <style>{`
        .sankey-card { background: var(--card); color: var(--foreground); }
        .sankey-card .sankey-head {
          text-align: center; padding: 10px 24px 0;
        }
        .sankey-card h3.sankey-title {
          margin: 0; font-weight: 800; letter-spacing: -0.01em;
          font-size: clamp(16px, 1.8vw, 22px);
          color: var(--foreground); line-height: 1.15;
        }
        .sankey-card .sankey-sub {
          margin-top: 2px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--muted-foreground);
        }
        .sankey-card svg.sankey { margin-top: -4px; }
        .sankey-card svg.sankey { display: block; width: 100%; height: auto; }
        .sankey-card .sankey-lbl { font-family: inherit; line-height: 1.15; color: var(--foreground); }
        .sankey-card .sankey-lbl .sankey-amt { font-size: 19px; font-weight: 800; }
        .sankey-card .sankey-lbl .sankey-nm  { font-size: 16px; font-weight: 800; }
        .sankey-card .sankey-lbl .sankey-yy  { font-size: 11px; font-weight: 700; color: var(--muted-foreground); margin-top: 1px; }
        .sankey-card .sankey-lbl .sankey-ext { font-size: 10.5px; font-weight: 600; color: var(--muted-foreground); margin-top: 2px; line-height: 1.3; }
        .sankey-card .sankey-lbl.sankey-sm .sankey-amt { font-size: 14px; }
        .sankey-card .sankey-lbl.sankey-sm .sankey-nm  { font-size: 13px; }
        .sankey-card .sankey-lbl.sankey-sm .sankey-ext { font-size: 10px; }
        .sankey-card .sankey-lbl.sankey-rev   .sankey-amt,
        .sankey-card .sankey-lbl.sankey-rev   .sankey-nm  { color: var(--primary); }
        .sankey-card .sankey-lbl.sankey-profit .sankey-amt,
        .sankey-card .sankey-lbl.sankey-profit .sankey-nm { color: var(--success); }
        .sankey-card .sankey-lbl.sankey-exp    .sankey-amt,
        .sankey-card .sankey-lbl.sankey-exp    .sankey-nm { color: var(--destructive); }
        .sankey-card .sankey-lbl.sankey-other  .sankey-amt,
        .sankey-card .sankey-lbl.sankey-other  .sankey-nm { color: var(--warning); }
        .sankey-card .sankey-lbl.sankey-ink    .sankey-amt,
        .sankey-card .sankey-lbl.sankey-ink    .sankey-nm { color: var(--foreground); }
        .sankey-card .sankey-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 24px 14px; font-size: 11px; font-weight: 700;
          color: var(--muted-foreground); gap: 12px; flex-wrap: wrap;
          border-top: 1px solid var(--border);
        }
        .sankey-card .sankey-footer .sankey-mid { color: var(--primary); }
        .sankey-card .sankey-footer .sankey-brand { color: var(--foreground); }
        .sankey-card .sankey-notice {
          margin: 10px 24px 0; padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid var(--warning);
          background: color-mix(in srgb, var(--warning) 12%, transparent);
          color: var(--foreground);
          font-size: 12px; font-weight: 500; line-height: 1.4;
          text-align: left;
        }
        .sankey-card .sankey-notice strong { font-weight: 800; }
      `}</style>

      <div className="sankey-head">
        <h3 className="sankey-title">{report.businessUnit} Income Statement</h3>
        <div className="sankey-sub">
          {periodLabel(report.from, report.to)}
        </div>
      </div>

      <svg
        className="sankey"
        viewBox={`0 0 1600 ${viewBoxH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g>
          {ribbonPaths.map((r) => (
            <path key={r.key} d={r.d} fill={r.fill} fillOpacity={r.opacity} />
          ))}
        </g>
        <g>
          {allNodes.map((n) => (
            <rect
              key={`bar:${n.id}`}
              x={n.x}
              y={n.y}
              width={BAR_W}
              height={n.h}
              fill={BAR_COLOR[n.cls] ?? BAR_COLOR.ink}
            />
          ))}
        </g>
        <g>
          {labels.map((l) => (
            <g key={l.key}>{renderLabel(l.props)}</g>
          ))}
          {renderMidLabel(cogsNode)}
        </g>
      </svg>

    </div>
  );
}
