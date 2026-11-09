"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { dailyTier, TIER_CAP, TIER_MIN } from "@/lib/cake-bonus/tier-formula";
import type {
  DayBreakdown,
  OutstandingSummary,
  PaymentRow,
} from "@/lib/actions/custom-cake-bonus.actions";

interface Props {
  month: number;
  year: number;
  monthLabel: string;
  days: DayBreakdown[];
  totalBonus: number;
  outstanding: OutstandingSummary;
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
  monthLabel,
  days,
  totalBonus,
  outstanding,
}: Props) {
  const totalOmset = days.reduce((s, d) => s + d.total, 0);
  const bonusDays = days.filter((d) => d.bonus > 0).length;
  // Terbaru di atas — yang biasanya dicek admin adalah hari-hari terakhir.
  const ordered = [...days].reverse();

  return (
    <div>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">Admin Haengbocake</p>
          <p className="text-sm font-semibold tabular-nums">{formatRp(totalBonus)}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Omset order {formatRp(totalOmset)} · {bonusDays}/{days.length} hari berbonus
        </p>
      </div>

      {outstanding.orders.length > 0 && (
        <Fold title={`Order belum lunas (${outstanding.orderCount})`} hint={formatRp(outstanding.amount)}>
          <OutstandingList outstanding={outstanding} monthLabel={monthLabel} />
        </Fold>
      )}

      <Fold title="Bonus per hari" hint={`${ordered.length} hari`}>
        {ordered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Belum ada pembayaran order custom cake di {monthLabel}.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {ordered.map((d) => (
              <DayRow key={d.date} day={d} />
            ))}
          </ul>
        )}
      </Fold>

      <Fold title="Cara hitung">
        <ul className="space-y-1 list-disc pl-4 text-xs text-muted-foreground">
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
            Outstanding = sisa tagihan order yang punya pembayaran di bulan
            ini. Belum masuk omset, jadi belum ikut bonus.
          </li>
          <li>
            Otomatis masuk <strong>cake_bonus</strong> di slip pemegang posisi{" "}
            <span className="font-mono">Admin Haengbocake</span>.
          </li>
        </ul>
      </Fold>
    </div>
  );
}

function Fold({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-t border-border">
      <summary className="flex items-center gap-2 px-4 min-h-11 cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
        {title}
        {hint && <span className="text-xs text-muted-foreground tabular-nums">{hint}</span>}
        <ChevronDown
          size={14}
          className="ml-auto text-muted-foreground transition-transform motion-reduce:transition-none group-open:rotate-180"
        />
      </summary>
      <div className="px-4 pb-3">{children}</div>
    </details>
  );
}

function reminderText(o: OutstandingSummary, monthLabel: string): string {
  const lines = o.orders.map((x, i) => {
    const when = x.scheduledDate ? ` · jadwal ${formatDate(x.scheduledDate)}` : "";
    const branch = BRANCH_LABEL[x.branch ?? ""] ?? "cabang ?";
    return `${i + 1}. ${x.customerName} (${branch})${when} · sisa ${formatRp(x.remaining)}`;
  });
  return [
    `Pengingat order custom cake yang belum lunas — ${monthLabel}`,
    "Pelunasan yang segera dicatat masuk ke omset & bonus hari pencatatan.",
    "",
    ...lines,
    "",
    `Total: ${formatRp(o.amount)} (${o.orderCount} order)`,
  ].join("\n");
}

function OutstandingList({
  outstanding,
  monthLabel,
}: {
  outstanding: OutstandingSummary;
  monthLabel: string;
}) {
  if (outstanding.orders.length === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(reminderText(outstanding, monthLabel));
      toast.success("Pengingat disalin — tinggal tempel ke WhatsApp");
    } catch {
      toast.error("Gagal menyalin. Salin manual dari daftar.");
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-amber-900">
            Order belum lunas ({outstanding.orderCount})
          </p>
          <p className="text-[10px] text-amber-800/80">
            Begitu pelunasan dicatat, nominalnya masuk omset &amp; bonus di
            hari pencatatan.
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-400 bg-card px-2.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          <Copy size={12} />
          Salin pengingat
        </button>
      </div>
      <ul className="space-y-1">
        {outstanding.orders.map((o) => (
          <li key={o.orderId}>
            <Link
              href={`/admin/cake-orders/${o.orderId}`}
              className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5 hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs">
                  <span className="font-medium">{o.customerName}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {BRANCH_LABEL[o.branch ?? ""] ?? "cabang ?"}
                    {o.scheduledDate ? ` · jadwal ${formatDate(o.scheduledDate)}` : ""}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Dibayar {formatRp(o.paid)} dari {formatRp(o.total)}
                </p>
              </div>
              <span className="shrink-0 text-xs font-bold tabular-nums text-amber-800">
                {formatRp(o.remaining)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
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
        {p.orderRemaining > 0 && (
          <p className="text-[10px] font-medium text-amber-700">
            Sisa tagihan order: {formatRp(p.orderRemaining)}
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
