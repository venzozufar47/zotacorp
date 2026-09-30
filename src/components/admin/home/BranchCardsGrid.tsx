"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Wallet as WalletIcon,
  CakeSlice,
  Camera,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { serviceLevelTone } from "@/lib/pos/service-level";
import { wasteTone } from "@/lib/pos/waste";
import type { AdminHomeToday, AdminOpsMetrics } from "@/lib/actions/admin-home.actions";
import type { YeoboRevenue, YeoboUtilization } from "@/lib/actions/admin-home-yeobo.actions";
import type { CashBalanceRow } from "@/lib/actions/admin-home-cash.actions";

/**
 * Satu kartu PER CABANG (Pare, Semarang, Jebres, Tembalang, Tlogosari) —
 * menggantikan trio kartu lama Omzet/AOV/Operasional yang masing-masing
 * melintasi SEMUA cabang sekaligus. Owner mau melihat "bagaimana kondisi
 * Pare hari ini" sekali pandang, bukan menyusun sendiri dari 3 tabel
 * terpisah yang tiap barisnya cuma satu cabang.
 *
 * Toggle Proyeksi/Aktual bulan ini SATU untuk seluruh grid (bukan per
 * kartu) — supaya tidak ada kartu yang kebetulan menampilkan basis
 * berbeda dari kartu sebelahnya saat dibandingkan berdampingan.
 */

const TONE_CLASS = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
} as const;

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

function jakartaMonthProgress(): { day: number; daysInMonth: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { day: d, daysInMonth: new Date(y, m, 0).getDate() };
}

function runRateProjection(monthToDate: number, day: number, daysInMonth: number): number {
  return (monthToDate / day) * daysInMonth;
}

interface MonthDelta {
  pct: number;
  title: string;
}

function monthDelta(
  curThroughYesterday: number | null,
  prev: number | null | undefined,
  prevLabel: string | null | undefined
): MonthDelta | null {
  if (curThroughYesterday == null || prev == null || !prevLabel || prev <= 0) return null;
  return {
    pct: ((curThroughYesterday - prev) / prev) * 100,
    title: `Dibanding ${prevLabel} bulan lalu (rentang tanggal sama, s.d. kemarin): ${formatRp(
      prev
    )} → ${formatRp(curThroughYesterday)}`,
  };
}

function monthDeltaProjected(
  projectedTotal: number,
  prevFull: number | null | undefined,
  prevFullLabel: string | null | undefined
): MonthDelta | null {
  if (prevFull == null || !prevFullLabel || prevFull <= 0) return null;
  return {
    pct: ((projectedTotal - prevFull) / prevFull) * 100,
    title: `Proyeksi vs ${prevFullLabel} (bulan lalu penuh): ${formatRp(
      prevFull
    )} → ~${formatRp(projectedTotal)}`,
  };
}

function aov(revenue: number, count: number): number | null {
  return count > 0 ? revenue / count : null;
}

function DeltaPill({ d }: { d: MonthDelta }) {
  const up = d.pct >= 0;
  const rounded = Math.abs(d.pct) < 0.05 ? 0 : d.pct;
  const txt = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(rounded);
  return (
    <span
      title={d.title}
      className={cn(
        "inline-block shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
      )}
    >
      {up ? "▲" : "▼"} {txt}%
    </span>
  );
}

/** Satu aliran omzet (POS / Cake / Yeobo) di dalam kartu cabang: nominal
 *  hari ini & bulan ini di baris pertama, AOV sebagai sub-baris kecil. */
function RevenueLine({
  icon,
  label,
  day,
  month,
  projected,
  delta,
  href,
  aovMonth,
}: {
  icon: React.ReactNode;
  label: string;
  day: number;
  month: number;
  projected: boolean;
  delta: MonthDelta | null;
  href?: string;
  /** AOV bulan ini saja — AOV harian dijatuhkan (sampel satu hari terlalu
   *  kecil untuk berarti, dan dua angka+delta di satu baris sempit adalah
   *  penyebab layout pecah/kepotong di zoom sempit — lihat riwayat commit). */
  aovMonth: number | null;
}) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <span className="grid size-[18px] shrink-0 place-items-center rounded-md bg-accent text-[var(--teal-600)]">
            {icon}
          </span>
          {href ? (
            <Link href={href} className="hover:underline hover:text-primary">
              {label}
            </Link>
          ) : (
            label
          )}
        </span>
        <span className="text-[12.5px] font-semibold tabular-nums text-foreground">
          {formatRp(day)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[25px] text-[11px] text-muted-foreground">
        <span>
          {projected ? "~" : ""}
          {formatRp(month)} bulan ini
        </span>
        {delta && <DeltaPill d={delta} />}
      </div>
      {aovMonth != null && (
        <div className="mt-0.5 pl-[25px] text-[10.5px] text-muted-foreground/75">
          AOV {formatRp(aovMonth)}
        </div>
      )}
    </div>
  );
}

function StatLine({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONE_CLASS;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[11.5px] first:pt-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", TONE_CLASS[tone])}>{value}</span>
    </div>
  );
}

function BranchCard({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card"
      style={{
        boxShadow: "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="border-b border-border/60 px-4 pt-3.5 pb-2">
        <div className="font-display text-[14px] font-bold text-foreground">{name}</div>
      </div>
      <div className="flex-1 divide-y divide-border/50 px-4 py-1">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-2.5 pb-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 first:pt-1.5">
      {children}
    </div>
  );
}

export function BranchCardsGrid({
  today,
  ops,
  yeobo,
  yeoboUtilization,
  cashBalances,
}: {
  today: AdminHomeToday;
  ops: AdminOpsMetrics;
  yeobo: YeoboRevenue | null;
  yeoboUtilization: YeoboUtilization | null;
  cashBalances: CashBalanceRow[];
}) {
  const cmp = today.monthCompare;
  const [mode, setMode] = useState<"runrate" | "actual">("runrate");
  const { day, daysInMonth } = jakartaMonthProgress();
  const canProject = day > 1;
  const projected = mode === "runrate" && canProject;
  const toggleMode = () => setMode((m) => (m === "runrate" ? "actual" : "runrate"));
  const displayMonth = (monthToDate: number) =>
    projected ? runRateProjection(monthToDate, day, daysInMonth) : monthToDate;
  const deltaFor = (
    monthActual: number,
    todayActual: number,
    prevPartial: number | null | undefined,
    prevPartialLabel: string | null | undefined,
    prevFull: number,
    prevFullLabel: string
  ) =>
    projected
      ? monthDeltaProjected(displayMonth(monthActual), prevFull, prevFullLabel)
      : monthDelta(monthActual - todayActual, prevPartial, prevPartialLabel);

  const slByLabel = new Map(ops.outlets.map((o) => [o.label, o]));
  const cashByBranch = new Map(cashBalances.map((c) => [c.branch, c.balance]));
  const utilById = new Map((yeoboUtilization?.branches ?? []).map((b) => [b.id, b]));

  const pareSl = slByLabel.get("Pare");
  const smgSl = slByLabel.get("Semarang");

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-display text-[15px] font-semibold tracking-[-0.015em] text-foreground lg:text-base">
          Per cabang
        </div>
        <button
          type="button"
          onClick={toggleMode}
          disabled={!canProject}
          title={
            !canProject
              ? "Proyeksi belum tersedia di tanggal 1."
              : projected
                ? "Menampilkan proyeksi akhir bulan. Klik untuk lihat angka aktual."
                : "Menampilkan angka aktual bulan berjalan. Klik untuk lihat proyeksi."
          }
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition",
            !canProject && "cursor-not-allowed opacity-60",
            projected
              ? "border border-dashed border-muted-foreground/50 text-muted-foreground hover:bg-muted/50"
              : "bg-[var(--teal-600)] text-white hover:opacity-90"
          )}
        >
          {projected ? <TrendingUp size={12} /> : <CheckCircle2 size={12} />}
          {projected ? "Proyeksi" : "Aktual"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* PARE */}
        <BranchCard name="Pare">
          <RevenueLine
            icon={<WalletIcon size={12} />}
            label="POS"
            href="/pospare"
            day={today.posHbcPareToday}
            month={displayMonth(today.posHbcPareMonth)}
            projected={projected}
            delta={deltaFor(
              today.posHbcPareMonth,
              today.posHbcPareToday,
              cmp?.posHbcPare,
              cmp?.prevLabel,
              today.prevMonthFull.posHbcPare,
              today.prevMonthFull.label
            )}
            aovMonth={aov(today.posHbcPareMonth, today.posHbcPareMonthCount)}
          />
          <RevenueLine
            icon={<CakeSlice size={12} />}
            label="Cake"
            day={today.cakeHbcPareToday}
            month={displayMonth(today.cakeHbcPareMonth)}
            projected={projected}
            delta={deltaFor(
              today.cakeHbcPareMonth,
              today.cakeHbcPareToday,
              cmp?.cakeHbcPare,
              cmp?.prevLabel,
              today.prevMonthFull.cakeHbcPare,
              today.prevMonthFull.label
            )}
            aovMonth={aov(today.cakeHbcPareMonth, today.cakeHbcPareMonthCount)}
          />
          <SectionLabel>Operasional · 30 hari</SectionLabel>
          {pareSl && (
            <>
              <StatLine
                label="Service level"
                value={pct(pareSl.serviceLevel)}
                tone={serviceLevelTone(pareSl.serviceLevel, pareSl.serviceLevelTarget)}
              />
              <StatLine
                label="Ditarik expired"
                value={pct(pareSl.expiredRate)}
                tone={wasteTone(pareSl.expiredRate)}
              />
            </>
          )}
          {cashByBranch.has("Pare") && (
            <StatLine label="Saldo kas" value={formatRp(cashByBranch.get("Pare")!)} />
          )}
        </BranchCard>

        {/* SEMARANG */}
        <BranchCard name="Semarang">
          <RevenueLine
            icon={<WalletIcon size={12} />}
            label="POS"
            href="/possemarang"
            day={today.posHbcSmgToday}
            month={displayMonth(today.posHbcSmgMonth)}
            projected={projected}
            delta={deltaFor(
              today.posHbcSmgMonth,
              today.posHbcSmgToday,
              cmp?.posHbcSmg,
              cmp?.prevLabel,
              today.prevMonthFull.posHbcSmg,
              today.prevMonthFull.label
            )}
            aovMonth={aov(today.posHbcSmgMonth, today.posHbcSmgMonthCount)}
          />
          <RevenueLine
            icon={<CakeSlice size={12} />}
            label="Cake"
            day={today.cakeHbcSmgToday}
            month={displayMonth(today.cakeHbcSmgMonth)}
            projected={projected}
            delta={deltaFor(
              today.cakeHbcSmgMonth,
              today.cakeHbcSmgToday,
              cmp?.cakeHbcSmg,
              cmp?.prevLabel,
              today.prevMonthFull.cakeHbcSmg,
              today.prevMonthFull.label
            )}
            aovMonth={aov(today.cakeHbcSmgMonth, today.cakeHbcSmgMonthCount)}
          />
          <SectionLabel>Operasional · 30 hari</SectionLabel>
          {smgSl && (
            <>
              <StatLine
                label="Service level"
                value={pct(smgSl.serviceLevel)}
                tone={serviceLevelTone(smgSl.serviceLevel, smgSl.serviceLevelTarget)}
              />
              <StatLine
                label="Ditarik expired"
                value={pct(smgSl.expiredRate)}
                tone={wasteTone(smgSl.expiredRate)}
              />
            </>
          )}
          {cashByBranch.has("Semarang") && (
            <StatLine label="Saldo kas" value={formatRp(cashByBranch.get("Semarang")!)} />
          )}
        </BranchCard>

        {/* YEOBO SPACE — satu kartu per cabang, data-driven (3 cabang). */}
        {yeobo?.branches.map((b) => {
          const util = utilById.get(b.id);
          return (
            <BranchCard key={b.id} name={b.label}>
              <RevenueLine
                icon={<Camera size={12} />}
                label="Booking"
                day={b.today}
                month={displayMonth(b.month)}
                projected={projected}
                delta={deltaFor(
                  b.month,
                  b.today,
                  b.prevSameRange,
                  yeobo.prevLabel,
                  b.prevMonthFull,
                  yeobo.prevMonthFullLabel
                )}
                aovMonth={aov(b.month, b.monthCount)}
              />
              {util && (
                <>
                  <SectionLabel>Utilisasi slot</SectionLabel>
                  <StatLine
                    label={yeoboUtilization?.curMonthLabel ?? "Bulan ini"}
                    value={
                      util.curMonthToDatePct != null
                        ? `${util.curMonthToDatePct.toFixed(1)}%`
                        : "—"
                    }
                  />
                  <StatLine
                    label={yeoboUtilization?.prevMonthLabel ?? "Bulan lalu"}
                    value={
                      util.prevMonthPct != null ? `${util.prevMonthPct.toFixed(1)}%` : "—"
                    }
                  />
                </>
              )}
            </BranchCard>
          );
        })}
      </div>

      <p className="text-[10.5px] leading-snug text-muted-foreground">
        Omzet Yeobo Space net setelah fee Mayar 2,2% (booking + tambahan) — sebanding
        dengan angka bank/P&L. Juga terlihat di beranda karyawan delegasi.
      </p>
    </div>
  );
}
