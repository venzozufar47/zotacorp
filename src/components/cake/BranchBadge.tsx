import {
  CAKE_BRANCH_BG,
  CAKE_BRANCH_LABELS,
  type CakeBranch,
} from "@/lib/cake-orders/types";

/**
 * Pill kecil bertuliskan "Pare" / "Sem" untuk menandai cabang sebuah
 * order / slip. Dipakai di kanban card, slip header, dan production
 * lobby supaya warna + label-nya tetap konsisten.
 *
 *   - "xs" → tiny chip di kartu kanban (≈ 9px text)
 *   - "sm" → header chip di slip preview / lobby (≈ 10px text)
 */
export function BranchBadge({
  branch,
  size = "xs",
  short = false,
  prefix = false,
}: {
  branch: CakeBranch;
  size?: "xs" | "sm";
  /** Pakai singkatan "Sem" supaya muat di card sempit. */
  short?: boolean;
  /** Prepend "Cabang " untuk header slip yang butuh konteks penuh. */
  prefix?: boolean;
}) {
  const text = short && branch === "semarang" ? "Sem" : CAKE_BRANCH_LABELS[branch];
  const sizeCls =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0 text-[9px]";
  return (
    <span
      className={`inline-block rounded-full border border-foreground ${CAKE_BRANCH_BG[branch]} ${sizeCls} font-semibold uppercase tracking-wide`}
      title={`Cabang ${CAKE_BRANCH_LABELS[branch]}`}
    >
      {prefix ? `Cabang ${text}` : text}
    </span>
  );
}
