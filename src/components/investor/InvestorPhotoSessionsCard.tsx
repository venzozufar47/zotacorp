"use client";

import { useMemo } from "react";
import type { PhotoSessionRow } from "@/lib/actions/yeobo-photo-sessions.actions";
import { MONTH_NAMES } from "@/lib/utils/date-formats";

const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const ymLabel = (y: number, m: number) => `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`;

/**
 * Read-only photo-session summary for one Yeobo branch (investor view).
 * Per-studio totals (packages summed) per month, last 12 months, + total.
 */
export function InvestorPhotoSessionsCard({
  branch,
  sessions,
}: {
  branch: string;
  sessions: PhotoSessionRow[];
}) {
  const rows = useMemo(() => sessions.filter((s) => s.branch === branch), [sessions, branch]);

  const months = useMemo(() => {
    const set = new Map<string, { year: number; month: number }>();
    for (const s of rows) set.set(ymKey(s.periodYear, s.periodMonth), { year: s.periodYear, month: s.periodMonth });
    return [...set.values()]
      .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
      .slice(-12);
  }, [rows]);

  const studios = useMemo(() => {
    const order = new Map<string, number>();
    for (const s of rows) if (!order.has(s.studio)) order.set(s.studio, s.sortOrder);
    return [...order.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
  }, [rows]);

  // studio × ym → sum (packages collapsed)
  const cell = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of rows) {
      const k = `${s.studio}|${ymKey(s.periodYear, s.periodMonth)}`;
      m.set(k, (m.get(k) ?? 0) + s.sessions);
    }
    return m;
  }, [rows]);

  const studioTotal = (studio: string, y: number, mo: number) =>
    cell.get(`${studio}|${ymKey(y, mo)}`) ?? 0;
  const monthTotal = (y: number, mo: number) =>
    studios.reduce((s, st) => s + studioTotal(st, y, mo), 0);
  const grandTotal = months.reduce((s, ym) => s + monthTotal(ym.year, ym.month), 0);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Sesi Foto
        </p>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          Jumlah sesi per studio · {branch}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {grandTotal.toLocaleString("id-ID")} total sesi ({months.length} bulan terakhir)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="bg-muted/50 px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Studio
              </th>
              {months.map((ym) => (
                <th key={ymKey(ym.year, ym.month)} className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {ymLabel(ym.year, ym.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {studios.map((studio) => (
              <tr key={studio} className="border-t border-border/60">
                <td className="bg-card px-4 py-1.5 text-xs text-foreground whitespace-nowrap">
                  {studio}
                </td>
                {months.map((ym) => {
                  const v = studioTotal(studio, ym.year, ym.month);
                  return (
                    <td key={ymKey(ym.year, ym.month)} className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                      {v || "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="bg-muted/30 px-4 py-2 text-xs font-bold whitespace-nowrap">
                Total Sesi
              </td>
              {months.map((ym) => (
                <td key={ymKey(ym.year, ym.month)} className="px-3 py-2 text-right text-xs font-bold tabular-nums">
                  {monthTotal(ym.year, ym.month) || "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
