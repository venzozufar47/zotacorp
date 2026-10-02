"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import type {
  DayBreakdown,
  PaymentRow,
} from "@/lib/actions/custom-cake-bonus.actions";

interface Props {
  month: number;
  year: number;
  monthLabel: string;
  days: DayBreakdown[];
  totalBonus: number;
}

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const KIND_LABEL: Record<string, string> = {
  dp: "DP",
  pelunasan: "Pelunasan",
  refund: "Refund",
};

const BRANCH_LABEL: Record<string, string> = {
  semarang: "Semarang",
  pare: "Pare",
};

export function CustomCakeBonusView({
  month,
  year,
  monthLabel,
  days,
  totalBonus,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setPeriod(m: number, y: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    params.set("view", "bonus-cake");
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

  const showLain = days.some((d) => d.lain !== 0);
  const columns = [
    "",
    "Tgl",
    "Semarang",
    "Pare",
    ...(showLain ? ["Lainnya"] : []),
    "Total",
    "Bonus",
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-4 space-y-2">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display text-base font-bold">Bonus Cake — Admin Haengbocake</h3>
            <p className="text-xs text-muted-foreground">
              Berdasarkan pembayaran order custom cake per hari (DP + pelunasan
              − refund), Haengbocake Semarang & Pare.
              <br />
              Formula: ≥ Rp 550k = 10% · &gt; Rp 700k = 70k + 5% selisih.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Total bonus {monthLabel}
            </p>
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {formatRp(totalBonus)}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--teal-300,#9bd3df)] bg-accent p-2 text-[11px] text-[var(--teal-700)] flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            Otomatis masuk ke <strong>cake_bonus</strong> di payslip pemegang
            posisi <span className="font-mono">Admin Haengbocake</span> saat
            generate. Hari = tanggal pembayaran dicatat di order (WIB). Order
            dibatalkan, dibuang, atau klaim gratis tidak dihitung. Klik tanggal
            untuk melihat pembayaran yang masuk hitungan.
          </span>
        </div>
      </div>

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

      {days.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada pembayaran order custom cake bulan ini.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className={
                        "py-1.5 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground " +
                        (i <= 1 ? "text-left" : "text-right")
                      }
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <DayRow
                    key={d.date}
                    day={d}
                    showLain={showLain}
                    colCount={columns.length}
                  />
                ))}
                <tr className="bg-muted/20 font-bold">
                  <td colSpan={columns.length - 2} className="px-2 py-2 text-right">
                    Total bonus
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatRp(days.reduce((s, d) => s + d.total, 0))}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-quaternary">
                    {formatRp(totalBonus)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Amount({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className={value < 0 ? "text-destructive" : undefined}>
      {value < 0 ? `− ${formatRp(-value)}` : formatRp(value)}
    </span>
  );
}

function DayRow({
  day,
  showLain,
  colCount,
}: {
  day: DayBreakdown;
  showLain: boolean;
  colCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`border-b border-border/50 cursor-pointer hover:bg-muted/20 ${
          day.bonus > 0 ? "" : "text-muted-foreground"
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-2 py-1.5 align-top">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-2 py-1.5 align-top text-xs">{formatDate(day.date)}</td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums">
          <Amount value={day.semarang} />
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums">
          <Amount value={day.pare} />
        </td>
        {showLain && (
          <td className="px-2 py-1.5 align-top text-right tabular-nums">
            <Amount value={day.lain} />
          </td>
        )}
        <td className="px-2 py-1.5 align-top text-right tabular-nums font-medium">
          {formatRp(day.total)}
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums font-bold text-quaternary">
          {day.bonus > 0 ? formatRp(day.bonus) : <span className="text-muted-foreground/40">—</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={colCount} className="px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
              Pembayaran {formatDate(day.date)} ({day.payments.length})
            </p>
            <ul className="space-y-1">
              {day.payments.map((p) => (
                <PaymentItem key={p.id} p={p} />
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function PaymentItem({ p }: { p: PaymentRow }) {
  const isRefund = p.kind === "refund";
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5">
      <span
        className={
          "shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider " +
          (isRefund
            ? "bg-red-100 text-red-800"
            : p.kind === "dp"
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800")
        }
      >
        {KIND_LABEL[p.kind] ?? p.kind}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs break-words">
          <span className="font-medium">{p.customerName}</span>
          <span className="text-muted-foreground">
            {" "}
            · {p.time} · {BRANCH_LABEL[p.branch ?? ""] ?? "cabang ?"}
          </span>
        </p>
        {(p.label || p.notes) && (
          <p className="text-[10px] text-muted-foreground break-words">
            {[p.label, p.notes].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <span
        className={
          "shrink-0 text-xs font-medium tabular-nums " +
          (isRefund ? "text-destructive" : "")
        }
      >
        {isRefund ? `− ${formatRp(-p.amount)}` : formatRp(p.amount)}
      </span>
    </li>
  );
}
