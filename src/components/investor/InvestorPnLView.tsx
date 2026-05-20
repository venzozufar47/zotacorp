"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { InvestorPnLSummary } from "@/lib/investor/pnl";
import { formatRp } from "@/lib/cashflow/format";

function labelYM(year: number, month: number): string {
  const names = [
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
  return `${names[month - 1]} ${year}`;
}

function ymStr(x: { year: number; month: number }): string {
  return `${x.year}-${String(x.month).padStart(2, "0")}`;
}

/**
 * PnL view investor — BU-level aggregate (tanpa branch split), supaya
 * angka tidak nol gara-gara admin belum melakukan Pusat allocations.
 * Investor lihat pendapatan, beban, laba operasional, dan Net Dividen
 * apa adanya dari ledger.
 */
export function InvestorPnLView({
  businessUnit,
  report,
}: {
  businessUnit: string;
  report: InvestorPnLSummary;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [fromStr, setFromStr] = useState(ymStr(report.from));
  const [toStr, setToStr] = useState(ymStr(report.to));

  const applyRange = () => {
    const params = new URLSearchParams(sp?.toString() ?? "");
    params.set("from", fromStr);
    params.set("to", toStr);
    router.push(
      `/investor/finance/${encodeURIComponent(businessUnit)}?${params}`
    );
  };

  const totals = useMemo(() => {
    let revenue = 0;
    let expense = 0;
    let netDividen = 0;
    for (const m of report.months) {
      revenue += m.operatingRevenue;
      expense += m.operatingExpense;
      netDividen += m.netDividen;
    }
    return { revenue, expense, profit: revenue - expense, netDividen };
  }, [report]);

  return (
    <div className="space-y-5">
      <Link
        href="/investor/finance"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Kembali ke daftar unit bisnis
      </Link>

      <header>
        <p className="eyebrow text-muted-foreground">Profit &amp; Loss</p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
          {businessUnit}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ringkasan operasional unit bisnis berdasarkan ledger keuangan
          terkini. Mode baca.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted-foreground mb-1">Dari</span>
          <input
            type="month"
            value={fromStr}
            onChange={(e) => setFromStr(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground mb-1">Sampai</span>
          <input
            type="month"
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={applyRange}
          className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Terapkan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Kpi
          label="Pendapatan operasional"
          value={formatRp(totals.revenue)}
          tone="positive"
        />
        <Kpi
          label="Beban operasional"
          value={`−${formatRp(totals.expense)}`}
          tone="negative"
        />
        <Kpi
          label="Laba operasional"
          value={formatRp(totals.profit)}
          tone={totals.profit >= 0 ? "positive" : "negative"}
        />
        <Kpi
          label="Net dividen (company)"
          value={formatRp(totals.netDividen)}
          tone={totals.netDividen >= 0 ? "positive" : "neutral"}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            Ringkasan bulanan
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="px-4 py-2 font-semibold">Bulan</th>
                <th className="px-4 py-2 font-semibold text-right tabular-nums">
                  Pendapatan
                </th>
                <th className="px-4 py-2 font-semibold text-right tabular-nums">
                  Beban
                </th>
                <th className="px-4 py-2 font-semibold text-right tabular-nums">
                  Laba operasional
                </th>
                <th className="px-4 py-2 font-semibold text-right tabular-nums">
                  Net dividen
                </th>
              </tr>
            </thead>
            <tbody>
              {report.months.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Belum ada data dalam rentang ini.
                  </td>
                </tr>
              )}
              {report.months.map((m) => (
                <tr
                  key={`${m.year}-${m.month}`}
                  className="border-t border-border/60"
                >
                  <td className="px-4 py-2 font-medium text-foreground">
                    {labelYM(m.year, m.month)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatRp(m.operatingRevenue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    −{formatRp(m.operatingExpense)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums font-semibold ${
                      m.operatingProfit >= 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {formatRp(m.operatingProfit)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {m.netDividen === 0 ? "—" : formatRp(m.netDividen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneIcon =
    tone === "positive" ? (
      <TrendingUp size={14} className="text-success" />
    ) : tone === "negative" ? (
      <TrendingDown size={14} className="text-destructive" />
    ) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg sm:text-xl font-semibold text-foreground tabular-nums">
        {value}
      </p>
      {toneIcon && <div className="mt-1">{toneIcon}</div>}
    </div>
  );
}
