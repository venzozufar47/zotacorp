import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { periodLabel } from "@/lib/bonus/periods";
import type { BranchBonusView } from "@/lib/actions/bonus.actions";
import { PublishBonusButton } from "./PublishBonusButton";

const BAND_DOT: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
};

function Row({ label, value, strong, minus, hint }: { label: string; value: string; strong?: boolean; minus?: boolean; hint?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", strong && "border-t border-border pt-2 font-bold")}>
      <span className={cn("min-w-0 text-[13px]", !strong && "text-muted-foreground")}>
        {minus && <span aria-hidden className="mr-1.5 inline-block w-3 text-center">−</span>}
        {label}
        {hint && <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0 text-[13.5px] tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Hitungan bonus satu cabang untuk satu bulan: omzet → HPP → LK aktual → selisih dari LK dasar → × p → × pengali
 * scorecard → kolam, lalu pembagian ke penerima. Semua langkah ditampilkan supaya transparan (dan siap dipakai slip gaji).
 */
export function BranchBonusCard({ view, period, canPublish, simulated }: { view: BranchBonusView; period: string; canPublish: boolean; simulated?: boolean }) {
  const b = view.breakdown;
  const params = view.params;
  const legacy = b.regime === "laba_rugi";
  const totalPoints = b.metrics.reduce((s, m) => s + m.points, 0);
  const status = view.frozen ? "terbit" : view.runStatus === "draft" ? "draft" : "hitung";

  return (
    <section className="space-y-4 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-extrabold">Haengbocake {view.branch}</h3>
          <p className="text-[12px] text-muted-foreground">{periodLabel(period)}{b.asOf ? ` · data s.d. ${b.asOf.slice(8, 10)}/${b.asOf.slice(5, 7)}` : ""}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
            simulated
              ? "border-warning/60 bg-warning/10 text-warning"
              : status === "terbit"
                ? "border-success/60 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground"
          )}
        >
          {status === "terbit" && !simulated ? <CheckCircle2 size={12} /> : <Clock size={12} />}
          {simulated ? "Simulasi" : status === "terbit" ? "Sudah terbit" : canPublish ? "Belum terbit" : "Sementara"}
        </span>
      </header>

      {view.error ? (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Gagal menghitung: {view.error}
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-primary/10 px-4 py-3">
            <p className="text-[12px] font-semibold text-muted-foreground">Kolam bonus</p>
            <p className="font-display text-3xl font-extrabold tabular-nums">{formatRp(Math.round(view.pool))}</p>
            {params && b.grossProfit <= params.lkDasar && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">LK aktual belum melewati LK dasar, jadi belum ada kolam.</p>
            )}
          </div>

          <div className="divide-y divide-border/60">
            {legacy ? (
              <Row label="Omzet (laporan laba-rugi)" value={formatRp(b.revenue.total)} />
            ) : (
              <>
                <Row label="Omzet POS" value={formatRp(b.revenue.pos)} />
                <Row label="Omzet Custom Cake" value={formatRp(b.revenue.cake)} />
                {b.revenue.other > 0 && <Row label="Other Revenue" value={formatRp(b.revenue.other)} hint="Alokasi pendapatan lain dari Pusat" />}
                <Row label="Omzet total" value={formatRp(b.revenue.total)} strong />
              </>
            )}
            <Row label="HPP" value={formatRp(b.cogs)} minus hint="Pembelian bahan (Cost of Goods Sold) di buku kas" />
            <Row label="Laba kotor (LK) aktual" value={formatRp(b.grossProfit)} strong />
            {params ? (
              <>
                <Row label="LK dasar" value={formatRp(params.lkDasar)} minus />
                <Row label="Selisih di atas LK dasar" value={formatRp(view.surplus)} strong />
                <Row label={`× p`} value={`${params.p}%`} />
                <Row
                  label="× Pengali scorecard"
                  value={`${totalPoints.toLocaleString("id-ID")} / 4 = ${view.multiplier.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`}
                />
              </>
            ) : null}
          </div>

          {b.metrics.length > 0 && (
            <ul className="grid gap-x-4 gap-y-1 rounded-xl bg-muted/40 px-3 py-2 sm:grid-cols-2">
              {b.metrics.map((m) => (
                <li key={m.key} className="flex items-center gap-2 text-[12px]">
                  <span className={cn("size-2.5 shrink-0 rounded-full", BAND_DOT[m.band] ?? "bg-muted-foreground")} />
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{m.displayValue}</span>
                  <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{m.points} poin</span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <h4 className="mb-1 text-[13px] font-bold">Pembagian sama rata</h4>
            {view.shares.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Belum ada penerima bonus untuk cabang ini.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {view.shares.map((s) => (
                  <li key={s.userId} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{s.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {s.label ? `${s.label} · ` : ""}
                        {s.hours.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam hadir
                        {!s.excluded && view.pool > 0 && ` · bagian ${(s.fraction * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
                      </p>
                    </div>
                    {s.excluded ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">{s.excludedReason}</span>
                    ) : (
                      <span className="shrink-0 font-display text-[17px] font-extrabold tabular-nums">{formatRp(Math.round(s.share))}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {view.notes.length > 0 && (
        <ul className="space-y-1">
          {view.notes.map((n) => (
            <li key={n} className="flex items-start gap-2 text-[12px] text-warning">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {n}
            </li>
          ))}
        </ul>
      )}

      {canPublish && !view.frozen && !view.error && params && view.shares.length > 0 && <PublishBonusButton branch={view.branch} period={period} />}
    </section>
  );
}
