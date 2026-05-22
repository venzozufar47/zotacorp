"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatRp } from "@/lib/cashflow/format";
import {
  InvestorPeriodSelector,
  type Period,
  type PeriodId,
} from "./InvestorPeriodSelector";
import { HeroContract } from "./HeroContract";
import { KpiTile } from "./KpiTile";
import {
  RevenueChart,
  PnLBreakdownChart,
  MarginTrendChart,
  UtilizationChart,
} from "./InvestorCharts";
import { PayoutsTable } from "./PayoutsTable";
import { MetricCommentSheet } from "./MetricCommentSheet";
import { METRIC_IDS } from "@/lib/investor/metric-ids";
import type { InvestorDashboardData } from "@/lib/investor/dashboard";
import type { InvestorContract } from "@/lib/actions/investor.actions";

interface Props {
  investorName: string;
  userId: string;
  businessUnit: string;
  businessUnits: string[];
  data: InvestorDashboardData;
  initialPeriod: Period;
  commentCounts: Record<
    string,
    { count: number; lastAuthorRole: "investor" | "admin" }
  >;
  isAdmin?: boolean;
}

export function InvestorDashboardView({
  investorName,
  userId,
  businessUnit,
  businessUnits,
  data,
  initialPeriod,
  commentCounts,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [commentOpen, setCommentOpen] = useState<{
    metricId: string;
    label: string;
  } | null>(null);

  function applyPeriod(p: Period) {
    setPeriod(p);
    const params = new URLSearchParams(sp?.toString() ?? "");
    params.set("period", p.id);
    if (p.id === "custom" && p.from && p.to) {
      params.set("from", p.from);
      params.set("to", p.to);
    } else {
      params.delete("from");
      params.delete("to");
    }
    router.push(`/investor?${params.toString()}`);
  }

  function switchBu(bu: string) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    params.set("bu", bu);
    router.push(`/investor?${params.toString()}`);
  }

  const agg = useMemo(() => {
    const rows = data.rows;
    const sum = (k: keyof (typeof rows)[number]) =>
      rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const avg = (k: keyof (typeof rows)[number]) =>
      rows.length ? sum(k) / rows.length : 0;
    const rev = sum("revenue");
    const cogs = sum("cogs");
    const opex = sum("opex");
    const gp = sum("grossProfit");
    const op = sum("operatingProfit");
    const np = sum("netProfit");
    const utilRows = rows.filter((r) => r.utilizationPct != null);
    const avgUtil = utilRows.length
      ? utilRows.reduce((s, r) => s + (r.utilizationPct ?? 0), 0) /
        utilRows.length
      : null;
    return {
      n: rows.length,
      rev,
      cogs,
      opex,
      gp,
      op,
      np,
      gpMargin: rev ? (gp / rev) * 100 : 0,
      opMargin: rev ? (op / rev) * 100 : 0,
      npMargin: rev ? (np / rev) * 100 : 0,
      avgUtil,
      orders: sum("ordersCount"),
      customers: sum("uniqueCustomers"),
      tax: Math.max(0, op * 0.005),
      avgRev: avg("revenue"),
    };
  }, [data.rows]);

  const commentFor = (id: string) => commentCounts[id];

  if (!data.contract) {
    return (
      <div className="space-y-6">
        {businessUnits.length > 1 && (
          <BuPicker
            current={businessUnit}
            options={businessUnits}
            onChange={switchBu}
          />
        )}
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            Kontrak untuk {businessUnit} belum di-set
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hubungi admin untuk mengaktifkan kontrak investor di unit
            bisnis ini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-theme="oceanic">
      {businessUnits.length > 1 && (
        <BuPicker
          current={businessUnit}
          options={businessUnits}
          onChange={switchBu}
        />
      )}

      <HeroContract
        investorName={investorName}
        contract={data.contract}
        contractProgress={data.contractProgress}
        bepProgress={data.bepProgress}
      />

      {/* Period selector + section heading */}
      <section className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Performa keuangan
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Metrik {agg.n} bulan terpilih
          </h2>
        </div>
        <InvestorPeriodSelector value={period} onChange={applyPeriod} />
      </section>

      {/* 6 KPI tiles */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          metricId={METRIC_IDS.revenue.id}
          label="Revenue"
          value={formatRp(agg.rev)}
          help="Total pendapatan kotor periode terpilih."
          sparkPoints={data.rows.map((r) => r.revenue / 1e6)}
          commentCount={commentFor(METRIC_IDS.revenue.id)?.count}
          commentLastAuthorRole={
            commentFor(METRIC_IDS.revenue.id)?.lastAuthorRole
          }
          onOpenComment={(id, label) => setCommentOpen({ metricId: id, label })}
        />
        <KpiTile
          metricId={METRIC_IDS.netProfit.id}
          label="Net profit"
          value={formatRp(agg.np)}
          help="Revenue dikurangi COGS, opex, dan pajak final UMKM 0,5% omzet (estimasi)."
          sparkPoints={data.rows.map((r) => r.netProfit / 1e6)}
          sparkColor="#1d6b3a"
          commentCount={commentFor(METRIC_IDS.netProfit.id)?.count}
          commentLastAuthorRole={
            commentFor(METRIC_IDS.netProfit.id)?.lastAuthorRole
          }
          onOpenComment={(id, label) => setCommentOpen({ metricId: id, label })}
        />
        <KpiTile
          metricId={METRIC_IDS.gpMargin.id}
          label="Gross margin"
          value={`${agg.gpMargin.toFixed(1)}%`}
          help="(Revenue − COGS) / Revenue. Mengukur efisiensi produksi & harga bahan baku."
          sparkPoints={data.rows.map((r) =>
            r.revenue ? (r.grossProfit / r.revenue) * 100 : 0
          )}
          commentCount={commentFor(METRIC_IDS.gpMargin.id)?.count}
          commentLastAuthorRole={
            commentFor(METRIC_IDS.gpMargin.id)?.lastAuthorRole
          }
          onOpenComment={(id, label) => setCommentOpen({ metricId: id, label })}
        />
        <KpiTile
          metricId={METRIC_IDS.opMargin.id}
          label="Op. margin"
          value={`${agg.opMargin.toFixed(1)}%`}
          help="(Gross − Opex) / Revenue. Efisiensi operasional sehari-hari."
          sparkPoints={data.rows.map((r) =>
            r.revenue ? (r.operatingProfit / r.revenue) * 100 : 0
          )}
          sparkColor="#7c5cd6"
          commentCount={commentFor(METRIC_IDS.opMargin.id)?.count}
          commentLastAuthorRole={
            commentFor(METRIC_IDS.opMargin.id)?.lastAuthorRole
          }
          onOpenComment={(id, label) => setCommentOpen({ metricId: id, label })}
        />
        <KpiTile
          metricId={METRIC_IDS.npMargin.id}
          label="Net margin"
          value={`${agg.npMargin.toFixed(1)}%`}
          help="Net Profit / Revenue. Basis bagi hasil ke investor."
          sparkPoints={data.rows.map((r) =>
            r.revenue ? (r.netProfit / r.revenue) * 100 : 0
          )}
          sparkColor="#1d6b3a"
          commentCount={commentFor(METRIC_IDS.npMargin.id)?.count}
          commentLastAuthorRole={
            commentFor(METRIC_IDS.npMargin.id)?.lastAuthorRole
          }
          onOpenComment={(id, label) => setCommentOpen({ metricId: id, label })}
        />
        <KpiTile
          metricId={METRIC_IDS.utilization.id}
          label="Utilization"
          value={agg.avgUtil != null ? `${agg.avgUtil.toFixed(0)}%` : "—"}
          help="Rata-rata pemakaian kapasitas produksi terhadap kapasitas maksimum. Diisi admin per bulan."
          sparkPoints={data.rows
            .map((r) => r.utilizationPct ?? 0)
            .filter((v, i, a) => a.some((x) => x > 0) || i > 0)}
          commentCount={commentFor(METRIC_IDS.utilization.id)?.count}
          commentLastAuthorRole={
            commentFor(METRIC_IDS.utilization.id)?.lastAuthorRole
          }
          onOpenComment={(id, label) => setCommentOpen({ metricId: id, label })}
        />
      </section>

      {/* Charts grid */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          eyebrow="Revenue per bulan"
          title={`${formatRp(agg.avgRev)} / bln`}
          subtitle="rata-rata bulanan periode ini"
        >
          <RevenueChart rows={data.rows} />
        </ChartCard>
        <ChartCard
          eyebrow="Profit &amp; loss"
          title={formatRp(agg.np)}
          subtitle={`net profit total · margin ${agg.npMargin.toFixed(1)}%`}
          legend={[
            { color: "var(--primary)", label: "Revenue" },
            { color: "#b5dde6", label: "COGS + Opex" },
            { color: "#1d6b3a", label: "Net profit", line: true },
          ]}
        >
          <PnLBreakdownChart rows={data.rows} />
        </ChartCard>
        <ChartCard
          eyebrow="Margin trend"
          title="Gross · Op · Net"
          subtitle="dalam %"
          legend={[
            { color: "var(--primary)", label: "Gross PM" },
            { color: "#7c5cd6", label: "Op. PM" },
            { color: "#1d6b3a", label: "Net PM" },
          ]}
        >
          <MarginTrendChart rows={data.rows} />
        </ChartCard>
        <ChartCard
          eyebrow="Utilization rate"
          title={
            agg.avgUtil != null
              ? `${agg.avgUtil.toFixed(0)}% rata-rata`
              : "Belum ada data"
          }
          subtitle="target operasional 80%"
        >
          <UtilizationChart rows={data.rows} />
        </ChartCard>
      </section>

      {/* P&L breakdown table + Operational metrics */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PnLBreakdownTable agg={agg} />
        </div>
        <OperationalMetricsCard
          rows={data.rows}
          agg={agg}
          commentCounts={commentCounts}
          onOpenComment={(id, label) => setCommentOpen({ metricId: id, label })}
        />
      </section>

      {/* Cashback */}
      <PayoutsTable payouts={data.payouts} totalCashback={data.totalCashback} />

      {/* Quick link ke detail finance */}
      <section className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
            Akses ledger
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            Buka rekening koran &amp; transaksi lengkap
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daftar transaksi setiap rekening — read-only.
          </p>
        </div>
        <Link
          href={`/investor/finance?bu=${encodeURIComponent(businessUnit)}`}
          className="inline-flex items-center gap-1.5 px-3 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
        >
          Buka detail →
        </Link>
      </section>

      {commentOpen && (
        <MetricCommentSheet
          businessUnit={businessUnit}
          metricId={commentOpen.metricId}
          metricLabel={commentOpen.label}
          open={true}
          onClose={() => setCommentOpen(null)}
          currentUserId={userId}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function BuPicker({
  current,
  options,
  onChange,
}: {
  current: string;
  options: string[];
  onChange: (bu: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((bu) => {
        const active = bu === current;
        return (
          <button
            key={bu}
            type="button"
            onClick={() => onChange(bu)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors border-2 ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/50"
            }`}
          >
            {bu}
          </button>
        );
      })}
    </div>
  );
}

function ChartCard({
  eyebrow,
  title,
  subtitle,
  legend,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  legend?: Array<{ color: string; label: string; line?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border">
      <div className="px-6 pt-5 pb-2 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: eyebrow }}
          />
          <h3 className="mt-1 text-lg font-semibold text-foreground leading-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11.5px] mt-0.5 text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {legend && (
          <div className="flex items-center gap-3 text-[10.5px] flex-wrap text-muted-foreground">
            {legend.map((l) => (
              <span
                key={l.label}
                className="inline-flex items-center gap-1.5"
              >
                {l.line ? (
                  <span
                    className="inline-block w-3.5 h-0.5 rounded"
                    style={{ background: l.color }}
                  />
                ) : (
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: l.color }}
                  />
                )}
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </div>
  );
}

function PnLBreakdownTable({
  agg,
}: {
  agg: {
    rev: number;
    cogs: number;
    opex: number;
    gp: number;
    op: number;
    tax: number;
    np: number;
    gpMargin: number;
    opMargin: number;
    npMargin: number;
  };
}) {
  const rows = [
    { label: "Revenue", value: agg.rev, kind: "header" as const, margin: null },
    {
      label: "  – Cost of Goods Sold",
      value: -agg.cogs,
      kind: "row" as const,
      margin: null,
    },
    {
      label: "Gross Profit",
      value: agg.gp,
      kind: "sub" as const,
      margin: agg.gpMargin,
    },
    {
      label: "  – Operating Expense",
      value: -agg.opex,
      kind: "row" as const,
      margin: null,
    },
    {
      label: "Operating Profit",
      value: agg.op,
      kind: "sub" as const,
      margin: agg.opMargin,
    },
    {
      label: "  – Pajak final UMKM (estimasi)",
      value: -agg.tax,
      kind: "row" as const,
      margin: null,
    },
    {
      label: "Net Profit",
      value: agg.np,
      kind: "total" as const,
      margin: agg.npMargin,
    },
  ];
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Rincian P&amp;L
        </p>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          Akumulasi periode
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-6 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Pos
            </th>
            <th className="text-right px-6 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Jumlah
            </th>
            <th className="text-right px-6 py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              % Rev
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isSub = r.kind === "sub";
            const isTotal = r.kind === "total";
            const isHead = r.kind === "header";
            const pct = agg.rev ? (Math.abs(r.value) / agg.rev) * 100 : 0;
            return (
              <tr
                key={i}
                className={
                  isTotal
                    ? "bg-accent"
                    : isSub
                      ? "bg-muted/40"
                      : ""
                }
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <td
                  className={`px-6 py-2.5 whitespace-pre ${
                    isHead || isSub || isTotal ? "font-semibold" : ""
                  }`}
                >
                  {r.label}
                </td>
                <td
                  className={`px-6 py-2.5 text-right tabular-nums ${
                    isHead || isSub || isTotal ? "font-semibold" : ""
                  } ${r.value < 0 ? "text-destructive" : "text-foreground"}`}
                >
                  {formatRp(Math.abs(r.value))}
                </td>
                <td
                  className={`px-6 py-2.5 text-right tabular-nums text-xs ${
                    isTotal
                      ? "text-primary font-semibold"
                      : isSub
                        ? "font-semibold text-muted-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {r.margin != null
                    ? `${r.margin.toFixed(1)}%`
                    : `${pct.toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OperationalMetricsCard({
  rows,
  agg,
  commentCounts,
  onOpenComment,
}: {
  rows: Array<{
    revenue: number;
    cogs: number;
    opex: number;
    ordersCount: number | null;
    uniqueCustomers: number | null;
    utilizationPct: number | null;
    month: number;
    year: number;
  }>;
  agg: {
    rev: number;
    cogs: number;
    opex: number;
    n: number;
    orders: number;
    customers: number;
  };
  commentCounts: Record<
    string,
    { count: number; lastAuthorRole: "investor" | "admin" }
  >;
  onOpenComment: (metricId: string, label: string) => void;
}) {
  const lastRow = rows[rows.length - 1];
  const aov = agg.orders > 0 ? agg.rev / agg.orders : 0;
  const revPerCust = agg.customers > 0 ? agg.rev / agg.customers : 0;
  const items = [
    {
      metricId: METRIC_IDS.orders.id,
      label: "Total order",
      value:
        agg.orders > 0
          ? agg.orders.toLocaleString("id-ID")
          : "Belum di-input",
      sub:
        agg.orders > 0
          ? `${Math.round(agg.orders / Math.max(1, agg.n))} / bulan`
          : "—",
    },
    {
      metricId: METRIC_IDS.customers.id,
      label: "Unique customer",
      value:
        agg.customers > 0
          ? agg.customers.toLocaleString("id-ID")
          : "Belum di-input",
      sub: "tidak unik antar bulan",
    },
    {
      metricId: METRIC_IDS.aov.id,
      label: "Average order value",
      value: aov > 0 ? formatRp(aov) : "—",
      sub: "rata-rata nilai per order",
    },
    {
      metricId: "revPerCust",
      label: "Revenue / customer",
      value: revPerCust > 0 ? formatRp(revPerCust) : "—",
      sub: "average per bulan",
    },
    {
      metricId: METRIC_IDS.cogsRatio.id,
      label: "COGS ratio",
      value: agg.rev ? `${((agg.cogs / agg.rev) * 100).toFixed(1)}%` : "—",
      sub: "COGS / Revenue",
    },
    {
      metricId: METRIC_IDS.opexRatio.id,
      label: "Opex ratio",
      value: agg.rev ? `${((agg.opex / agg.rev) * 100).toFixed(1)}%` : "—",
      sub: "Opex / Revenue",
    },
    {
      metricId: "lastUtil",
      label: `Util bulan terakhir`,
      value:
        lastRow?.utilizationPct != null
          ? `${lastRow.utilizationPct.toFixed(0)}%`
          : "—",
      sub: "bulan paling akhir periode",
    },
  ];
  return (
    <div className="rounded-2xl bg-card border border-border">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Operasional
        </p>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          Metrik penopang
        </h3>
      </div>
      <ul className="px-5 py-2">
        {items.map((row, i) => {
          const comment = commentCounts[row.metricId];
          return (
            <li
              key={row.label}
              className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-border/60" : ""}`}
            >
              <div>
                <p className="text-xs font-medium text-foreground">
                  {row.label}
                </p>
                <p className="text-[10.5px] text-muted-foreground">
                  {row.sub}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold tabular-nums">
                  {row.value}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenComment(row.metricId, row.label)}
                  className={`inline-flex items-center gap-1 px-1.5 h-6 rounded-md text-[10.5px] font-semibold ${
                    comment
                      ? "bg-accent text-primary border border-primary/25"
                      : "text-muted-foreground border border-border"
                  }`}
                  aria-label="Komentar"
                >
                  💬{comment && <span>{comment.count}</span>}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// keep types referenced
void ({} as InvestorContract);
void ({} as PeriodId);
