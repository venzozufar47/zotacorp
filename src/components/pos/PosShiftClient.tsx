"use client";

import { PosNavLink } from "./PosNavLink";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { PosShiftSummary } from "@/lib/actions/pos.actions";
import { formatRp } from "@/lib/cashflow/format";
import { formatDateTime } from "@/lib/utils/date";

interface Props {
  accountName: string;
  summary: PosShiftSummary;
}

export default function PosShiftClient({ accountName, summary }: Props) {
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

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-4">
      <header>
        <PosNavLink
          href="/pos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={12} /> Kembali ke POS
        </PosNavLink>
        <h1 className="font-semibold text-foreground">Cek Saldo Shift</h1>
        <p className="text-xs text-muted-foreground">
          {accountName} · {formatDateTime(asOf)} WIB
        </p>
      </header>

      {openingTill === null ? (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          <p className="font-medium mb-1">Saldo awal bulan belum di-set</p>
          <p className="text-xs text-muted-foreground">
            Admin perlu mengisi saldo awal bulan di laporan kas sebelum
            tampilan ini bisa menghitung saldo shift. Hubungi admin.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Row label="Saldo kas awal hari" value={formatRp(openingTill)} />
          <Row
            label="Masuk hari ini (cash)"
            value={`${cashSalesCount} transaksi · +${formatRp(cashCreditsToday)}`}
          />
          <Row
            label="Keluar hari ini"
            value={`${debitsCount} transaksi · −${formatRp(debitsToday)}`}
          />
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
            <p className="text-xs uppercase tracking-wider text-primary/80">
              Saldo kas seharusnya sekarang
            </p>
            <p className="mt-1 text-2xl font-semibold text-primary tabular-nums">
              {expectedTill !== null ? formatRp(expectedTill) : "—"}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Bandingkan dengan uang fisik di laci.
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-foreground">
              QRIS hari ini (tidak di laci)
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {qrisSalesCount} transaksi · {formatRp(qrisCreditsToday)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Hanya referensi — tidak dihitung ke kas fisik.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw size={12} className={isPending ? "animate-spin" : ""} />
          Refresh
        </button>
        <PosNavLink
          href="/pos/stok/opname/new"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Selesai shift? Input opname stok →
        </PosNavLink>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}
