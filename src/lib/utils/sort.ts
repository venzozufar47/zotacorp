/**
 * Sort helpers for client-side sortable tables.
 *
 * Handles the mixed-type comparison cases tables care about:
 *  - strings → locale compare, case-insensitive
 *  - numbers → arithmetic
 *  - booleans → false < true
 *  - null/undefined → always sorted to the end, regardless of direction
 *
 * Intentionally NOT using Intl.Collator.compare caching per-call —
 * table sizes in this app are small (< 200 rows), so the overhead is
 * negligible and keeping the helper pure makes it trivial to test.
 */

export type SortDir = "asc" | "desc";

type SortValue = string | number | boolean | Date | null | undefined;

function compareValues(a: SortValue, b: SortValue): number {
  // null / undefined always at the bottom — asc or desc doesn't matter
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean")
    return a === b ? 0 : a ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;

  // Fallback: stringify. Shouldn't hit unless columns mix types.
  return String(a).localeCompare(String(b));
}

/**
 * Return a new array sorted by `accessor(row)` in the given direction.
 * Stable enough for our use cases: callers should feed already-stably-
 * ordered input (e.g. the server default) so equal keys keep their
 * original relative order.
 */
export function sortRows<T>(
  rows: T[],
  accessor: (row: T) => SortValue,
  dir: SortDir
): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => mul * compareValues(accessor(x), accessor(y)));
}
