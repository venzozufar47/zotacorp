"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

interface Props<K extends string> {
  /** Stable key identifying this column. Passed to `onSort`. */
  sortKey: K;
  /** Display label. */
  label: React.ReactNode;
  /** Currently active sort key — null when no column is sorted. */
  currentKey: K | null;
  /** Direction of the current sort. Ignored when `currentKey` doesn't
   *  match this column. */
  currentDir: SortDir;
  /** Toggles asc → desc → clear (or asc on first click). Parent decides
   *  whether that's tri-state or always-a-direction. */
  onSort: (key: K) => void;
  /** Any extra classes for the TableHead wrapper. */
  className?: string;
}

/**
 * Reusable sortable table header. Click toggles the column's sort —
 * implementation of the toggle (asc/desc/none) is up to the parent.
 * An active column gets a filled arrow; idle columns get a faded
 * double-arrow so the user knows they're clickable.
 */
export function SortableHeader<K extends string>({
  sortKey,
  label,
  currentKey,
  currentDir,
  onSort,
  className,
}: Props<K>) {
  const isActive = currentKey === sortKey;

  return (
    <TableHead className={cn("select-none", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:opacity-90 transition-opacity"
        aria-label={`Sort by ${typeof label === "string" ? label : sortKey}`}
        aria-sort={
          !isActive ? "none" : currentDir === "asc" ? "ascending" : "descending"
        }
      >
        {label}
        {isActive ? (
          currentDir === "asc" ? (
            <ArrowUp size={12} strokeWidth={2.5} />
          ) : (
            <ArrowDown size={12} strokeWidth={2.5} />
          )
        ) : (
          <ArrowUpDown size={12} className="opacity-50" strokeWidth={2.5} />
        )}
      </button>
    </TableHead>
  );
}
