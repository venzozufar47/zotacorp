import { CheckCircle2, ClipboardList } from "lucide-react";
import type { CountPlan } from "@/lib/procurement/count-plan";
import { DAILY_BUDGET, ONBOARDING_BUDGET } from "@/lib/procurement/cycle-count";

/**
 * Kemajuan "Pendataan awal" (tahap 1): bahan di resep yang belum pernah dihitung didahulukan sampai semuanya punya
 * titik awal stok. Setelah itu sistem pindah ke siklus ABC rutin (tahap 2).
 */
export function OnboardingProgress({ plan }: { plan: CountPlan }) {
  const { counted, total } = plan.onboarding;
  if (!plan.enabled || total === 0) return null;
  if (plan.phase === 2) {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border border-success/50 bg-success/10 px-3.5 py-3 text-sm">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
        <p>
          <span className="font-semibold">Tahap 2 · Opname rutin.</span>{" "}
          <span className="text-muted-foreground">
            Semua {total} bahan sudah punya titik awal stok. Daftar harian kini mengikuti kelas A/B/C.
          </span>
        </p>
      </div>
    );
  }
  const left = total - counted;
  const pct = Math.round((counted / total) * 100);
  const days = Math.max(1, Math.ceil(left / ONBOARDING_BUDGET));
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card px-3.5 py-3 shadow-hard-sm">
      <div className="flex items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-foreground bg-primary text-primary-foreground">
          <ClipboardList size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Tahap 1 · Pendataan awal</p>
          <p className="text-sm font-bold leading-tight tabular-nums">
            {counted} dari {total} bahan sudah dihitung
          </p>
        </div>
        <span className="shrink-0 text-sm font-extrabold tabular-nums">{pct}%</span>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-foreground/10"
        role="progressbar"
        aria-label="Kemajuan pendataan awal"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={counted}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Sisa {left} bahan, ±{days} hari kerja lagi ({ONBOARDING_BUDGET} bahan per hari). Hitungan pertama jadi titik awal
        stok dan tidak dibandingkan dengan estimasi. Setelah semua terhitung, daftar kembali ke ritme rutin ({DAILY_BUDGET} bahan per hari).
      </p>
    </div>
  );
}
