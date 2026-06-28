/**
 * Instant skeleton for /admin/finance. Shown the moment the user clicks
 * into Keuangan while the (now light) server render runs — gives the page
 * an instant feel. Mirrors the real layout: header, BU tabs, action bar,
 * and a 2-column rekening card grid. Saldo per card is loaded client-side
 * after mount (see FinanceLandingClient), with its own skeleton.
 */
export default function FinanceLoading() {
  return (
    <div className="space-y-5 animate-fade-up" aria-busy="true">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-40 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-72 rounded bg-muted/70 animate-pulse" />
      </div>

      {/* BU tabs */}
      <div className="flex gap-2 flex-wrap">
        {[88, 104, 96, 84].map((w, i) => (
          <div
            key={i}
            className="h-9 rounded-full bg-muted animate-pulse"
            style={{ width: w }}
          />
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1.5">
          <div className="h-5 w-56 rounded bg-muted animate-pulse" />
          <div className="h-3 w-72 rounded bg-muted/70 animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
      </div>

      {/* Rekening card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-3xl border border-border bg-card p-5 space-y-4"
          >
            <div className="space-y-2">
              <div className="h-5 w-48 rounded bg-muted animate-pulse" />
              <div className="h-3 w-32 rounded bg-muted/70 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/50 p-3 space-y-2">
              <div className="h-2.5 w-24 rounded bg-muted/70 animate-pulse" />
              <div className="h-6 w-32 rounded-md bg-muted animate-pulse" />
              <div className="h-3 w-40 rounded bg-muted/60 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
