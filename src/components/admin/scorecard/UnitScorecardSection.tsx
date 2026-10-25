import { getScorecardHome } from "@/lib/actions/unit-scorecard.actions";
import { UnitScorecardBoard } from "./UnitScorecardBoard";

/** Server component: satu RPC + konfigurasi ber-cache. Dibungkus Suspense di beranda supaya tidak menahan bagian lain. */
export async function UnitScorecardSection() {
  const r = await getScorecardHome(null);
  if (!r.ok || !r.data) {
    return (
      <div className="mb-6 rounded-2xl border-2 border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
        Kesehatan Unit Bisnis tidak dapat dimuat{r.ok ? "" : `: ${r.error}`}.
      </div>
    );
  }
  return <UnitScorecardBoard initial={r.data} />;
}

export function UnitScorecardSkeleton() {
  return (
    <div className="mb-6 space-y-3" aria-hidden>
      <div className="h-7 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
