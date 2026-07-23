"use client";

/** Sparkline inline-SVG sederhana (area + garis + titik akhir), tanpa
 *  lib. Pola sama dgn Sparkline di KpiTile. `values` lama → baru. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = "var(--teal-500, #0ea5a4)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${pad},${pad + h} ${line} ${pad + w},${pad + h}`;
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={area} fill={color} opacity={0.12} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={ex} cy={ey} r={2.5} fill={color} />
    </svg>
  );
}
