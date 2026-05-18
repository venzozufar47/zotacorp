"use client";

import { PosNavLink } from "./PosNavLink";
import { PosShell } from "./PosShell";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, QrCode, RefreshCw, Wallet } from "lucide-react";
import type { PosShiftSummary } from "@/lib/actions/pos.actions";
import { formatRp } from "@/lib/cashflow/format";
import { formatDateTime } from "@/lib/utils/date";

interface Props {
  accountName: string;
  summary: PosShiftSummary;
  isAdmin: boolean;
}

export default function PosShiftClient({ accountName, summary, isAdmin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    asOf,
    openingTill,
    cashCreditsToday,
    cashSalesCount,
    qrisCreditsToday,
    qrisSalesCount,
    debitsToday,
    debitsCount,
    expectedTill,
  } = summary;

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const actions = (
    <>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 h-9 text-xs font-semibold text-foreground hover:translate-x-[1px] hover:translate-y-[1px] transition-transform disabled:opacity-50 whitespace-nowrap"
      >
        <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
        Refresh
      </button>
      <PosNavLink
        href="/pos/stok/opname/new"
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-3 h-9 text-xs font-semibold hover:translate-x-[1px] hover:translate-y-[1px] transition-transform whitespace-nowrap"
      >
        <CheckCircle2 size={13} />
        Tutup shift
      </PosNavLink>
    </>
  );

  return (
    <PosShell
      outletName={accountName}
      isAdmin={isAdmin}
      active="shift"
      title="Cek Saldo Shift"
      subtitle={`${formatDateTime(asOf)} WIB`}
      actions={actions}
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-5 space-y-3.5">
        {openingTill === null ? (
          <div className="rounded-2xl border-2 border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
            <p className="font-medium mb-1">Saldo awal bulan belum di-set</p>
            <p className="text-xs text-muted-foreground">
              Admin perlu mengisi saldo awal bulan di laporan kas sebelum
              tampilan ini bisa menghitung saldo shift. Hubungi admin.
            </p>
          </div>
        ) : (
          <>
            {/* Hero card — saldo seharusnya. Pink banner, dominan. */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-foreground bg-primary p-5 sm:p-6 text-primary-foreground shadow-[4px_4px_0_0_var(--foreground)]">
              <div
                aria-hidden
                className="absolute -right-12 -bottom-16 size-56 rounded-full bg-primary-foreground/10 pointer-events-none"
              />
              <p className="text-[11px] sm:text-xs uppercase tracking-[0.18em] font-semibold opacity-90">
                Saldo kas seharusnya sekarang
              </p>
              <p className="mt-2 text-3xl sm:text-5xl font-bold tabular-nums leading-tight">
                {expectedTill !== null ? formatRp(expectedTill) : "—"}
              </p>
              <p className="mt-3 text-xs sm:text-sm opacity-90 max-w-xl">
                Bandingkan dengan uang fisik di laci. Selisih lebih dari Rp 5.000 → catat di opname.
              </p>
            </div>

            {/* KPI grid — 3 kolom di tablet+, stack di mobile. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi
                tone="neutral"
                label="Saldo kas awal"
                value={formatRp(openingTill)}
                meta="awal hari"
              />
              <Kpi
                tone="success"
                label="Masuk (cash)"
                value={`+${formatRp(cashCreditsToday)}`}
                meta={`${cashSalesCount} transaksi`}
              />
              <Kpi
                tone="warning"
                label="Keluar"
                value={`−${formatRp(debitsToday)}`}
                meta={`${debitsCount} transaksi`}
              />
            </div>

            {/* Detail cards — QRIS + catatan keluar kas. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <DetailCard
                icon={<QrCode size={16} />}
                title="QRIS hari ini"
                subtitle="Tidak masuk ke kas fisik — referensi saja."
              >
                <div className="flex items-baseline justify-between py-2">
                  <span className="text-2xl font-bold tabular-nums text-foreground">
                    {formatRp(qrisCreditsToday)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {qrisSalesCount} transaksi
                  </span>
                </div>
                <div className="rounded-xl border-2 border-dashed border-border bg-muted/40 p-3 text-[11.5px] text-muted-foreground">
                  QRIS langsung masuk rekening — rekap otomatis di Insights → Pembayaran.
                </div>
              </DetailCard>

              <DetailCard
                icon={<Wallet size={16} />}
                title="Catatan keluar kas"
                subtitle="Pengeluaran dari uang laci hari ini."
              >
                {debitsCount === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">
                    Belum ada pengeluaran kas hari ini.
                  </p>
                ) : (
                  <div className="flex items-baseline justify-between py-2">
                    <span className="text-2xl font-bold tabular-nums text-destructive">
                      −{formatRp(debitsToday)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {debitsCount} transaksi
                    </span>
                  </div>
                )}
                <p className="text-[11.5px] text-muted-foreground">
                  Detail rincian per transaksi dapat dilihat admin di
                  rekap finance.
                </p>
              </DetailCard>
            </div>
          </>
        )}
      </div>
    </PosShell>
  );
}

function Kpi({
  tone,
  label,
  value,
  meta,
}: {
  tone: "neutral" | "success" | "warning";
  label: string;
  value: string;
  meta: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-success bg-success/10"
      : tone === "warning"
        ? "border-warning bg-warning/10"
        : "border-foreground bg-card";
  return (
    <div
      className={`rounded-2xl border-2 p-4 shadow-[3px_3px_0_0_var(--foreground)] ${toneClass}`}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="mt-1.5 text-xl sm:text-2xl font-bold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{meta}</p>
    </div>
  );
}

function DetailCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--foreground)] space-y-2">
      <div className="flex items-center gap-2 text-foreground">
        {icon}
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}
