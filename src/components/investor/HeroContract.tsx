"use client";

import { useState } from "react";
import { Cake, Building2, ChevronDown, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import type { InvestorContract } from "@/lib/actions/investor.actions";
import type {
  InvestorHeroPerformance,
  HeroBranchPerformance,
} from "@/lib/investor/dashboard";

function greeting() {
  const h = Number(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hour12: false,
    })
  );
  if (h >= 5 && h < 12) return "Selamat pagi";
  if (h >= 12 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

const BU_ICONS: Record<string, typeof Cake> = {
  Haengbocake: Cake,
  "Yeobo Space": Building2,
};

const MONTH_LABELS_ID = [
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

function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS_ID[month - 1] ?? "?"} ${year}`;
}

export function HeroContract({
  investorName,
  contract,
  contractProgress,
  bepProgress,
  heroPerformance,
  totalCashback,
  payoutsCount,
}: {
  investorName: string;
  contract: InvestorContract;
  contractProgress: {
    runMonths: number;
    totalMonths: number | null;
    pct: number;
    remainMonths: number | null;
    permanent: boolean;
  };
  bepProgress: { current: number; target: number; pct: number };
  heroPerformance: InvestorHeroPerformance | null;
  /** Total dividen yang sudah diterima investor (sum semua payouts).
   *  Dipakai untuk kartu "Total dividen kumulatif" pada kontrak
   *  permanen (menggantikan BEP yang tidak relevan untuk permanen). */
  totalCashback: number;
  payoutsCount: number;
}) {
  const Icon = BU_ICONS[contract.businessUnit] ?? Building2;
  const firstName = investorName.split(/\s+/)[0];
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <section
      className="relative overflow-hidden rounded-3xl text-white"
      style={{
        background:
          "linear-gradient(135deg, #117a8c 0%, #08475a 55%, #04222b 100%)",
        boxShadow: "0 18px 40px -22px rgba(8, 71, 90, 0.55)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(180, 230, 240, 0.32) 0%, transparent 65%)",
          filter: "blur(20px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-20 w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(72, 184, 204, 0.24) 0%, transparent 65%)",
          filter: "blur(24px)",
        }}
      />
      <div className="relative p-6 sm:p-9">
        <div className="flex items-start justify-between gap-8 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[10px] uppercase tracking-[0.22em] font-semibold opacity-75">
                Ringkasan kontrak
              </p>
              <span aria-hidden className="opacity-30 text-[10px]">
                ·
              </span>
              <button
                type="button"
                onClick={() => setDetailOpen((v) => !v)}
                aria-expanded={detailOpen}
                className="press-feedback inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-semibold opacity-70 hover:opacity-100 transition-opacity"
              >
                Detail kontrak
                <ChevronDown
                  size={11}
                  strokeWidth={2.4}
                  className="transition-transform"
                  style={{
                    transform: detailOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
            </div>
            {detailOpen && (
              <p className="mt-2 text-[11.5px] leading-relaxed opacity-75 animate-fade-up tabular-nums">
                <span className="font-semibold">
                  {formatRp(contract.totalInvestIdr)}
                </span>{" "}
                investasi
                <span aria-hidden className="opacity-50 mx-1.5">
                  ·
                </span>
                <span className="font-semibold">
                  {contract.bagiHasilPctBeforeBep}%
                  <span className="opacity-60"> → </span>
                  {contract.bagiHasilPctAfterBep}%
                </span>{" "}
                bagi hasil (sebelum → setelah BEP)
                <span aria-hidden className="opacity-50 mx-1.5">
                  ·
                </span>
                {contractProgress.permanent ? (
                  <>
                    durasi{" "}
                    <span className="font-semibold">∞ permanen</span> (bulan
                    ke-{contractProgress.runMonths})
                  </>
                ) : (
                  <>
                    durasi{" "}
                    <span className="font-semibold">
                      {contract.durasiBulan} bulan
                    </span>{" "}
                    (sisa {contractProgress.remainMonths})
                  </>
                )}
                <span aria-hidden className="opacity-50 mx-1.5">
                  ·
                </span>
                disetor sejak{" "}
                {new Date(contract.startDate).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                <span aria-hidden className="opacity-50 mx-1.5">
                  ·
                </span>
                bagi hasil ke{" "}
                <span className="font-semibold">
                  {contract.payoutBankName && contract.payoutRekeningNumber
                    ? `${contract.payoutBankName} ${contract.payoutRekeningNumber}`
                    : contract.payoutRekeningLabel ?? "rekening terdaftar"}
                </span>
              </p>
            )}
            <h1 className="mt-3 text-2xl sm:text-3xl leading-tight font-semibold">
              {greeting()}, {firstName}.
            </h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold opacity-80">
              Unit bisnis
            </p>
            <div
              className="mt-1.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.20)",
              }}
            >
              <Icon size={14} strokeWidth={2.2} />
              <span className="text-sm font-semibold">
                {contract.businessUnit}
              </span>
            </div>
            {contract.contractRef && (
              <p className="mt-3 text-[10.5px] opacity-70 font-mono">
                {contract.contractRef}
              </p>
            )}
          </div>
        </div>

        {/* 3 metric utama: Revenue, Profit, BEP. Total investasi /
            bagi hasil / durasi dipindah ke disclosure "Detail kontrak"
            di bawah supaya kartu utama fokus ke kinerja, bukan ke
            struktur kontrak yang relatif statis. */}
        <div
          className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-px rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.14)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <PerformanceKpi
            label="Revenue bulan ini"
            kind="revenue"
            periodLabel={
              heroPerformance
                ? monthLabel(
                    heroPerformance.currentYear,
                    heroPerformance.currentMonth
                  )
                : null
            }
            value={
              heroPerformance ? formatRp(heroPerformance.revenueThisMonth) : "—"
            }
            avgValue={heroPerformance?.revenueLifetimeAvg ?? null}
            avgDeltaPct={heroPerformance?.revenueDeltaVsAvgPct ?? null}
            prevValue={heroPerformance?.revenuePrevMonth ?? null}
            prevDeltaPct={heroPerformance?.revenueDeltaMoMPct ?? null}
            monthsObserved={heroPerformance?.monthsObserved ?? 0}
            byBranch={heroPerformance?.byBranch ?? null}
          />
          <PerformanceKpi
            label="Profit bulan ini"
            kind="profit"
            periodLabel={
              heroPerformance
                ? monthLabel(
                    heroPerformance.currentYear,
                    heroPerformance.currentMonth
                  )
                : null
            }
            value={
              heroPerformance ? formatRp(heroPerformance.profitThisMonth) : "—"
            }
            avgValue={heroPerformance?.profitLifetimeAvg ?? null}
            avgDeltaPct={heroPerformance?.profitDeltaVsAvgPct ?? null}
            prevValue={heroPerformance?.profitPrevMonth ?? null}
            prevDeltaPct={heroPerformance?.profitDeltaMoMPct ?? null}
            monthsObserved={heroPerformance?.monthsObserved ?? 0}
            byBranch={heroPerformance?.byBranch ?? null}
          />
          {contractProgress.permanent ? (
            <CumulativeDividenKpi
              totalCashback={totalCashback}
              payoutsCount={payoutsCount}
              runMonths={contractProgress.runMonths}
            />
          ) : (
            <BepKpi bepProgress={bepProgress} />
          )}
        </div>
      </div>
    </section>
  );
}

function PerformanceKpi({
  label,
  kind,
  periodLabel,
  value,
  avgValue,
  avgDeltaPct,
  prevValue,
  prevDeltaPct,
  monthsObserved,
  byBranch,
}: {
  label: string;
  /** Menentukan field mana dari HeroBranchPerformance yang ditampilkan
   *  saat disclosure "Per cabang" dibuka. */
  kind: "revenue" | "profit";
  periodLabel: string | null;
  value: string;
  avgValue: number | null;
  avgDeltaPct: number | null;
  prevValue: number | null;
  prevDeltaPct: number | null;
  monthsObserved: number;
  byBranch: {
    Semarang: HeroBranchPerformance;
    Pare: HeroBranchPerformance;
  } | null;
}) {
  // monthsObserved ≤ 1 → tidak ada baseline yang valid. Untuk bulan
  // pertama jalan kontrak, baseline & MoM keduanya null — UI render
  // "Belum ada pembanding" supaya tidak terlihat seperti angka rusak.
  const noBaseline = monthsObserved <= 1;
  const [branchOpen, setBranchOpen] = useState(false);
  return (
    <div className="p-5" style={{ background: "rgba(8, 50, 64, 0.55)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold opacity-75">
          {label}
        </p>
        {periodLabel && (
          <p className="text-[10px] opacity-60 font-mono">{periodLabel}</p>
        )}
      </div>
      <p className="mt-2 text-2xl sm:text-[26px] font-semibold tabular-nums leading-none">
        {value}
      </p>
      {noBaseline ? (
        <p className="mt-2.5 text-[11px] opacity-65 leading-snug">
          Belum ada pembanding — bulan pertama kontrak berjalan.
        </p>
      ) : (
        <div className="mt-2.5 space-y-1">
          <DeltaLine
            label="vs rata-rata"
            baseValue={avgValue}
            deltaPct={avgDeltaPct}
          />
          <DeltaLine
            label="vs bulan lalu"
            baseValue={prevValue}
            deltaPct={prevDeltaPct}
          />
        </div>
      )}
      {byBranch && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => setBranchOpen((v) => !v)}
            aria-expanded={branchOpen}
            className="press-feedback inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-75 hover:opacity-100 transition-opacity"
          >
            Per cabang
            <ChevronDown
              size={12}
              strokeWidth={2.4}
              className="transition-transform"
              style={{
                transform: branchOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
          {branchOpen && (
            <div className="mt-2 space-y-1.5 animate-fade-up">
              <BranchRow
                name="Semarang"
                kind={kind}
                slice={byBranch.Semarang}
              />
              <BranchRow name="Pare" kind={kind} slice={byBranch.Pare} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BranchRow({
  name,
  kind,
  slice,
}: {
  name: "Semarang" | "Pare";
  kind: "revenue" | "profit";
  slice: HeroBranchPerformance;
}) {
  const value =
    kind === "revenue" ? slice.revenueThisMonth : slice.profitThisMonth;
  const prev =
    kind === "revenue" ? slice.revenuePrevMonth : slice.profitPrevMonth;
  const deltaPct =
    kind === "revenue" ? slice.revenueDeltaMoMPct : slice.profitDeltaMoMPct;
  const share =
    kind === "revenue"
      ? slice.revenueShareOfTotalPct
      : slice.profitShareOfTotalPct;
  let deltaIcon: React.ReactNode;
  let deltaColor = "rgba(255,255,255,0.5)";
  let deltaText = "—";
  if (deltaPct != null) {
    if (deltaPct > 0.5) {
      deltaIcon = <ArrowUp size={10} strokeWidth={2.6} />;
      deltaColor = "#7BE3A7";
      deltaText = `${deltaPct >= 1000 ? ">999" : deltaPct.toFixed(1)}%`;
    } else if (deltaPct < -0.5) {
      deltaIcon = <ArrowDown size={10} strokeWidth={2.6} />;
      deltaColor = "#F4A8A8";
      deltaText = `${Math.abs(deltaPct) >= 1000 ? ">999" : Math.abs(deltaPct).toFixed(1)}%`;
    } else {
      deltaIcon = <Minus size={10} strokeWidth={2.4} />;
      deltaText = "flat";
    }
  } else {
    deltaIcon = <Minus size={10} strokeWidth={2.4} />;
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold opacity-90">{name}</p>
        <p className="text-[10px] opacity-60 tabular-nums">
          {share.toFixed(0)}% dari total
          {prev != null && (
            <>
              {" · "}
              <span>prev {formatRp(prev)}</span>
            </>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[12.5px] font-semibold tabular-nums">
          {formatRp(value)}
        </p>
        <p
          className="text-[10px] tabular-nums font-semibold inline-flex items-center gap-0.5 justify-end"
          style={{ color: deltaColor }}
        >
          {deltaIcon}
          {deltaText}
        </p>
      </div>
    </div>
  );
}

function DeltaLine({
  label,
  baseValue,
  deltaPct,
}: {
  label: string;
  baseValue: number | null;
  deltaPct: number | null;
}) {
  const baseText = baseValue == null ? "—" : formatRp(baseValue);
  let icon: React.ReactNode;
  let deltaColor = "rgba(255,255,255,0.65)";
  let deltaText: string;
  if (deltaPct == null) {
    icon = <Minus size={11} strokeWidth={2.4} />;
    deltaText = "—";
  } else if (deltaPct > 0.5) {
    icon = <ArrowUp size={11} strokeWidth={2.6} />;
    deltaColor = "#7BE3A7";
    deltaText = `${deltaPct >= 1000 ? ">999" : deltaPct.toFixed(1)}%`;
  } else if (deltaPct < -0.5) {
    icon = <ArrowDown size={11} strokeWidth={2.6} />;
    deltaColor = "#F4A8A8";
    deltaText = `${Math.abs(deltaPct) >= 1000 ? ">999" : Math.abs(deltaPct).toFixed(1)}%`;
  } else {
    icon = <Minus size={11} strokeWidth={2.4} />;
    deltaText = "flat";
  }
  return (
    <p className="text-[11px] leading-snug opacity-85 flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-0.5 tabular-nums font-semibold"
        style={{ color: deltaColor }}
      >
        {icon}
        {deltaText}
      </span>
      <span className="opacity-70">
        {label} <span className="tabular-nums">({baseText})</span>
      </span>
    </p>
  );
}

/**
 * Khusus kontrak permanen, ganti BEP (yang tidak relevan karena tidak
 * ada target/durasi yang harus dicapai) dengan total dividen kumulatif
 * yang sudah diterima investor sejak kontrak mulai berjalan.
 */
function CumulativeDividenKpi({
  totalCashback,
  payoutsCount,
  runMonths,
}: {
  totalCashback: number;
  payoutsCount: number;
  runMonths: number;
}) {
  const avgPerMonth = runMonths > 0 ? totalCashback / runMonths : 0;
  return (
    <div className="p-5" style={{ background: "rgba(8, 50, 64, 0.55)" }}>
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold opacity-75">
        Total dividen kumulatif
      </p>
      <p className="mt-2 text-2xl sm:text-[26px] font-semibold tabular-nums leading-none">
        {formatRp(totalCashback)}
      </p>
      {payoutsCount === 0 ? (
        <p className="mt-2.5 text-[11px] opacity-65 leading-snug">
          Belum ada pembayaran tercatat.
        </p>
      ) : (
        <p className="mt-2.5 text-[11px] opacity-80 leading-snug">
          <span className="tabular-nums font-semibold">{payoutsCount}</span>{" "}
          kali pembayaran
          {avgPerMonth > 0 && (
            <>
              <span aria-hidden className="opacity-50 mx-1">
                ·
              </span>
              rata-rata{" "}
              <span className="tabular-nums">{formatRp(avgPerMonth)}</span>
              /bulan
            </>
          )}
        </p>
      )}
    </div>
  );
}

function BepKpi({
  bepProgress,
}: {
  bepProgress: { current: number; target: number; pct: number };
}) {
  return (
    <div className="p-5" style={{ background: "rgba(8, 50, 64, 0.55)" }}>
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold opacity-75">
        BEP saat ini
      </p>
      <p className="mt-2 text-2xl sm:text-[26px] font-semibold tabular-nums leading-none">
        {bepProgress.pct.toFixed(1)}%
      </p>
      <div
        className="mt-2.5 h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.14)" }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, bepProgress.pct))}%`,
            height: "100%",
            background: "#7BE3A7",
          }}
        />
      </div>
      <p className="mt-1.5 text-[11px] opacity-75 tabular-nums">
        {formatRp(bepProgress.current)} / {formatRp(bepProgress.target)}
      </p>
    </div>
  );
}

