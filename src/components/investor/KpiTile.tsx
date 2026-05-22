"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { MetricCommentBadge } from "./MetricCommentBadge";

export function KpiTile({
  label,
  value,
  trend,
  trendIsPp,
  help,
  sparkPoints,
  sparkColor = "var(--primary)",
  metricId,
  commentCount = 0,
  commentLastAuthorRole,
  onOpenComment,
}: {
  label: string;
  value: string;
  trend?: number | null;
  trendIsPp?: boolean;
  help?: string;
  sparkPoints?: number[];
  sparkColor?: string;
  metricId: string;
  commentCount?: number;
  commentLastAuthorRole?: "investor" | "admin";
  onOpenComment: (metricId: string, label: string) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const hasTrend = trend != null && Number.isFinite(trend);
  const up = (trend ?? 0) >= 0;
  const trendStr =
    trend != null
      ? Math.abs(trend) >= 100
        ? Math.abs(trend).toFixed(0)
        : Math.abs(trend).toFixed(1)
      : "";

  return (
    <div className="relative rounded-2xl bg-card p-4 sm:p-5 border border-border">
      <div className="absolute top-3 right-3">
        <MetricCommentBadge
          count={commentCount}
          lastAuthorRole={commentLastAuthorRole}
          onClick={() => onOpenComment(metricId, label)}
        />
      </div>
      <div className="flex items-start gap-1.5 pr-9">
        <p
          className="text-[10.5px] font-semibold uppercase tracking-[0.14em] leading-tight text-muted-foreground"
        >
          {label}
        </p>
        {help && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setHelpOpen((o) => !o)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Info"
            >
              <Info size={11} />
            </button>
            {helpOpen && (
              <div
                className="absolute top-full left-0 mt-1.5 p-2.5 rounded-lg w-56 z-20 bg-foreground text-card text-[11px] leading-relaxed shadow-lg"
                onClick={() => setHelpOpen(false)}
              >
                {help}
              </div>
            )}
          </div>
        )}
      </div>
      <p
        className="mt-2 text-xl sm:text-[22px] font-semibold tabular-nums leading-none"
        style={{ fontFamily: "var(--font-display, inherit)" }}
      >
        {value}
      </p>
      {hasTrend && (
        <p
          className="mt-1.5 text-[11px] font-semibold inline-flex items-center gap-1"
          style={{ color: up ? "#1d6b3a" : "#b42234" }}
        >
          {up ? "▲" : "▼"} {trendStr}
          {trendIsPp ? "pp" : "%"}
          <span className="font-normal text-muted-foreground">
            vs sebelumnya
          </span>
        </p>
      )}
      {sparkPoints && sparkPoints.length > 1 && (
        <div className="mt-3 -mb-1">
          <Sparkline points={sparkPoints} color={sparkColor} />
        </div>
      )}
    </div>
  );
}

function Sparkline({
  points,
  color,
  width = 220,
  height = 30,
}: {
  points: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (!points.length) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = points.length === 1 ? width : width / (points.length - 1);
  const coords = points.map((p, i) => [
    i * stepX,
    height - ((p - min) / range) * (height - 4) - 2,
  ]);
  const path = coords
    .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <path d={area} fill={color} opacity="0.1" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r="2.4"
        fill={color}
      />
    </svg>
  );
}
