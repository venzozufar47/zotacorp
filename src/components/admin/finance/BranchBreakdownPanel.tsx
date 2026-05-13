"use client";

import { useMemo, useState } from "react";
import { Building2, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/cashflow/format";
import {
  expandBranchAllSplits,
  getAutoSplitBranches,
  ALL_BRANCH_SENTINEL,
} from "@/lib/cashflow/branch-split";

interface Tx {
  date: string;
  debit: number;
  credit: number;
  branch: string | null;
}

interface Props {
  transactions: Tx[];
  businessUnit: string;
}

/**
 * Total pemasukan + pengeluaran per cabang untuk rentang tanggal yang
 * dipilih admin. Khusus BU yang punya semantik auto-split (saat ini
 * Yeobo Space): transaksi `branch="All"` dipecah merata ke cabang
 * fisik (Tlogosari/Tembalang/Jebres) sebelum agregasi.
 *
 * Kalau BU tidak punya auto-split, panel tidak dirender.
 */
export function BranchBreakdownPanel({ transactions, businessUnit }: Props) {
  const targets = getAutoSplitBranches(businessUnit);

  const { defaultFrom, defaultTo } = useMemo(() => {
    if (transactions.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { defaultFrom: today, defaultTo: today };
    }
    const newest = transactions.reduce(
      (a, t) => (t.date > a ? t.date : a),
      transactions[0].date
    );
    const d = new Date(newest + "T00:00:00");
    d.setDate(d.getDate() - 30);
    return {
      defaultFrom: d.toISOString().slice(0, 10),
      defaultTo: newest,
    };
  }, [transactions]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  // Expand → filter range → aggregate. Hooks must run before the
  // null-render check below.
  const { rows, allBranchRowCount, allBranchDebit, allBranchCredit } =
    useMemo(() => {
      const inRange = transactions.filter(
        (t) => t.date >= from && t.date <= to
      );
      let allCount = 0;
      let allDebit = 0;
      let allCredit = 0;
      for (const t of inRange) {
        if (t.branch === ALL_BRANCH_SENTINEL) {
          allCount += 1;
          allDebit += t.debit;
          allCredit += t.credit;
        }
      }
      const expanded = expandBranchAllSplits(inRange, businessUnit);
      const map = new Map<string, { credit: number; debit: number }>();
      for (const t of expanded) {
        const key = t.branch?.trim() || "(tanpa cabang)";
        const cur = map.get(key) ?? { credit: 0, debit: 0 };
        cur.credit += t.credit;
        cur.debit += t.debit;
        map.set(key, cur);
      }
      const order = targets
        ? [...targets, "(tanpa cabang)"]
        : Array.from(map.keys());
      const ordered = order
        .map((k) => ({ branch: k, ...(map.get(k) ?? { credit: 0, debit: 0 }) }))
        .filter((r) => r.credit > 0 || r.debit > 0);
      return {
        rows: ordered,
        allBranchRowCount: allCount,
        allBranchDebit: allDebit,
        allBranchCredit: allCredit,
      };
    }, [transactions, from, to, businessUnit, targets]);

  if (!targets) return null;

  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const maxRow = Math.max(
    1,
    ...rows.map((r) => Math.max(r.credit, r.debit))
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2
            size={16}
            className="text-muted-foreground"
            strokeWidth={2.2}
          />
          <h2 className="font-semibold text-sm text-foreground">
            Per cabang
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[140px] text-xs"
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[140px] text-xs"
          />
        </div>
      </header>

      {allBranchRowCount > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <Info size={11} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">
              {allBranchRowCount}
            </span>{" "}
            transaksi level-perusahaan (cabang &quot;All&quot;) dibagi rata ke{" "}
            {targets.length} cabang:{" "}
            <span className="tabular-nums">
              Rp {formatIDR(allBranchCredit)} masuk · Rp{" "}
              {formatIDR(allBranchDebit)} keluar
            </span>
            .
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          Tidak ada transaksi pada rentang ini.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const net = r.credit - r.debit;
            const creditPct = (r.credit / maxRow) * 100;
            const debitPct = (r.debit / maxRow) * 100;
            return (
              <div
                key={r.branch}
                className="rounded-xl border border-border bg-background/60 px-3 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {r.branch}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      net >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {net >= 0 ? "+" : "−"} Rp {formatIDR(Math.abs(net))}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp
                      size={11}
                      className="text-success shrink-0"
                      strokeWidth={2.5}
                    />
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-success/60"
                        style={{ width: `${creditPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-[100px] text-right">
                      Rp {formatIDR(r.credit)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingDown
                      size={11}
                      className="text-destructive shrink-0"
                      strokeWidth={2.5}
                    />
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-destructive/60"
                        style={{ width: `${debitPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-[100px] text-right">
                      Rp {formatIDR(r.debit)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground tabular-nums">
        <span>
          Total masuk:{" "}
          <span className="font-semibold text-success">
            Rp {formatIDR(totalCredit)}
          </span>
        </span>
        <span>
          Total keluar:{" "}
          <span className="font-semibold text-destructive">
            Rp {formatIDR(totalDebit)}
          </span>
        </span>
      </footer>
    </section>
  );
}
