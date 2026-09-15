import type { PosDailyRevenueSummary } from "@/lib/actions/pos.actions";
import { formatRp, formatRpCompact } from "@/lib/cashflow/format";

/**
 * Kartu "omset hari ini vs target" — dipasang di sebelah kiri Service
 * Level di layar kasir (migrasi 146: `bank_accounts.daily_revenue_target`)
 * supaya karyawan selalu lihat progress tanpa buka menu lain.
 *
 * `summary === null` (target belum di-set admin, atau gate gagal) → kartu
 * tidak dirender sama sekali, mirror pola `serviceLevel &&` di POSClient.
 *
 * PALET: ikut token semantik (bg-success/10 dst) supaya otomatis benar di
 * override palet pink layar POS — sama seperti ServiceLevelHero.
 */
function tone(percent: number | null): { text: string; bg: string } {
  if (percent === null) return { text: "text-muted-foreground", bg: "bg-card" };
  if (percent >= 1) return { text: "text-success", bg: "bg-success/10" };
  if (percent >= 0.5) return { text: "text-warning", bg: "bg-warning/10" };
  return { text: "text-destructive", bg: "bg-destructive/10" };
}

export function DailyRevenueTargetCard({
  summary,
}: {
  summary: PosDailyRevenueSummary;
}) {
  if (summary.target === null) return null;
  const t = tone(summary.percent);
  const pct = summary.percent !== null ? Math.round(summary.percent * 100) : 0;

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border-2 border-foreground ${t.bg} px-3 py-2 shadow-[3px_3px_0_0_var(--foreground)]`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Omset Hari Ini
        </p>
        <p
          className={`font-display text-2xl font-extrabold tabular-nums leading-none ${t.text}`}
        >
          {formatRpCompact(summary.totalToday)}
        </p>
      </div>
      <p className="ml-auto text-right text-[11px] text-muted-foreground">
        target {formatRp(summary.target)}
        <br />
        <span className={`font-semibold ${t.text}`}>{pct}%</span> tercapai
      </p>
    </div>
  );
}
