import { getMyScorecards } from "@/lib/actions/scorecard.actions";
import { ScorecardView } from "./ScorecardView";
import { ScorecardPrevMonth } from "./ScorecardPrevMonth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Scorecard di beranda karyawan — SELALU tampil, cabang sesuai cabang masing-masing. Komponen
 * server asinkron: dibungkus <Suspense> di beranda supaya hitungannya (beberapa kueri POS) tidak
 * menahan halaman.
 */
export async function ScorecardSection({ simulatePrevMonth = false }: { simulatePrevMonth?: boolean } = {}) {
  const { detected, scorecards } = await getMyScorecards({ simulatePrevMonth });
  if (scorecards.length === 0) return null;
  return (
    <section aria-label="Scorecard cabang" className="space-y-4 animate-fade-up">
      {scorecards.map((sc) => (
        <div key={sc.branch} className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="eyebrow text-muted-foreground">Scorecard cabang {sc.branch}</span>
            <span aria-hidden className="ml-3 h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>
          <ScorecardView scorecard={sc} />
          <ScorecardPrevMonth scorecard={sc} />
        </div>
      ))}
      {!detected && (
        <p className="px-1 text-xs text-muted-foreground">
          Cabangmu belum terdeteksi dari lokasi kerja, jadi kedua cabang ditampilkan.
        </p>
      )}
    </section>
  );
}

export function ScorecardSectionSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      <Skeleton className="h-3 w-40" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={i === 0 ? "col-span-2 h-28 rounded-2xl lg:col-span-1" : "h-28 rounded-2xl"} />
        ))}
      </div>
    </div>
  );
}
