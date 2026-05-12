import type {
  CakeOptionKind,
  CakeOptionsByKind,
  CakeProductionSlipStatus,
} from "./types";

/**
 * Build a `(kind, id) => label` resolver from the by-kind option set.
 * Centralised so CakeOrdersList / CakeOrderDetail / SlipChecklist /
 * SlipPreview can't drift in their fallback wording or the lookup.
 */
export function makeLabelFor(opts: CakeOptionsByKind | null) {
  return (kind: CakeOptionKind, id: string | null): string => {
    if (!id || !opts) return "—";
    return opts[kind].find((o) => o.id === id)?.label ?? "—";
  };
}

/** Slip statuses where admin can still curate items + verify. */
const SLIP_EDITABLE: CakeProductionSlipStatus[] = ["draft", "verified"];
export const isSlipEditable = (s: CakeProductionSlipStatus) =>
  SLIP_EDITABLE.includes(s);

/** Slip statuses where the snapshot is locked — production team is
 *  reading the frozen view, admin wajib reopen dulu untuk edit. */
const SLIP_FROZEN: CakeProductionSlipStatus[] = [
  "verified",
  "sent",
  "received",
  "closed",
];
export const isSlipFrozen = (s: CakeProductionSlipStatus | string) =>
  SLIP_FROZEN.includes(s as CakeProductionSlipStatus);
