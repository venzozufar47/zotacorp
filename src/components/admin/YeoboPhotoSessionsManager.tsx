"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  upsertYeoboPhotoSession,
  type PhotoSessionRow,
} from "@/lib/actions/yeobo-photo-sessions.actions";
import { MONTH_NAMES } from "@/lib/utils/date-formats";

const BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

type Ym = { year: number; month: number };
const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const ymLabel = (y: number, m: number) => `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`;
const nextYm = (y: number, m: number): Ym =>
  m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };

interface RowDef {
  studio: string;
  packageLabel: string;
  sortOrder: number;
  isStudioLeaf: boolean; // studio with no package tier (Besar / Pas Foto / Look Up)
}

export function YeoboPhotoSessionsManager({
  sessions,
}: {
  sessions: PhotoSessionRow[];
}) {
  const router = useRouter();
  const [branch, setBranch] = useState<string>(
    () => BRANCHES.find((b) => sessions.some((s) => s.branch === b)) ?? BRANCHES[0]
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [extraMonths, setExtraMonths] = useState<Ym[]>([]);
  const [pending, startTransition] = useTransition();

  const branchRows = useMemo(
    () => sessions.filter((s) => s.branch === branch),
    [sessions, branch]
  );

  // Distinct (studio, package) row definitions, ordered by sort_order.
  const rowDefs = useMemo<RowDef[]>(() => {
    const map = new Map<string, RowDef>();
    for (const s of branchRows) {
      const key = `${s.studio}|${s.packageLabel}`;
      if (!map.has(key))
        map.set(key, {
          studio: s.studio,
          packageLabel: s.packageLabel,
          sortOrder: s.sortOrder,
          isStudioLeaf: s.packageLabel === "",
        });
    }
    return [...map.values()].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.studio.localeCompare(b.studio) ||
        a.packageLabel.localeCompare(b.packageLabel)
    );
  }, [branchRows]);

  // Month columns: those present in data + any admin-added, ascending.
  const months = useMemo<Ym[]>(() => {
    const set = new Map<string, Ym>();
    for (const s of branchRows) set.set(ymKey(s.periodYear, s.periodMonth), { year: s.periodYear, month: s.periodMonth });
    for (const e of extraMonths) set.set(ymKey(e.year, e.month), e);
    return [...set.values()].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  }, [branchRows, extraMonths]);

  // Initial session value per (studio|package, year-month).
  const initial = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of branchRows)
      m.set(`${s.studio}|${s.packageLabel}|${ymKey(s.periodYear, s.periodMonth)}`, s.sessions);
    return m;
  }, [branchRows]);

  const cellKey = (r: RowDef, ym: Ym) =>
    `${r.studio}|${r.packageLabel}|${ymKey(ym.year, ym.month)}`;
  const cellVal = (r: RowDef, ym: Ym): string => {
    const k = cellKey(r, ym);
    if (k in edits) return edits[k];
    const v = initial.get(k);
    return v != null ? String(v) : "";
  };
  const cellNum = (r: RowDef, ym: Ym): number => {
    const v = cellVal(r, ym);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Per-studio package subtotal + grand total per month (live).
  const studios = useMemo(
    () => [...new Set(rowDefs.map((r) => r.studio))],
    [rowDefs]
  );
  const studioSubtotal = (studio: string, ym: Ym) =>
    rowDefs
      .filter((r) => r.studio === studio && !r.isStudioLeaf)
      .reduce((s, r) => s + cellNum(r, ym), 0);
  const grandTotal = (ym: Ym) => rowDefs.reduce((s, r) => s + cellNum(r, ym), 0);

  const dirtyCount = Object.keys(edits).filter((k) => {
    const cur = edits[k];
    const init = initial.get(k);
    return String(init ?? "") !== cur && !(init == null && cur === "");
  }).length;

  function save() {
    const changed = Object.entries(edits).filter(([k, cur]) => {
      const init = initial.get(k);
      return String(init ?? "") !== cur && !(init == null && cur === "");
    });
    if (changed.length === 0) {
      toast.info("Tidak ada perubahan");
      return;
    }
    startTransition(async () => {
      for (const [k, cur] of changed) {
        const [studio, packageLabel, ym] = k.split("|");
        const [y, m] = ym.split("-").map(Number);
        const def = rowDefs.find(
          (r) => r.studio === studio && r.packageLabel === packageLabel
        );
        const res = await upsertYeoboPhotoSession({
          branch,
          studio,
          packageLabel,
          periodYear: y,
          periodMonth: m,
          sessions: Math.max(0, Math.round(Number(cur) || 0)),
          sortOrder: def?.sortOrder ?? 0,
        });
        if (!res.ok) {
          toast.error(res.error ?? "Gagal menyimpan");
          return;
        }
      }
      toast.success(`${changed.length} sel disimpan`);
      setEdits({});
      router.refresh();
    });
  }

  function addMonth() {
    const last = months[months.length - 1];
    const nx = last ? nextYm(last.year, last.month) : (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; })();
    setExtraMonths((xs) => [...xs, nx]);
  }

  const numCls =
    "w-16 rounded border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums focus:border-primary";

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Jumlah sesi foto per cabang Yeobo Space, per studio & paket, per bulan.
        Backfill dari dashboard cabang; admin bisa edit / tambah bulan berjalan.
      </p>

      {/* Branch pills */}
      <div className="flex flex-wrap gap-1.5">
        {BRANCHES.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => {
              setBranch(b);
              setEdits({});
              setExtraMonths([]);
            }}
            className={`px-3 h-8 rounded-lg text-sm font-semibold border ${
              b === branch
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {rowDefs.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          Belum ada data sesi foto untuk {branch}.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead className="bg-muted/50">
              <tr>
                <th className="bg-muted/50 px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  Studio / Paket
                </th>
                {months.map((ym) => (
                  <th
                    key={ymKey(ym.year, ym.month)}
                    className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                  >
                    {ymLabel(ym.year, ym.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studios.map((studio) => {
                const pkgRows = rowDefs.filter(
                  (r) => r.studio === studio && !r.isStudioLeaf
                );
                const leafRow = rowDefs.find(
                  (r) => r.studio === studio && r.isStudioLeaf
                );
                return (
                  <Fragment key={studio}>
                    <tr className="border-t border-border bg-muted/30">
                      <td
                        colSpan={months.length + 1}
                        className="bg-muted/30 px-3 py-1.5 text-xs font-semibold text-foreground"
                      >
                        {studio}
                      </td>
                    </tr>
                    {pkgRows.map((r) => (
                      <tr key={`${studio}|${r.packageLabel}`} className="border-t border-border/60">
                        <td className="bg-card px-3 py-1 text-xs text-muted-foreground whitespace-nowrap">
                          {r.packageLabel}
                        </td>
                        {months.map((ym) => (
                          <td key={ymKey(ym.year, ym.month)} className="px-1 py-0.5 text-right">
                            <input
                              type="number"
                              value={cellVal(r, ym)}
                              onChange={(e) =>
                                setEdits((x) => ({ ...x, [cellKey(r, ym)]: e.target.value }))
                              }
                              className={numCls}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {leafRow && (
                      <tr key={`${studio}|leaf`} className="border-t border-border/60">
                        <td className="bg-card px-3 py-1 text-xs text-muted-foreground whitespace-nowrap">
                          (total)
                        </td>
                        {months.map((ym) => (
                          <td key={ymKey(ym.year, ym.month)} className="px-1 py-0.5 text-right">
                            <input
                              type="number"
                              value={cellVal(leafRow, ym)}
                              onChange={(e) =>
                                setEdits((x) => ({ ...x, [cellKey(leafRow, ym)]: e.target.value }))
                              }
                              className={numCls}
                            />
                          </td>
                        ))}
                      </tr>
                    )}
                    {pkgRows.length > 0 && (
                      <tr key={`sub-${studio}`} className="border-t border-border/60 bg-muted/20">
                        <td className="bg-muted/20 px-3 py-1 text-xs font-semibold whitespace-nowrap">
                          Total {studio}
                        </td>
                        {months.map((ym) => (
                          <td key={ymKey(ym.year, ym.month)} className="px-2 py-1 text-right text-xs font-semibold tabular-nums">
                            {studioSubtotal(studio, ym) || "—"}
                          </td>
                        ))}
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="border-t-2 border-border bg-muted/40">
                <td className="bg-muted/40 px-3 py-2 text-xs font-bold whitespace-nowrap">
                  Total Sesi
                </td>
                {months.map((ym) => (
                  <td key={ymKey(ym.year, ym.month)} className="px-2 py-2 text-right text-xs font-bold tabular-nums">
                    {grandTotal(ym) || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={addMonth}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-dashed border-border text-sm font-semibold text-primary hover:bg-muted/40"
        >
          <Plus size={14} /> Tambah bulan
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || dirtyCount === 0}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Simpan perubahan{dirtyCount ? ` (${dirtyCount})` : ""}
        </button>
      </div>
    </div>
  );
}
