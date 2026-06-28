"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  CAKE_BRANCH_LABELS,
  CAKE_BRANCH_BG,
  type CakeBranch,
  type CakePaymentStatus,
} from "@/lib/cake-orders/types";
import type { CakeFinanceRecap } from "@/lib/actions/cake-finance.actions";

interface Props {
  month: number;
  year: number;
  monthLabel: string;
  recap: CakeFinanceRecap;
}

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const PAYMENT_STATUS_LABEL: Record<CakePaymentStatus, string> = {
  unpaid: "Belum bayar",
  paid: "Lunas",
  refunded: "Refund",
  partial_refund: "Refund sebagian",
};

const PAYMENT_STATUS_CLS: Record<CakePaymentStatus, string> = {
  unpaid: "bg-muted text-muted-foreground border-border",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-300",
  refunded: "bg-destructive/10 text-destructive border-destructive/30",
  partial_refund: "bg-amber-50 text-amber-800 border-amber-300",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function CakeFinanceView({ month, year, monthLabel, recap }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setPeriod(m: number, y: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "finance");
    params.set("month", String(m));
    params.set("year", String(y));
    router.push(`${pathname}?${params.toString()}`);
  }

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setPeriod(m, y);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-4 space-y-2">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display text-base font-bold">
              Rekap pembayaran cake
            </h3>
            <p className="text-xs text-muted-foreground">
              Pembayaran masuk (DP + pelunasan − refund) dikelompokkan
              berdasarkan <strong>tanggal AMBIL kue</strong>, bukan tanggal
              bayar.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Total diterima {monthLabel}
            </p>
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {formatRp(recap.grandNetPaid)}
            </p>
          </div>
        </div>
      </div>

      {/* Month selector */}
      <div className="rounded-2xl border border-border bg-card p-2.5 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="size-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft size={14} />
        </button>
        <select
          value={month}
          onChange={(e) => setPeriod(Number(e.target.value), year)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {MONTHS_ID.map((label, i) => (
            <option key={i + 1} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setPeriod(month, Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs tabular-nums"
        >
          {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="size-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
          aria-label="Bulan berikutnya"
        >
          <ChevronRight size={14} />
        </button>
        <span className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
          {monthLabel}
        </span>
      </div>

      {/* Per-branch summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {recap.branches.map((b) => (
          <div
            key={b.branch}
            className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span
                className={
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-display font-bold uppercase tracking-wider " +
                  CAKE_BRANCH_BG[b.branch]
                }
              >
                {CAKE_BRANCH_LABELS[b.branch]}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {b.orderCount} order
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Pembayaran diterima
              </p>
              <p className="font-display text-xl font-extrabold tabular-nums">
                {formatRp(b.netPaid)}
              </p>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums pt-1 border-t border-border/60">
              <span>Nilai order: {formatRp(b.totalValue)}</span>
              <span
                className={
                  b.outstanding > 0 ? "text-amber-700 font-semibold" : ""
                }
              >
                Outstanding: {formatRp(b.outstanding)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Order detail table */}
      {recap.orders.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada order yang dibuat pada {monthLabel}.
          </p>
        </section>
      ) : (
        <OrdersTable recap={recap} />
      )}
    </div>
  );
}

function OrdersTable({ recap }: { recap: CakeFinanceRecap }) {
  const [expanded, setExpanded] = useState(true);
  // Newest CREATED first within the month — recap dibasiskan tgl dibuat.
  const rows = [...recap.orders].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  );

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20"
      >
        <span className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
          Daftar order ({rows.length})
        </span>
        <ChevronDown
          size={16}
          className={
            "transition-transform " + (expanded ? "" : "-rotate-90")
          }
        />
      </button>
      {expanded && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Tgl dibuat", "Tgl ambil", "Cabang", "Pelanggan", "Nilai", "Dibayar", "Status"].map(
                  (c, i) => (
                    <th
                      key={i}
                      className={
                        "py-1.5 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground " +
                        (i >= 4 ? "text-right" : "text-left")
                      }
                    >
                      {c}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border/50">
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium">
                    {formatDate(o.createdAt)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                    {formatDate(o.scheduledAt)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
                        CAKE_BRANCH_BG[o.branch]
                      }
                    >
                      {CAKE_BRANCH_LABELS[o.branch]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 break-words">{o.customerName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatRp(o.totalIdr)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {formatRp(o.paidIdr)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap " +
                        (PAYMENT_STATUS_CLS[o.paymentStatus] ??
                          "bg-muted text-muted-foreground border-border")
                      }
                    >
                      {PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
