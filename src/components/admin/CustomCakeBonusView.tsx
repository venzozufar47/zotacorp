"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { dailyTier, TIER_CAP, TIER_MIN } from "@/lib/cake-bonus/tier-formula";
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

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Rp 550.000 → "550rb" untuk label ringkas. */
const rb = (n: number) => `${Math.round(n / 1000)}rb`;

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
    const params = new URLSearchParams(sp.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    params.set("view", "bonus-cake");
    router.push(`${pathname}?${params.toString()}`);
  }

  const totalOmset = days.reduce((s, d) => s + d.total, 0);
  const bonusDays = days.filter((d) => d.bonus > 0).length;
  // Terbaru di atas — yang biasanya dicek admin adalah hari-hari terakhir.
  const ordered = [...days].reverse();

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-base font-bold">
            Bonus Cake — Admin Haengbocake
          </h3>
          <p className="text-xs text-muted-foreground">
            Dihitung dari pembayaran order custom cake, per hari.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="size-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-28 text-center text-xs font-display font-bold uppercase tracking-wider">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="size-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total bonus" value={formatRp(totalBonus)} emphasis />
        <Stat label="Omset order" value={formatRp(totalOmset)} />
        <Stat
          label="Hari berbonus"
          value={`${bonusDays} / ${days.length}`}
        />
      </div>

      <details className="group rounded-lg bg-accent px-3 py-2 text-[11px] text-[var(--teal-700)]">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium">
          <Info size={12} className="shrink-0" />
          Cara hitung
          <ChevronDown
            size={12}
            className="ml-auto transition-transform group-open:rotate-180"
          />
        </summary>
        <ul className="mt-2 space-y-1 list-disc pl-4">
          <li>
            Omset hari = DP + pelunasan − refund dari semua order (Semarang &
            Pare), sesuai tanggal pembayaran dicatat (WIB).
          </li>
          <li>
            Di bawah Rp {rb(TIER_MIN)} → tanpa bonus · Rp {rb(TIER_MIN)}–
            {rb(TIER_CAP)} → 10% · di atas Rp {rb(TIER_CAP)} → Rp 70rb + 5%
            dari selisihnya.
          </li>
          <li>Order dibatalkan, dibuang, atau klaim gratis tidak dihitung.</li>
          <li>
            Otomatis masuk <strong>cake_bonus</strong> di slip gaji pemegang
            posisi <span className="font-mono">Admin Haengbocake</span> saat
            generate.
          </li>
        </ul>
      </details>

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Belum ada pembayaran order custom cake di {monthLabel}.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {ordered.map((d) => (
            <DayRow key={d.date} day={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-2.5 " +
        (emphasis
          ? "border-foreground bg-accent"
          : "border-border bg-muted/30")
      }
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <p
        className={
          "mt-0.5 font-display font-extrabold tabular-nums " +
          (emphasis ? "text-lg" : "text-sm")
        }
      >
        {value}
      </p>
    </div>
  );
}

function TierChip({ total }: { total: number }) {
  const tier = dailyTier(total);
  if (tier === "none") {
    return (
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
        &lt; {rb(TIER_MIN)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
      {tier === "flat" ? "10%" : "70rb + 5%"}
    </span>
  );
}

function DayRow({ day }: { day: DayBreakdown }) {
  const [expanded, setExpanded] = useState(false);
  const split = [
    day.semarang !== 0 && `Semarang ${formatRp(day.semarang)}`,
    day.pare !== 0 && `Pare ${formatRp(day.pare)}`,
    day.lain !== 0 && `Lainnya ${formatRp(day.lain)}`,
  ].filter(Boolean);

  return (
    <li className={day.bonus > 0 ? "" : "text-muted-foreground"}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
      >
        <ChevronRight
          size={14}
          className={
            "shrink-0 transition-transform " + (expanded ? "rotate-90" : "")
          }
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{formatDate(day.date)}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {split.join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium tabular-nums">
            {formatRp(day.total)}
          </p>
          <TierChip total={day.total} />
        </div>
        <p
          className={
            "w-20 shrink-0 text-right text-sm tabular-nums " +
            (day.bonus > 0 ? "font-bold text-quaternary" : "")
          }
        >
          {day.bonus > 0 ? formatRp(day.bonus) : "—"}
        </p>
      </button>
      {expanded && (
        <ul className="space-y-1 bg-muted/10 px-3 pb-2.5 pt-1">
          {day.payments.map((p) => (
            <PaymentItem key={p.id} p={p} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PaymentItem({ p }: { p: PaymentRow }) {
  const isRefund = p.kind === "refund";
  const detail = [p.label, p.notes].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5">
      <span
        className={
          "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
          (isRefund
            ? "bg-red-100 text-red-800"
            : p.kind === "dp"
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800")
        }
      >
        {KIND_LABEL[p.kind] ?? p.kind}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs">
          <span className="font-medium">{p.customerName}</span>
          <span className="text-muted-foreground">
            {" "}
            · {p.time} · {BRANCH_LABEL[p.branch ?? ""] ?? "cabang ?"}
          </span>
        </p>
        {detail && (
          <p className="break-words text-[10px] text-muted-foreground">
            {detail}
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
