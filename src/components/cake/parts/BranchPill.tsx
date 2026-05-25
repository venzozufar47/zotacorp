"use client";

interface Props {
  branch: "pare" | "semarang";
  active?: boolean;
  count?: number;
  onClick?: () => void;
  /** Optional non-button visual (read-only chip). */
  asChip?: boolean;
}

/**
 * Pare/Semarang pill used in filter rows and form selectors. Uses
 * Haengbocake CSS variables so colors match the rest of the cake
 * admin (and don't leak elsewhere).
 */
export function BranchPill({ branch, active, count, onClick, asChip }: Props) {
  const isPare = branch === "pare";
  const soft = isPare ? "var(--cake-pare-soft)" : "var(--cake-sem-soft)";
  const fg = isPare ? "var(--cake-pare-fg)" : "var(--cake-sem-fg)";
  const label = isPare ? "Pare" : "Semarang";

  const baseStyle: React.CSSProperties = active
    ? {
        background: soft,
        color: fg,
        borderColor: fg,
        fontWeight: 600,
      }
    : {
        background: "var(--cake-surface)",
        color: "var(--cake-muted)",
        borderColor: "var(--cake-border)",
      };

  if (asChip) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider border"
        style={{ background: soft, color: fg, borderColor: "transparent" }}
      >
        {isPare ? "PARE" : "SEM"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium border-2 transition-colors"
      style={baseStyle}
    >
      {label}
      {count != null && (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums"
          style={{
            background: active ? "rgba(255,255,255,0.5)" : "var(--cake-border)",
            color: "inherit",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Generic "Semua" pill that shares look with BranchPill but neutral colors. */
export function AllBranchesPill({
  active,
  count,
  onClick,
}: {
  active?: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium border-2 transition-colors"
      style={
        active
          ? {
              background: "var(--cake-fg)",
              color: "#fff",
              borderColor: "var(--cake-fg)",
              fontWeight: 600,
            }
          : {
              background: "var(--cake-surface)",
              color: "var(--cake-muted)",
              borderColor: "var(--cake-border)",
            }
      }
    >
      Semua
      {count != null && (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums"
          style={{
            background: active ? "rgba(255,255,255,0.22)" : "var(--cake-border)",
            color: "inherit",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
