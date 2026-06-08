"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import type { PhotoSessionRow } from "@/lib/actions/yeobo-photo-sessions.actions";
import { MONTH_NAMES } from "@/lib/utils/date-formats";

const idx = (y: number, m: number) => y * 12 + m;
const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const ymLabel = (y: number, m: number) => `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`;

function MoM({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null || prev === 0) return <span className="text-muted-foreground">—</span>;
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  const Icon = pct === 0 ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${pct === 0 ? "text-muted-foreground" : up ? "text-emerald-600" : "text-destructive"}`}>
      <Icon size={11} />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/**
 * Investor photo-session report for one Yeobo branch. Replaces the old
 * "Metrik penopang" card for Yeobo. Shows, over the selected period:
 * sessions per studio per month, MoM growth, period total, and revenue
 * per session (operating revenue ÷ total sessions).
 */
export function InvestorPhotoSessionsCard({
  branch,
  sessions,
  periodRows,
}: {
  branch: string;
  sessions: PhotoSessionRow[];
  periodRows: { year: number; month: number; revenue: number }[];
}) {
  const rows = useMemo(() => sessions.filter((s) => s.branch === branch), [sessions, branch]);

  // Months that have session data, intersected with the selected period.
  const months = useMemo(() => {
    const sessionMonths = new Map<string, { year: number; month: number }>();
    for (const s of rows) sessionMonths.set(ymKey(s.periodYear, s.periodMonth), { year: s.periodYear, month: s.periodMonth });
    const periodSet = new Set(periodRows.map((r) => ymKey(r.year, r.month)));
    let list = [...sessionMonths.values()].filter((m) => periodSet.size === 0 || periodSet.has(ymKey(m.year, m.month)));
    if (list.length === 0) list = [...sessionMonths.values()].slice(-12);
    return list.sort((a, b) => idx(a.year, a.month) - idx(b.year, b.month));
  }, [rows, periodRows]);

  const monthSet = useMemo(() => new Set(months.map((m) => ymKey(m.year, m.month))), [months]);

  const studios = useMemo(() => {
    const order = new Map<string, number>();
    for (const s of rows) if (!order.has(s.studio)) order.set(s.studio, s.sortOrder);
    return [...order.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
  }, [rows]);

  // studio × ym → session count (packages collapsed to studio).
  const cell = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of rows) {
      if (!monthSet.has(ymKey(s.periodYear, s.periodMonth))) continue;
      const k = `${s.studio}|${ymKey(s.periodYear, s.periodMonth)}`;
      m.set(k, (m.get(k) ?? 0) + s.sessions);
    }
    return m;
  }, [rows, monthSet]);

  const studioMonth = (studio: string, m: { year: number; month: number }) =>
    cell.get(`${studio}|${ymKey(m.year, m.month)}`) ?? 0;
  const studioTotal = (studio: string) => months.reduce((s, m) => s + studioMonth(studio, m), 0);
  const monthTotal = (m: { year: number; month: number }) =>
    studios.reduce((s, st) => s + studioMonth(st, m), 0);
  const grandTotal = months.reduce((s, m) => s + monthTotal(m), 0);

  const last = months[months.length - 1];
  const prev = months.length >= 2 ? months[months.length - 2] : null;

  const periodRevenue = useMemo(
    () => periodRows.filter((r) => monthSet.has(ymKey(r.year, r.month))).reduce((s, r) => s + r.revenue, 0),
    [periodRows, monthSet]
  );
  const revPerSession = grandTotal > 0 ? periodRevenue / grandTotal : 0;

  if (rows.length === 0 || months.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Operasional · Sesi Foto
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            Laporan sesi foto · {branch}
          </h3>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-[10.5px] text-muted-foreground">Total sesi (rentang ini)</p>
            <p className="text-lg font-semibold tabular-nums">{grandTotal.toLocaleString("id-ID")}</p>
          </div>
          <div className="text-right">
            <p className="text-[10.5px] text-muted-foreground">Revenue / sesi</p>
            <p className="text-lg font-semibold tabular-nums">
              {revPerSession > 0 ? formatRp(revPerSession) : "—"}
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Studio
              </th>
              {months.map((m) => (
                <th key={ymKey(m.year, m.month)} className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {ymLabel(m.year, m.month)}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Total
              </th>
              <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                MoM
              </th>
            </tr>
          </thead>
          <tbody>
            {studios.map((studio) => (
              <tr key={studio} className="border-t border-border/60">
                <td className="px-4 py-1.5 text-xs text-foreground whitespace-nowrap">{studio}</td>
                {months.map((m) => {
                  const v = studioMonth(studio, m);
                  return (
                    <td key={ymKey(m.year, m.month)} className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                      {v || "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
                  {studioTotal(studio).toLocaleString("id-ID")}
                </td>
                <td className="px-3 py-1.5 text-right text-[11px]">
                  <MoM cur={last ? studioMonth(studio, last) : 0} prev={prev ? studioMonth(studio, prev) : null} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="px-4 py-2 text-xs font-bold whitespace-nowrap">Total Sesi</td>
              {months.map((m) => (
                <td key={ymKey(m.year, m.month)} className="px-3 py-2 text-right text-xs font-bold tabular-nums">
                  {monthTotal(m) || "—"}
                </td>
              ))}
              <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">
                {grandTotal.toLocaleString("id-ID")}
              </td>
              <td className="px-3 py-2 text-right text-[11px]">
                <MoM cur={last ? monthTotal(last) : 0} prev={prev ? monthTotal(prev) : null} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
