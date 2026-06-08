"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatIDR } from "@/lib/cashflow/format";
import { formatDateID } from "@/lib/utils/date-formats";

export interface InvestorLedgerRow {
  id: string;
  date: string;
  time: string | null;
  sourceDestination: string | null;
  transactionDetails: string | null;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number | null;
  category: string | null;
  branch: string | null;
  notes: string | null;
}

/**
 * Lifetime cashflow table investor — mirror kolom CashflowTable admin
 * (tanggal & jam / sumber-tujuan / detail / catatan / debit / kredit /
 * saldo / kategori / cabang) tapi pure read-only. Tidak ada edit
 * toggle, tidak ada bulk operations, hanya tampilan + filter sederhana.
 */
export function InvestorLedgerTable({
  rows,
  bank,
}: {
  rows: InvestorLedgerRow[];
  bank: string;
}) {
  const showSource = bank !== "cash";
  const showDetails = bank !== "cash";
  const showBranch = bank !== "cash";

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.sourceDestination,
        r.transactionDetails,
        r.description,
        r.category,
        r.branch,
        r.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const pageStart = page * PAGE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Cari deskripsi, kategori, cabang…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-sm"
          />
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {filtered.length.toLocaleString("id-ID")} transaksi
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="px-3 py-2 font-semibold whitespace-nowrap">
                  Tanggal
                </th>
                {showSource && (
                  <th className="px-3 py-2 font-semibold">Sumber / Tujuan</th>
                )}
                {showDetails && (
                  <th className="px-3 py-2 font-semibold">Detail</th>
                )}
                <th className="px-3 py-2 font-semibold">Deskripsi</th>
                <th className="px-3 py-2 font-semibold">Kategori</th>
                {showBranch && (
                  <th className="px-3 py-2 font-semibold">Cabang</th>
                )}
                <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">
                  Debit
                </th>
                <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">
                  Kredit
                </th>
                <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Tidak ada transaksi yang cocok.
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {formatDateID(r.date)}
                    {r.time && (
                      <span className="block text-[10px] text-muted-foreground">
                        {r.time.slice(0, 5)}
                      </span>
                    )}
                  </td>
                  {showSource && (
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.sourceDestination ?? "—"}
                    </td>
                  )}
                  {showDetails && (
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.transactionDetails ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-foreground">{r.description}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.category ?? <span className="italic">—</span>}
                  </td>
                  {showBranch && (
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.branch ?? <span className="italic">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">
                    {r.debit > 0 ? `Rp ${formatIDR(r.debit)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">
                    {r.credit > 0 ? `Rp ${formatIDR(r.credit)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.runningBalance != null
                      ? `Rp ${formatIDR(r.runningBalance)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs">
            <span className="text-muted-foreground tabular-nums">
              Halaman {page + 1} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-7 px-2 rounded border border-border text-foreground disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={page >= totalPages - 1}
                className="h-7 px-2 rounded border border-border text-foreground disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
