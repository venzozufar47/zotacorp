import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, ListChecks } from "lucide-react";
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
  // Dua cabang bisa tampil berdampingan: label cabang membedakan keduanya.
  const shortBrand = brand.replace(/^Haengbocake\s+/i, "");
  const pct = Math.round((plan.doneCount / plan.total) * 100);
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border-2 border-foreground px-3.5 py-3 shadow-hard-sm transition duration-200",
        "bg-gradient-to-br from-warning/40 via-warning/20 to-warning/10 hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-foreground bg-warning">
        <ClipboardCheck size={22} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Opname · {shortBrand}</p>
        <p className="text-sm font-bold leading-tight">{started ? "Lanjutkan opname hari ini" : "Opname hari ini belum dilakukan"}</p>
        {started && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={0} aria-valuemax={plan.total} aria-valuenow={plan.doneCount}>
            <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
          <ListChecks size={12} aria-hidden />
          {started ? `${plan.doneCount}/${plan.total} bahan` : `${plan.total} bahan`}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition group-hover:gap-1.5">
        {started ? "Lanjutkan" : "Mulai"}
        <ArrowRight size={13} aria-hidden />
      </span>
    </Link>
  );
}
