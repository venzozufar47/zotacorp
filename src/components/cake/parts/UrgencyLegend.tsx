"use client";

/**
 * Inline legend explaining card urgency border colors. Always visible
 * so admins don't have to guess what "red border" means.
 */
export function UrgencyLegend() {
  const items: { color: string; label: string }[] = [
    { color: "var(--cake-late)", label: "Lewat" },
    { color: "var(--cake-today)", label: "Hari ini / besok" },
    { color: "var(--cake-week)", label: "2–5 hari lagi" },
    { color: "var(--cake-far)", label: ">5 hari" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10.5px]" style={{ color: "var(--cake-muted)" }}>
      <span className="font-semibold uppercase tracking-wider">Warna kartu:</span>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span
            className="inline-block size-3 rounded"
            style={{ background: it.color }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
