"use client";

import { useMemo, useState } from "react";
import { PieChart, TrendingUp, TrendingDown, Info, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/cashflow/format";
import { getNonOperatingCategories } from "@/lib/cashflow/categories";

interface Tx {
  date: string;
  debit: number;
  credit: number;
  category: string | null;
}

interface Props {
  transactions: Tx[];
  businessUnit: string;
}

/**
 * Compact visualisation of a rekening's income + expense by category
 * for a user-chosen date range. No charting dep — horizontal bars are
 * just %-width divs sized against the biggest bucket. That keeps the
 * page light and the bar lengths compare-at-a-glance meaningful
 * within each side (income vs expense are independent scales).
 *
 * Defaults the range to "last 30 days" relative to the newest tx so
 * the first render shows something useful without the admin having
 * to touch the pickers. "(tanpa kategori)" becomes its own bucket
 * rather than being hidden — surfacing the gap reminds the admin
 * to assign categories.
 */
export function CategoryBreakdownPanel({ transactions, businessUnit }: Props) {
  const nonOperating = getNonOperatingCategories(businessUnit);
  const nonOperatingSet = new Set(nonOperating);
  // Derive sensible default range from the data: end = newest tx date
  // (or today), start = end − 30 days. Falls back to today/today when
  // there's no data.
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

  const { income, expense, totalIncome, totalExpense, nonOpRows, nonOpNet } =
    useMemo(() => {
      const incomeMap = new Map<string, number>();
      const expenseMap = new Map<string, number>();
      // Non-operating: tally credit (in) and debit (out) per category
      // so the admin sees e.g. Investment +5jt vs Dividend −2jt separately,
      // then net at the bottom.
      const nonOpMap = new Map<string, { credit: number; debit: number }>();
      let ti = 0;
      let te = 0;
      for (const t of transactions) {
        if (t.date < from || t.date > to) continue;
        if (t.category && nonOperatingSet.has(t.category)) {
          const cur = nonOpMap.get(t.category) ?? { credit: 0, debit: 0 };
          cur.credit += t.credit;
          cur.debit += t.debit;
          nonOpMap.set(t.category, cur);
          continue;
        }
        const key = t.category && t.category.trim() ? t.category : "(tanpa kategori)";
        if (t.credit > 0) {
          incomeMap.set(key, (incomeMap.get(key) ?? 0) + t.credit);
          ti += t.credit;
        }
        if (t.debit > 0) {
          expenseMap.set(key, (expenseMap.get(key) ?? 0) + t.debit);
          te += t.debit;
        }
      }
      const toSortedArray = (m: Map<string, number>) =>
        Array.from(m.entries())
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount);
      // Net from OWNER's perspective: money leaving the business account
      // (debit) is money the owner receives → positive; money credited
      // into the business (Investment) is money the owner put in →
      // negative. So net = debit − credit here, opposite of the
      // operating side above.
      const nonOpArr = Array.from(nonOpMap.entries())
        .map(([category, v]) => ({
          category,
          credit: v.credit,
          debit: v.debit,
          net: v.debit - v.credit,
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
      // Wealth Transfer cuma geser duit antar rekening sendiri; QRIS
      // (non-operasional) adalah settlement yang sudah dihitung sebagai
      // Sales di rekening Mandiri. Keduanya ditampilkan untuk audit
      // tapi di-exclude dari total Net Dividen.
      const net = nonOpArr
        .filter(
          (r) =>
            r.category !== "Wealth Transfer" &&
            r.category !== "QRIS (non-operasional)"
        )
        .reduce((s, r) => s + r.net, 0);
      return {
        income: toSortedArray(incomeMap),
        expense: toSortedArray(expenseMap),
        totalIncome: ti,
        totalExpense: te,
        nonOpRows: nonOpArr,
        nonOpNet: net,
      };
    }, [transactions, from, to, nonOperatingSet]);

  const rangeLabel = (() => {
    const fmt = (s: string) =>
      new Date(s + "T00:00:00").toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    return `${fmt(from)} — ${fmt(to)}`;
  })();

  return (
    <div className="rounded-3xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <PieChart size={14} className="text-primary" />
          <h2 className="font-display text-base font-semibold text-foreground">
            Kategori pemasukan & pengeluaran
          </h2>
          <span className="text-xs text-muted-foreground">{rangeLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Dari</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Sampai</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </label>
        </div>
      </div>

      {nonOperating.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Kategori non-operasional tidak dihitung:{" "}
            <span className="font-medium text-foreground">
              {nonOperating.join(", ")}
            </span>
            . Transaksi dengan kategori ini dikecualikan dari rekap pemasukan
            & pengeluaran.
          </span>
        </div>
      )}

      {income.length === 0 && expense.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground italic">
          Tidak ada transaksi pada rentang tanggal ini.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <CategorySide
            title="Pemasukan"
            icon={<TrendingUp size={14} />}
            tone="success"
            total={totalIncome}
            rows={income}
          />
          <CategorySide
            title="Pengeluaran"
            icon={<TrendingDown size={14} />}
            tone="destructive"
            total={totalExpense}
            rows={expense}
          />
        </div>
      )}

      {nonOpRows.length > 0 && (
        <div className="border-t border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Wallet size={14} className="text-muted-foreground" />
              <h3 className="font-display text-sm font-semibold text-foreground">
                Aktivitas non-operasional
              </h3>
              <span className="text-[11px] text-muted-foreground">
                (tidak termasuk profit operasional)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs">Net Dividen</span>
              <span
                className={cn(
                  "font-mono tabular-nums font-semibold",
                  nonOpNet >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {nonOpNet >= 0 ? "+" : "−"} Rp {formatIDR(Math.abs(nonOpNet))}
              </span>
            </div>
          </div>
          {/* Legenda tanda: owner-POV. + = masuk ke owner, − = keluar
              dari owner. Untuk Dividend (owner menarik) biasanya +,
              Investment (owner menyetor) biasanya −. Wealth Transfer
              cuma geser antar rekening sendiri jadi tidak ikut
              total — ditampilkan pisah dengan keterangan arah. */}
          <p className="text-[10px] text-muted-foreground leading-snug">
            Tanda mengikuti POV owner:{" "}
            <span className="text-success font-semibold">+</span> berarti owner
            menerima dana (mis. dividen),{" "}
            <span className="text-destructive font-semibold">−</span> berarti
            owner menyetor dana (mis. investasi).
          </p>
          <ul className="space-y-1.5">
            {nonOpRows.map((r) => {
              const excluded =
                r.category === "Wealth Transfer" ||
                r.category === "QRIS (non-operasional)";
              return (
              <li
                key={r.category}
                className={cn(
                  "flex items-baseline justify-between gap-3 text-xs py-1",
                  excluded && "opacity-70"
                )}
              >
                <span className="text-foreground truncate flex-1 min-w-0" title={r.category}>
                  {r.category}
                  {excluded && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground italic">
                      (tidak dihitung di Net Dividen)
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-3 whitespace-nowrap">
                  {excluded ? (
                    // Wealth Transfer / QRIS — arus 2-arah (bukan
                    // dividen/investasi), tampilkan Masuk & Keluar
                    // terpisah dengan label biar tidak dikira net.
                    <>
                      {r.credit > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          Masuk{" "}
                          <span className="font-mono tabular-nums text-foreground">
                            Rp {formatIDR(r.credit)}
                          </span>
                        </span>
                      )}
                      {r.debit > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          Keluar{" "}
                          <span className="font-mono tabular-nums text-foreground">
                            Rp {formatIDR(r.debit)}
                          </span>
                        </span>
                      )}
                    </>
                  ) : (
                    <span
                      className={cn(
                        "font-mono tabular-nums font-semibold min-w-[110px] text-right",
                        r.net >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {r.net >= 0 ? "+" : "−"} Rp {formatIDR(Math.abs(r.net))}
                    </span>
                  )}
                </span>
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function CategorySide({
  title,
  icon,
  tone,
  total,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "success" | "destructive";
  total: number;
  rows: Array<{ category: string; amount: number }>;
}) {
  // Scale bars against the largest bucket in THIS side so the biggest
  // category fills the row — both sides are independent scales so a
  // large expense bar doesn't dwarf a small income bar.
  const max = rows[0]?.amount ?? 0;
  const toneCls =
    tone === "success"
      ? "bg-success/70"
      : "bg-destructive/70";
  const textToneCls = tone === "success" ? "text-success" : "text-destructive";
  const sign = tone === "success" ? "+" : "−";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-1.5 font-semibold text-sm", textToneCls)}>
          {icon}
          {title}
        </div>
        <span className={cn("font-mono tabular-nums text-sm font-semibold", textToneCls)}>
          {sign} Rp {formatIDR(total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Tidak ada {title.toLowerCase()} pada rentang ini.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const pct = total > 0 ? (r.amount / total) * 100 : 0;
            const barPct = max > 0 ? (r.amount / max) * 100 : 0;
            return (
              <li key={r.category} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-foreground truncate" title={r.category}>
                    {r.category}
                  </span>
                  <span className="text-muted-foreground font-mono tabular-nums whitespace-nowrap">
                    Rp {formatIDR(r.amount)}{" "}
                    <span className="text-[10px]">
                      ({pct.toFixed(1)}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", toneCls)}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
