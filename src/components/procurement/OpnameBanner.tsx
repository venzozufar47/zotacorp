import Link from "next/link";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import type { CountPlan } from "@/lib/procurement/count-plan";
import { cn } from "@/lib/utils";

/**
 * Pengingat opname harian untuk petugas pengadaan: tampil di semua tab Pengadaan.
 * Belum mulai = kuning mencolok dengan tombol; sebagian = progres; selesai = hijau tenang.
 */
export function OpnameBanner({ plan, brand }: { plan: CountPlan; brand: string }) {
  if (!plan.enabled || plan.total === 0) return null;
  const href = `/pengadaan/opname?bu=${encodeURIComponent(brand)}`;
  const done = plan.doneCount >= plan.total;
  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success/50 bg-success/10 px-3.5 py-2.5 text-sm">
        <CheckCircle2 size={18} className="shrink-0 text-success" />
        <span className="font-semibold">Opname hari ini selesai</span>
        <span className="text-muted-foreground">
          · {plan.doneCount}/{plan.total} bahan
        </span>
      </div>
    );
  }
  const started = plan.doneCount > 0;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 shadow-hard-sm transition hover:-translate-y-0.5",
        "border-foreground bg-warning/25"
      )}
    >
      <ClipboardCheck size={22} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">{started ? "Lanjutkan opname hari ini" : "Opname hari ini belum dilakukan"}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {started ? `${plan.doneCount}/${plan.total} bahan sudah dihitung · ` : `${plan.total} bahan · `}±{plan.minutesLeft} menit lagi
        </p>
      </div>
      <span className="shrink-0 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
        {started ? "Lanjutkan" : "Mulai"}
      </span>
    </Link>
  );
}
