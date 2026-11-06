import Link from "next/link";
import { CheckCircle2, ChevronRight, ClipboardCheck } from "lucide-react";
import type { CountPlan } from "@/lib/procurement/count-plan";

/**
 * Pengingat opname harian untuk petugas pengadaan: satu baris. Belum selesai = baris kuning yang
 * bisa diketuk seluruhnya; selesai = baris hijau tenang.
 */
export function OpnameBanner({ plan, brand }: { plan: CountPlan; brand: string }) {
  if (!plan.enabled || plan.total === 0) return null;
  const href = `/pengadaan/opname?bu=${encodeURIComponent(brand)}`;
  const done = plan.doneCount >= plan.total;
  if (done) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl bg-success/10 px-3 text-sm">
        <CheckCircle2 size={16} aria-hidden className="shrink-0 text-success" />
        <span className="font-semibold">Opname hari ini selesai</span>
        <span className="text-muted-foreground tabular-nums">
          {plan.doneCount}/{plan.total}
        </span>
      </div>
    );
  }
  const started = plan.doneCount > 0;
  const detail =
    plan.phase === 1
      ? `Pendataan awal ${plan.onboarding.counted}/${plan.onboarding.total}`
      : started
        ? `${plan.doneCount}/${plan.total} bahan`
        : `${plan.total} bahan`;
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-xl bg-warning/20 px-3 py-1.5 transition-colors active:bg-warning/30"
    >
      <ClipboardCheck size={18} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">
          {started ? "Lanjutkan opname hari ini" : "Opname hari ini belum dilakukan"}
        </span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">{detail}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary">
        {started ? "Lanjut" : "Mulai"}
        <ChevronRight size={16} aria-hidden />
      </span>
    </Link>
  );
}
