"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import type { PnLReport, PusatBreakdownRow } from "@/lib/cashflow/pnl";
import { savePusatAllocation } from "@/lib/actions/cashflow.actions";

interface Props {
  businessUnit: string;
  report: PnLReport;
}

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

interface EditableAlloc extends PusatBreakdownRow {
  year: number;
  month: number;
  semarangDraft: string;
  pareDraft: string;
  status: "idle" | "saving" | "saved" | "error";
  errorMsg?: string;
}

function toKey(a: { year: number; month: number; side: string; category: string }): string {
  return `${a.year}-${a.month}-${a.side}-${a.category}`;
}

/**
 * Inline editor: for every (month × category × side) Pusat bucket in
 * the report, show the current allocation and let admin type a new
 * Semarang/Pare split. Auto-save on blur — mirrors the spreadsheet
 * UX in RulesClient.
 */
export function PusatAllocationEditor({ businessUnit, report }: Props) {
  const router = useRouter();

  // Flatten report.pusatBreakdown into editable rows.
  const [rows, setRows] = useState<EditableAlloc[]>(() =>
    buildRows(report)
  );

  // Re-sync when report refreshes (e.g., after router.refresh).
  useEffect(() => {
    setRows(buildRows(report));
  }, [report]);

  function updateDraft(key: string, patch: Partial<EditableAlloc>) {
    setRows((prev) =>
      prev.map((r) =>
        toKey(r) === key
          ? { ...r, ...patch, status: "idle", errorMsg: undefined }
          : r
      )
    );
  }

  async function persist(key: string) {
    const row = rows.find((r) => toKey(r) === key);
    if (!row) return;
    const sem = Number(row.semarangDraft) || 0;
    const par = Number(row.pareDraft) || 0;
    if (
      sem === row.semarangAlloc &&
      par === row.pareAlloc &&
      !row.unallocated
    ) {
      return; // no change
    }
    setRows((prev) =>
      prev.map((r) =>
        toKey(r) === key ? { ...r, status: "saving" } : r
      )
    );
    const res = await savePusatAllocation({
      businessUnit,
      periodYear: row.year,
      periodMonth: row.month,
      side: row.side,
      category: row.category,
      semarangAmount: sem,
      pareAmount: par,
    });
    if (!res.ok) {
      setRows((prev) =>
        prev.map((r) =>
          toKey(r) === key
            ? { ...r, status: "error", errorMsg: res.error }
            : r
        )
      );
      toast.error(res.error);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        toKey(r) === key ? { ...r, status: "saved" } : r
      )
    );
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">
          Alokasi Pusat
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Tidak ada transaksi Pusat di rentang ini. Semua transaksi
          sudah tagged langsung ke Semarang atau Pare.
        </p>
      </div>
    );
  }

  // Group rows by month for visual grouping.
  const months = new Map<string, EditableAlloc[]>();
  for (const r of rows) {
    const k = `${r.year}-${r.month}`;
    const bucket = months.get(k) ?? [];
    bucket.push(r);
    months.set(k, bucket);
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-base font-semibold">
          Alokasi Pusat ke Cabang
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Untuk setiap bulan × kategori × sisi, isi split Semarang +
          Pare yang jumlahnya sama dengan total Pusat. Auto-save saat
          fokus keluar dari baris.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0 min-w-[900px]">
          <thead className="bg-muted/60 text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left font-semibold px-3 py-2 w-28">Bulan</th>
              <th className="text-left font-semibold px-3 py-2 w-16">Sisi</th>
              <th className="text-left font-semibold px-3 py-2">Kategori</th>
              <th className="text-right font-semibold px-3 py-2 w-36">
                Total Pusat
              </th>
              <th className="text-right font-semibold px-3 py-2 w-36">
                Semarang
              </th>
              <th className="text-right font-semibold px-3 py-2 w-36">Pare</th>
              <th className="text-center font-semibold px-3 py-2 w-20">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from(months.entries()).map(([mk, group]) => (
              <MonthGroup key={mk} rows={group} onChange={updateDraft} onBlurRow={persist} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildRows(report: PnLReport): EditableAlloc[] {
  const out: EditableAlloc[] = [];
  for (const m of report.months) {
    for (const p of m.pusatBreakdown) {
      out.push({
        ...p,
        year: m.year,
        month: m.month,
        semarangDraft: p.unallocated ? "" : String(p.semarangAlloc),
        pareDraft: p.unallocated ? "" : String(p.pareAlloc),
        status: "idle",
      });
    }
  }
  return out;
}

function MonthGroup({
  rows,
  onChange,
  onBlurRow,
}: {
  rows: EditableAlloc[];
  onChange: (key: string, patch: Partial<EditableAlloc>) => void;
  onBlurRow: (key: string) => void;
}) {
  const first = rows[0];
  const label = `${MONTH_NAMES[first.month - 1]} ${first.year}`;
  return (
    <>
      {rows.map((r, idx) => {
        const key = toKey(r);
        const sumDraft = (Number(r.semarangDraft) || 0) + (Number(r.pareDraft) || 0);
        const diff = Math.round(sumDraft - r.pusatTotal);
        const balancedLive = Math.abs(diff) <= 1;
        return (
          <tr
            key={key}
            className="border-t border-border/60 align-middle hover:bg-accent/10"
            onBlur={(e) => {
              const tr = e.currentTarget;
              if (e.relatedTarget && tr.contains(e.relatedTarget as Node)) return;
              onBlurRow(key);
            }}
          >
            <td className="px-3 py-2 text-foreground whitespace-nowrap">
              {idx === 0 ? <strong>{label}</strong> : null}
            </td>
            <td className="px-3 py-2">
              <span
                className={
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider " +
                  (r.side === "credit"
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive")
                }
              >
                {r.side === "credit" ? "Masuk" : "Keluar"}
              </span>
            </td>
            <td className="px-3 py-2 text-foreground">{r.category}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
              {r.pusatTotal.toLocaleString("id-ID")}
            </td>
            <td className="px-3 py-2">
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                value={r.semarangDraft}
                onChange={(e) => {
                  // Auto-complete the Pare side: whatever admin types
                  // on Semarang, Pare becomes pusatTotal − Semarang so
                  // the split always sums correctly. Clamped at 0 if
                  // admin types a value greater than the total.
                  const raw = e.target.value;
                  const patch: Partial<EditableAlloc> = { semarangDraft: raw };
                  if (raw.trim() === "") {
                    patch.pareDraft = "";
                  } else {
                    const sem = Number(raw) || 0;
                    const pare = Math.max(0, Math.round(r.pusatTotal - sem));
                    patch.pareDraft = String(pare);
                  }
                  onChange(key, patch);
                }}
                placeholder="0"
                className="w-full h-8 text-xs text-right font-mono tabular-nums rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </td>
            <td className="px-3 py-2">
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                value={r.pareDraft}
                onChange={(e) => {
                  const raw = e.target.value;
                  const patch: Partial<EditableAlloc> = { pareDraft: raw };
                  if (raw.trim() === "") {
                    patch.semarangDraft = "";
                  } else {
                    const pare = Number(raw) || 0;
                    const sem = Math.max(0, Math.round(r.pusatTotal - pare));
                    patch.semarangDraft = String(sem);
                  }
                  onChange(key, patch);
                }}
                placeholder="0"
                className="w-full h-8 text-xs text-right font-mono tabular-nums rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </td>
            <td className="px-3 py-2 text-center">
              {r.status === "saving" ? (
                <Loader2 size={12} className="inline text-muted-foreground animate-spin" />
              ) : r.status === "saved" ? (
                <Check size={12} className="inline text-success" />
              ) : r.unallocated ? (
                <span className="text-[10px] font-bold text-warning">
                  BELUM
                </span>
              ) : balancedLive ? (
                <Check size={12} className="inline text-success" />
              ) : (
                <span
                  className="text-[10px] font-bold text-destructive"
                  title={`Selisih ${diff.toLocaleString("id-ID")}`}
                >
                  ✗ {diff > 0 ? "+" : ""}
                  {diff.toLocaleString("id-ID")}
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
