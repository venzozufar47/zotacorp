export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-32 rounded bg-muted mb-4" />
      <div className="h-9 w-64 rounded bg-muted mb-6" />
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-border bg-card mb-4" />
      <div className="h-48 rounded-2xl border border-border bg-card" />
    </div>
  );
}
