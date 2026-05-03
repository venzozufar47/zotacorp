"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  X,
} from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  setCustomCakeIncluded,
  type DayBreakdown,
  type TxRow,
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

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-4 space-y-2">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display text-base font-bold">Bonus Cake — Tasya Maynanda</h3>
            <p className="text-xs text-muted-foreground">
              Berdasarkan transaksi custom cake harian (Haengbocake Semarang & Pare).
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
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            Viewer-only — angka ini perlu admin <strong>input manual</strong> ke{" "}
            <em>monthly_bonus</em> di payslip Tasya. Klik tanggal untuk verifikasi
            transaksi yang masuk hitungan.
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
            Tidak ada transaksi Haengbocake bulan ini.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {[
                    "",
                    "Tgl",
                    "Jago",
                    "Mandiri",
                    "− Pare QRIS",
                    "Semarang",
                    "Total",
                    "Bonus",
                  ].map((c, i) => (
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
                  <DayRow key={d.date} day={d} />
                ))}
                <tr className="bg-muted/20 font-bold">
                  <td colSpan={6} className="px-2 py-2 text-right">
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

function DayRow({ day }: { day: DayBreakdown }) {
  const [expanded, setExpanded] = useState(false);
  const hasOverrides = day.transactions.some((t) => t.manualOverride !== null);

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
        <td className="px-2 py-1.5 align-top">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{formatDate(day.date)}</span>
            {hasOverrides && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300"
                title="Hari ini ada transaksi yang di-override admin"
              >
                manual
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums">
          {day.jago > 0 ? formatRp(day.jago) : <span className="text-muted-foreground/40">—</span>}
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums">
          {day.mandiri > 0 ? formatRp(day.mandiri) : <span className="text-muted-foreground/40">—</span>}
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums text-destructive">
          {day.pareQrisDeduction > 0
            ? `− ${formatRp(day.pareQrisDeduction)}`
            : <span className="text-muted-foreground/40">—</span>}
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums">
          {day.semarang > 0 ? formatRp(day.semarang) : <span className="text-muted-foreground/40">—</span>}
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums font-medium">
          {formatRp(day.total)}
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums font-bold text-quaternary">
          {day.bonus > 0 ? formatRp(day.bonus) : <span className="text-muted-foreground/40">—</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={8} className="px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
              Detail transaksi {formatDate(day.date)} ({day.transactions.length})
            </p>
            <ul className="space-y-1">
              {day.transactions.map((tx) => (
                <TxItem key={tx.id} tx={tx} />
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function TxItem({ tx }: { tx: TxRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [override, setOverride] = useState(tx.manualOverride);

  // 3-state cycle: null (auto) → true (force include) → false (force exclude) → null
  function cycle() {
    const next = override === null ? true : override === true ? false : null;
    setOverride(next);
    startTransition(async () => {
      const res = await setCustomCakeIncluded(tx.id, next);
      if ("error" in res) {
        toast.error(res.error);
        setOverride(tx.manualOverride);
        return;
      }
      router.refresh();
    });
  }

  const effective = override ?? tx.autoIncluded;
  const stateLabel =
    override === null ? "auto" : override ? "wajib include" : "wajib exclude";
  const Icon = effective ? Check : Minus;
  const stateColor = effective
    ? "text-emerald-600 bg-emerald-50 border-emerald-300"
    : "text-muted-foreground bg-muted border-border";

  return (
    <li
      className={`flex items-center gap-2 rounded-md border p-1.5 ${
        effective ? "border-border bg-card" : "border-border bg-muted/30 opacity-70"
      }`}
    >
      <button
        type="button"
        onClick={cycle}
        disabled={pending}
        title={`Klik untuk cycle: ${stateLabel} → next`}
        className={`shrink-0 size-6 inline-flex items-center justify-center rounded border ${stateColor} disabled:opacity-50`}
        aria-label="Toggle inclusion"
      >
        {override === null ? (
          <Icon size={12} />
        ) : override ? (
          <Check size={12} strokeWidth={3} />
        ) : (
          <X size={12} strokeWidth={3} />
        )}
      </button>
      <span
        className={
          "shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider " +
          (tx.bankKey === "jago"
            ? "bg-sky-100 text-sky-800"
            : tx.bankKey === "mandiri"
              ? "bg-amber-100 text-amber-800"
              : tx.bankKey === "cashPare"
                ? "bg-purple-100 text-purple-800"
                : "bg-emerald-100 text-emerald-800")
        }
      >
        {tx.bankLabel}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs break-words">
          {tx.description ?? "(no description)"}
        </p>
        {tx.sourceDestination && (
          <p className="text-[10px] text-muted-foreground break-words">
            from: {tx.sourceDestination}
          </p>
        )}
        {tx.notes && (
          <p className="text-[10px] text-muted-foreground italic break-words">
            {tx.notes}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums">
        {formatRp(tx.credit)}
      </span>
      {override !== null && (
        <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-700">
          manual
        </span>
      )}
    </li>
  );
}
