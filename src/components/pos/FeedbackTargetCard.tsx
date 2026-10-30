import type { PosFeedbackToday } from "@/lib/actions/feedback.actions";

/**
 * Kartu "feedback pelanggan hari ini vs target" di layar kasir, sebelah Omset dan Service Level. Mengingatkan kasir untuk
 * mengajak pelanggan mengisi feedback (target 5 per hari; juga menentukan warna kartu feedback di scorecard cabang).
 * Warna ikut token semantik supaya benar di palet pink POS.
 */
function tone(count: number, target: number): { text: string; bg: string; bar: string } {
  if (count >= target) return { text: "text-success", bg: "bg-success/10", bar: "bg-success" };
  if (count >= Math.ceil(target / 2)) return { text: "text-warning", bg: "bg-warning/10", bar: "bg-warning" };
  return { text: "text-destructive", bg: "bg-destructive/10", bar: "bg-destructive" };
}

export function FeedbackTargetCard({ summary }: { summary: PosFeedbackToday }) {
  const t = tone(summary.count, summary.target);
  const pct = Math.min(100, Math.round((summary.count / summary.target) * 100));
  return (
    <div className={`flex h-full items-center gap-3 rounded-2xl border-2 border-foreground ${t.bg} px-3 py-2 shadow-[3px_3px_0_0_var(--foreground)]`}>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Feedback Hari Ini</p>
        <p className={`font-display text-2xl font-extrabold tabular-nums leading-none ${t.text}`}>
          {summary.count}
          <span className="text-base font-bold text-muted-foreground"> / {summary.target}</span>
        </p>
      </div>
      <div className="ml-auto min-w-0 text-right text-[11px] text-muted-foreground">
        <p>
          {summary.count >= summary.target ? "Target tercapai" : `${summary.target - summary.count} lagi`}
        </p>
        <span className="mt-1 block h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${pct}%` }} />
        </span>
      </div>
    </div>
  );
}
