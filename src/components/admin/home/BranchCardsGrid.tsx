"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Wallet as WalletIcon,
  CakeSlice,
  Camera,
  TrendingUp,
  CheckCircle2,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp, formatRpCompact } from "@/lib/cashflow/format";
import { serviceLevelTone } from "@/lib/pos/service-level";
import { wasteTone } from "@/lib/pos/waste";
import type { AdminHomeToday, AdminOpsMetrics } from "@/lib/actions/admin-home.actions";
import type { YeoboRevenue, YeoboUtilization } from "@/lib/actions/admin-home-yeobo.actions";
import type { CashBalanceRow } from "@/lib/actions/admin-home-cash.actions";
import { getScorecardHome } from "@/lib/actions/unit-scorecard.actions";
import type { HomeData, HomeUnitCard } from "@/lib/unit-scorecard/persist";
import { ScorecardPanel, StatusBadge } from "@/components/admin/scorecard/ScorecardBits";
import { formatMetricValue } from "@/components/admin/scorecard/format";
import { UnitDetailDialog } from "@/components/admin/scorecard/UnitDetailDialog";

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
  unitScorecard,
}: {
  today: AdminHomeToday;
  ops: AdminOpsMetrics;
  yeobo: YeoboRevenue | null;
  yeoboUtilization: YeoboUtilization | null;
  cashBalances: CashBalanceRow[];
  /** Scorecard Unit Bisnis (superadmin): kolom ketiga di rincian cabang. */
  unitScorecard?: HomeData | null;
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

  const [sc, setSc] = useState<HomeData | null>(unitScorecard ?? null);
  const [openUnit, setOpenUnit] = useState<HomeUnitCard | null>(null);
  const [scPending, startSc] = useTransition();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const scUnit = (code: string) => sc?.units.find((u) => u.code === code);
  const changeScMonth = (month: string) =>
    startSc(async () => {
      const r = await getScorecardHome(month);
      if (r.ok && r.data) setSc(r.data);
    });
  const refreshSc = async () => {
    if (!sc?.selectedMonth) return;
    const r = await getScorecardHome(sc.selectedMonth);
    if (r.ok && r.data) {
      setSc(r.data);
      setOpenUnit((cur) => (cur ? r.data!.units.find((u) => u.unitId === cur.unitId) ?? null : null));
    }
  };

  const slByLabel = new Map(ops.outlets.map((o) => [o.label, o]));
  const cashByBranch = new Map(cashBalances.map((c) => [c.branch, c.balance]));
  const utilById = new Map((yeoboUtilization?.branches ?? []).map((b) => [b.id, b]));

  /** Temuan yang membuat sebuah cabang layak dilihat dulu: scorecard merah, operasional merah, omzet turun tajam. */
  const flagsFor = (
    unitCode: string,
    extra: {
      serviceLevel?: { v: number | null; tone: string };
      expired?: { v: number | null; tone: string };
      deltaPct?: number | null;
    }
  ): string[] => {
    const f: string[] = [];
    const u = scUnit(unitCode);
    if (u?.confirmedRed) f.push("Merah 2 periode berurutan");
    if (u && u.status !== "rampup") {
      for (const m of u.metrics) if (m.status === "red") f.push(`${m.label} ${formatMetricValue(m.value, m.valueUnit)}`);
    }
    if (extra.serviceLevel && extra.serviceLevel.tone === "destructive") f.push(`Service level ${pct(extra.serviceLevel.v)}`);
    if (extra.expired && extra.expired.tone === "destructive") f.push(`Ditarik expired & rusak ${pct(extra.expired.v)}`);
    if (extra.deltaPct != null && extra.deltaPct <= -25) {
      f.push(`Omzet ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(extra.deltaPct)}% vs bulan lalu`);
    }
    return f;
  };

  interface CockpitBranch {
    key: string;
    name: string;
    unitCode: string;
    revenue: number;
    flags: string[];
    sales: React.ReactNode;
    opsNode: React.ReactNode;
  }
  const branches: CockpitBranch[] = [];

  for (const b of [
    { key: "pare", name: "Pare", unitCode: "haengbocake_pare", href: "/pospare", sl: slByLabel.get("Pare"), p: "Pare" as const },
    { key: "semarang", name: "Semarang", unitCode: "haengbocake_semarang", href: "/possemarang", sl: slByLabel.get("Semarang"), p: "Smg" as const },
  ]) {
    const pos =
      b.p === "Pare"
        ? { today: today.posHbcPareToday, month: today.posHbcPareMonth, count: today.posHbcPareMonthCount, cmp: cmp?.posHbcPare, prevFull: today.prevMonthFull.posHbcPare }
        : { today: today.posHbcSmgToday, month: today.posHbcSmgMonth, count: today.posHbcSmgMonthCount, cmp: cmp?.posHbcSmg, prevFull: today.prevMonthFull.posHbcSmg };
    const cake =
      b.p === "Pare"
        ? { today: today.cakeHbcPareToday, month: today.cakeHbcPareMonth, count: today.cakeHbcPareMonthCount, cmp: cmp?.cakeHbcPare, prevFull: today.prevMonthFull.cakeHbcPare }
        : { today: today.cakeHbcSmgToday, month: today.cakeHbcSmgMonth, count: today.cakeHbcSmgMonthCount, cmp: cmp?.cakeHbcSmg, prevFull: today.prevMonthFull.cakeHbcSmg };
    const posDelta = deltaFor(pos.month, pos.today, pos.cmp, cmp?.prevLabel, pos.prevFull, today.prevMonthFull.label);
    const cakeDelta = deltaFor(cake.month, cake.today, cake.cmp, cmp?.prevLabel, cake.prevFull, today.prevMonthFull.label);
    const totalMonth = pos.month + cake.month;
    const totalPrev = pos.prevFull + cake.prevFull;
    const sl = b.sl;
    branches.push({
      key: b.key,
      name: b.name,
      unitCode: b.unitCode,
      revenue: displayMonth(totalMonth),
      flags: flagsFor(b.unitCode, {
        serviceLevel: sl ? { v: sl.serviceLevel, tone: serviceLevelTone(sl.serviceLevel, sl.serviceLevelTarget) } : undefined,
        expired: sl ? { v: sl.expiredRate, tone: wasteTone(sl.expiredRate) } : undefined,
        deltaPct: totalPrev > 0 ? ((displayMonth(totalMonth) - totalPrev) / totalPrev) * 100 : null,
      }),
      sales: (
        <>
          <RevenueLine
            icon={<WalletIcon size={12} />}
            label="POS"
            href={b.href}
            day={pos.today}
            month={displayMonth(pos.month)}
            projected={projected}
            delta={posDelta}
            aovMonth={aov(pos.month, pos.count)}
          />
          <RevenueLine
            icon={<CakeSlice size={12} />}
            label="Cake"
            day={cake.today}
            month={displayMonth(cake.month)}
            projected={projected}
            delta={cakeDelta}
            aovMonth={aov(cake.month, cake.count)}
          />
        </>
      ),
      opsNode: (
        <>
          <SectionLabel>Operasional · 30 hari</SectionLabel>
          {sl && (
            <>
              <StatLine label="Service level" value={pct(sl.serviceLevel)} tone={serviceLevelTone(sl.serviceLevel, sl.serviceLevelTarget)} />
              <StatLine label="Expired & rusak" value={pct(sl.expiredRate)} tone={wasteTone(sl.expiredRate)} />
            </>
          )}
          {cashByBranch.has(b.name) && <StatLine label="Saldo kas" value={formatRp(cashByBranch.get(b.name)!)} />}
        </>
      ),
    });
  }

  for (const yb of yeobo?.branches ?? []) {
    const util = utilById.get(yb.id);
    const delta = deltaFor(yb.month, yb.today, yb.prevSameRange, yeobo?.prevLabel, yb.prevMonthFull, yeobo?.prevMonthFullLabel ?? "");
    branches.push({
      key: yb.id,
      name: yb.label,
      unitCode: `yeobo_${yb.id}`,
      revenue: displayMonth(yb.month),
      flags: flagsFor(`yeobo_${yb.id}`, {
        deltaPct: yb.prevMonthFull > 0 ? ((displayMonth(yb.month) - yb.prevMonthFull) / yb.prevMonthFull) * 100 : null,
      }),
      sales: (
        <RevenueLine
          icon={<Camera size={12} />}
          label="Booking"
          day={yb.today}
          month={displayMonth(yb.month)}
          projected={projected}
          delta={delta}
          aovMonth={aov(yb.month, yb.monthCount)}
        />
      ),
      opsNode: util ? (
        <>
          <SectionLabel>Utilisasi slot</SectionLabel>
          <StatLine label={yeoboUtilization?.curMonthLabel ?? "Bulan ini"} value={util.curMonthToDatePct != null ? `${util.curMonthToDatePct.toFixed(1)}%` : "—"} />
          <StatLine label={yeoboUtilization?.prevMonthLabel ?? "Bulan lalu"} value={util.prevMonthPct != null ? `${util.prevMonthPct.toFixed(1)}%` : "—"} />
        </>
      ) : null,
    });
  }

  // Cabang paling bermasalah di depan: merah → kuning → abu-abu → hijau; seri → lebih banyak temuan.
  const rank = (code: string) => {
    const s = scUnit(code)?.status;
    return s === "red" ? 0 : s === "yellow" ? 1 : s === "green" ? 3 : 2;
  };
  const ordered = [...branches].sort((a, b) => rank(a.unitCode) - rank(b.unitCode) || b.flags.length - a.flags.length);
  const selected = ordered.find((b) => b.key === selectedKey) ?? ordered[0] ?? null;
  const selectedUnit = selected ? scUnit(selected.unitCode) : undefined;

  const TOP_BORDER: Record<string, string> = {
    red: "border-t-destructive",
    yellow: "border-t-warning",
    green: "border-t-success",
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.015em] text-foreground lg:text-base">Pilih cabang</div>
          <div className="text-[11px] text-muted-foreground">Cabang yang paling perlu perhatian di depan · klik untuk rincian lengkap</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sc && sc.periods.length > 0 && (
            <label className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Scorecard
              <select
                value={sc.selectedMonth ?? ""}
                onChange={(e) => changeScMonth(e.target.value)}
                disabled={scPending}
                aria-label="Periode scorecard"
                className="h-7 rounded-full border border-border bg-card px-2 text-[11px] font-semibold normal-case tracking-normal text-foreground"
              >
                {sc.periods.map((p) => (
                  <option key={p.month} value={p.month}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sc && (
            <Link
              href="/admin/scorecard-unit"
              title="Pengaturan scorecard: status data, ambang, unit & modal, rating Google"
              aria-label="Pengaturan scorecard"
              className="grid size-7 place-items-center rounded-full border border-border text-muted-foreground hover:bg-muted/50"
            >
              <Settings2 size={13} />
            </Link>
          )}
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
      </div>

      {/* Pemilih cabang */}
      <div role="tablist" aria-label="Cabang" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {ordered.map((b) => {
          const u = scUnit(b.unitCode);
          const on = selected?.key === b.key;
          return (
            <button
              key={b.key}
              role="tab"
              type="button"
              aria-selected={on}
              title={on ? `${b.name} sedang ditampilkan` : `Tampilkan rincian ${b.name}`}
              onClick={() => setSelectedKey(b.key)}
              className={cn(
                "rounded-xl border border-t-4 p-3 text-left transition duration-150",
                "shadow-[0_1px_2px_rgba(8,49,46,0.04),0_4px_16px_rgba(8,49,46,0.05)]",
                TOP_BORDER[u?.status ?? ""] ?? "border-t-muted-foreground/40",
                on ? "border-x-border border-b-border bg-accent/70" : "border-border/70 bg-card opacity-80 hover:bg-muted/40 hover:opacity-100"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-display text-[14px] font-bold text-foreground">
                  {on && <span aria-hidden className="size-2 rounded-full bg-[var(--teal-600)]" />}
                  {b.name}
                </span>
                {u && <StatusBadge status={u.status} />}
              </div>
              <div className="mt-2 font-display text-[18px] font-extrabold tracking-[-0.02em] tabular-nums text-foreground">Rp {formatRpCompact(b.revenue)}</div>
              <div className={cn("mt-0.5 text-[11.5px]", b.flags.length > 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {b.flags.length > 0 ? `${b.flags.length} temuan · ${b.flags[0]}` : "Tidak ada temuan"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Rincian satu cabang */}
      {selected && (
        <section
          key={selected.key}
          aria-label={`Rincian ${selected.name}`}
          className="mt-3 animate-fade-up rounded-2xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(8,49,46,0.04),0_4px_16px_rgba(8,49,46,0.05)]"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--teal-700)]">Cabang aktif</span>
            <h3 className="font-display text-lg font-extrabold text-foreground">{selected.name}</h3>
            {selectedUnit && <StatusBadge status={selectedUnit.status} />}
            {selectedUnit && sc?.selectedLabel && (
              <span className="text-[12px] text-muted-foreground">
                Scorecard {sc.selectedLabel}
                {selectedUnit.status === "rampup" && selectedUnit.rampUpUntil
                  ? ` · ramp-up s.d. ${new Date(`${selectedUnit.rampUpUntil}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
                  : ""}
              </span>
            )}
            {selectedUnit && (
              <button type="button" onClick={() => setOpenUnit(selectedUnit)} className="ml-auto rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-foreground hover:bg-muted">
                Rincian
              </button>
            )}
          </div>

          {selectedUnit?.confirmedRed && (
            <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] font-semibold text-destructive">
              <span className="flex-1">
                ■ Merah 2 periode berurutan
                {selectedUnit.actionsInPeriod === 0 ? " — keputusan wajib diisi" : selectedUnit.reviewed ? " — sudah ditinjau" : ""}
              </span>
              <button type="button" onClick={() => setOpenUnit(selectedUnit)} className="rounded-full bg-[var(--teal-600)] px-3 py-1 text-[12px] font-semibold text-white hover:opacity-90">
                Isi keputusan
              </button>
            </div>
          )}

          {/* 1. SCORECARD — inti panel, dengan grafik tren tiap metrik. */}
          {selectedUnit && sc?.selectedLabel ? (
            <div>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Scorecard · {sc.selectedLabel}</h4>
                <span className="text-[11px] text-muted-foreground">tren {sc.sparkMonths.length} periode terakhir</span>
              </div>
              <ScorecardPanel unit={selectedUnit} months={sc.sparkMonths} changes={sc.changes} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-[12px] text-muted-foreground">Scorecard belum tersedia untuk cabang ini.</div>
          )}

          {/* 2. Penjualan dan operasional mengikuti. */}
          <div className="mt-5 grid grid-cols-1 gap-6 border-t border-border/60 pt-4 md:grid-cols-2 md:gap-8">
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Penjualan</div>
              <div className="divide-y divide-border/50">{selected.sales}</div>
            </div>
            <div>
              <div className="divide-y divide-border/50">{selected.opsNode}</div>
            </div>
          </div>
        </section>
      )}

      {sc?.selectedLabel && (
        <div className="text-[10.5px] leading-snug text-muted-foreground">
          Scorecard {sc.selectedLabel}: dihitung otomatis tiap malam
          {sc.computedAt ? ` · diperbarui ${new Date(sc.computedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
          {sc.version > 1 ? ` · versi ${sc.version}` : ""}. Nilai tepat di batas masuk status yang lebih baik.
          {sc.warnings.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer font-semibold text-warning">▲ {sc.warnings.length} hal membuat angka bulan ini masih bisa berubah</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {sc.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <p className="text-[10.5px] leading-snug text-muted-foreground">
        Omzet Yeobo Space net setelah fee Mayar 2,2% (booking + tambahan) — sebanding
        dengan angka bank/P&L. Juga terlihat di beranda karyawan delegasi.
      </p>

      {openUnit && sc?.selectedMonth && (
        <UnitDetailDialog
          unit={openUnit}
          monthIso={sc.selectedMonth}
          monthLabel={sc.selectedLabel ?? ""}
          changes={sc.changes.filter((c) => c.unit_id === openUnit.unitId)}
          onClose={() => setOpenUnit(null)}
          onChanged={refreshSc}
        />
      )}
    </div>
  );
}
