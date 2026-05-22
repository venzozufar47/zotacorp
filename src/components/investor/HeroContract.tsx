"use client";

import { Cake, Building2 } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import type { InvestorContract } from "@/lib/actions/investor.actions";

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

export function HeroContract({
  investorName,
  contract,
  contractProgress,
  bepProgress,
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
}) {
  const Icon = BU_ICONS[contract.businessUnit] ?? Building2;
  const firstName = investorName.split(/\s+/)[0];
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
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold opacity-75">
              Ringkasan kontrak
            </p>
            <h1 className="mt-3 text-2xl sm:text-3xl leading-tight font-semibold">
              {greeting()}, {firstName}.
            </h1>
            <p className="mt-3 text-sm sm:text-[14.5px] leading-relaxed max-w-md opacity-90">
              Kontrak Anda di{" "}
              <span className="font-semibold">{contract.businessUnit}</span>{" "}
              sedang berjalan bulan ke-{contractProgress.runMonths}
              {contractProgress.permanent
                ? " (kontrak permanen)"
                : ` dari ${contract.durasiBulan}`}
              . Bagi hasil disetor ke{" "}
              {contract.payoutBankName && contract.payoutRekeningNumber
                ? `${contract.payoutBankName} ${contract.payoutRekeningNumber}`
                : contract.payoutRekeningLabel ?? "rekening terdaftar"}
              .
            </p>
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

        <div
          className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.14)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <HeroKpi
            label="Total investasi"
            value={formatRp(contract.totalInvestIdr)}
            sub={`Disetor ${new Date(contract.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`}
          />
          <HeroKpi
            label="Bagi hasil"
            value={`${contract.bagiHasilPct}%`}
            unit="/ bulan"
            sub="dari laba bersih bulanan setelah pajak"
          />
          <HeroKpi
            label="Durasi kontrak"
            value={contractProgress.permanent ? "∞" : `${contract.durasiBulan}`}
            unit={contractProgress.permanent ? "permanen" : "bulan"}
            sub={
              contractProgress.permanent
                ? `Sudah berjalan ${contractProgress.runMonths} bulan`
                : `Sisa ${contractProgress.remainMonths} bulan`
            }
            progress={contractProgress.permanent ? undefined : contractProgress.pct}
            progressColor="rgba(255,255,255,0.5)"
          />
          <HeroKpi
            label="BEP saat ini"
            value={`${bepProgress.pct.toFixed(1)}%`}
            sub={`${formatRp(bepProgress.current)} / ${formatRp(bepProgress.target)}`}
            progress={bepProgress.pct}
            progressColor="#7BE3A7"
          />
        </div>
      </div>
    </section>
  );
}

function HeroKpi({
  label,
  value,
  unit,
  sub,
  progress,
  progressColor,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  progress?: number;
  progressColor?: string;
}) {
  return (
    <div className="p-5" style={{ background: "rgba(8, 50, 64, 0.55)" }}>
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold opacity-75">
        {label}
      </p>
      <p className="mt-2 text-2xl sm:text-[26px] font-semibold tabular-nums leading-none">
        {value}
        {unit && (
          <span className="text-sm sm:text-[14px] font-medium opacity-70 ml-1">
            {unit}
          </span>
        )}
      </p>
      {progress != null && (
        <div
          className="mt-2.5 h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: "100%",
              background: progressColor ?? "#7BE3A7",
            }}
          />
        </div>
      )}
      {sub && <p className="mt-1.5 text-[11px] opacity-75">{sub}</p>}
    </div>
  );
}
