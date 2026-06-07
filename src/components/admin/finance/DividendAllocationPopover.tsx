"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatIDR } from "@/lib/cashflow/format";
import {
  getDividendAllocationForMonth,
  saveDividendAllocationForMonth,
  type DividendAllocationForMonth,
} from "@/lib/actions/yeobo-dividend.actions";

/**
 * Modal to allocate one branch-month's Dividend pool across management +
 * investors. Loads pool/BEP/computed split from the server, lets admin
 * override per-recipient amounts (Σ must equal pool), saves a snapshot
 * and syncs linked recipients into investor_payouts.
 */
export function DividendAllocationPopover({
  branch,
  year,
  month,
  monthLabel,
  onClose,
  onSaved,
}: {
  branch: string;
  year: number;
  month: number;
  monthLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<DividendAllocationForMonth | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDividendAllocationForMonth({ branch, year, month })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setAmounts(Object.fromEntries(d.rows.map((r) => [r.recipientId, r.amount])));
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [branch, year, month]);

  const total = Object.values(amounts).reduce((s, v) => s + (v || 0), 0);
  const pool = data ? Math.round(data.pool) : 0;
  const diff = total - pool;
  const balanced = Math.abs(diff) <= 1;

  const resetToComputed = () => {
    if (!data) return;
    setAmounts(
      Object.fromEntries(data.rows.map((r) => [r.recipientId, r.computed]))
    );
  };

  const save = async () => {
    if (!data || !balanced || saving || pool <= 0) return;
    setSaving(true);
    setErr(null);
    const res = await saveDividendAllocationForMonth({
      branch,
      year,
      month,
      rows: data.rows.map((r) => ({
        recipientId: r.recipientId,
        amount: Math.round(amounts[r.recipientId] || 0),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    onSaved();
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        className="w-[460px] max-w-[96vw] max-h-[88vh] overflow-y-auto rounded-xl border border-border bg-card p-4 text-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold text-foreground">
            Alokasi Dividen — {branch}
          </h3>
          <span className="text-xs text-muted-foreground">{monthLabel}</span>
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Memuat…</p>
        ) : !data ? (
          <p className="py-6 text-center text-xs text-destructive">
            {err ?? "Gagal memuat."}
          </p>
        ) : (
          <>
            {/* Pool + BEP */}
            <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Pool dividen
                </span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  Rp{formatIDR(pool)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span
                  className={
                    "rounded-full px-2 py-0.5 font-semibold " +
                    (data.afterBep
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-amber-500/15 text-amber-600")
                  }
                >
                  {data.afterBep ? "Setelah BEP" : "Sebelum BEP"} · Mgmt{" "}
                  {data.mgmtPct}% / Investor {100 - data.mgmtPct}%
                </span>
                <span className="text-muted-foreground">
                  Balik modal investor Rp{formatIDR(data.investorRecouped)}
                  {data.totalInvestmentIdr
                    ? ` / Rp${formatIDR(Math.round(data.totalInvestmentIdr))}`
                    : " · total investasi belum diset"}
                </span>
              </div>
            </div>

            {pool < 0 && (
              <p className="mt-2 text-[11px] text-amber-600">
                Bulan rugi (profit minus): investor ikut menanggung kerugian.
                Tidak ada pembagian dividen — kerugian ini memperlambat BEP.
              </p>
            )}
            {pool === 0 && (
              <p className="mt-2 text-[11px] text-amber-600">
                Belum ada nominal Dividend untuk bulan ini di PnL.
              </p>
            )}

            {/* Recipients */}
            <div className="mt-3 space-y-1.5">
              {data.rows.map((r) => {
                const overridden =
                  Math.round(amounts[r.recipientId] || 0) !== r.computed;
                return (
                  <div
                    key={r.recipientId}
                    className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-foreground">
                          {r.label}
                        </span>
                        <span
                          className={
                            "rounded px-1 py-0.5 text-[9px] font-bold uppercase " +
                            (r.kind === "management"
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/10 text-primary")
                          }
                        >
                          {r.kind === "management" ? "Mgmt" : "Investor"}
                        </span>
                        {r.kind === "investor" && (
                          <span
                            className={
                              "rounded px-1 py-0.5 text-[9px] font-semibold " +
                              (r.contractId
                                ? "bg-emerald-500/15 text-emerald-600"
                                : "bg-muted text-muted-foreground")
                            }
                            title={
                              r.contractId
                                ? "Tersambung ke kontrak investor — muncul di dashboard"
                                : "Belum tersambung ke akun/kontrak; bisa di-link nanti"
                            }
                          >
                            {r.contractId ? "tersambung" : "belum tersambung"}
                          </span>
                        )}
                      </div>
                      {r.kind === "investor" && (
                        <span className="text-[10px] text-muted-foreground">
                          {r.poolPct ?? 0}% dari pool investor
                          {overridden ? " · diubah manual" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Rp</span>
                      <input
                        type="number"
                        value={amounts[r.recipientId] ?? 0}
                        onChange={(e) =>
                          setAmounts((prev) => ({
                            ...prev,
                            [r.recipientId]: Number(e.target.value),
                          }))
                        }
                        className="w-28 rounded-md border border-input bg-background px-2 py-1 text-right font-mono text-xs tabular-nums focus:ring-2 focus:ring-primary/30 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total vs pool */}
            <div
              className={
                "mt-2 flex items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold " +
                (balanced
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-destructive/10 text-destructive")
              }
            >
              <span>Total alokasi</span>
              <span className="font-mono tabular-nums">
                Rp{formatIDR(total)}{" "}
                {balanced ? "✓" : `(selisih Rp${formatIDR(Math.abs(diff))})`}
              </span>
            </div>

            {err && <p className="mt-2 text-[11px] text-destructive">{err}</p>}

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={resetToComputed}
                className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
              >
                Hitung otomatis
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!balanced || saving || pool <= 0}
                  onClick={save}
                  className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Menyimpan…" : "Simpan & alokasikan"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
