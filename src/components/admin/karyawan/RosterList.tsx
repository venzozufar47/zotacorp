"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STAGE_LABEL, STAGE_ORDER, type ActionSeverity, type EmployeeStage, type ProfileTab } from "@/lib/employees/lifecycle";
import { StagePill } from "./StagePill";

export interface RosterRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  jobRole: string | null;
  unit: string | null;
  isAdmin: boolean;
  stage: EmployeeStage;
  contractLabel: string;
  nextAction: { label: string; severity: ActionSeverity; tab: ProfileTab } | null;
  actionCount: number;
}

type StageFilter = "semua" | EmployeeStage;

const SEVERITY_TEXT: Record<ActionSeverity, string> = {
  tinggi: "text-destructive",
  sedang: "text-foreground",
  info: "text-muted-foreground",
};

export function RosterList({ rows }: { rows: RosterRow[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<StageFilter>("semua");
  const [unit, setUnit] = useState("");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<StageFilter, number> = { semua: 0, baru: 0, probation: 0, aktif: 0, pamit: 0, keluar: 0 };
    for (const r of rows) {
      c[r.stage] += 1;
      if (r.stage !== "keluar") c.semua += 1;
    }
    return c;
  }, [rows]);

  const units = useMemo(
    () => [...new Set(rows.map((r) => r.unit).filter((u): u is string => !!u))].sort(),
    [rows]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (stage === "semua" ? r.stage === "keluar" : r.stage !== stage) return false;
      if (unit && r.unit !== unit) return false;
      if (!needle) return true;
      return [r.name, r.email, r.jobRole ?? ""].some((s) => s.toLowerCase().includes(needle));
    });
  }, [rows, stage, unit, q]);

  const filters: StageFilter[] = ["semua", ...STAGE_ORDER];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Saring tahap" className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={stage === f}
              onClick={() => setStage(f)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
                stage === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f === "semua" ? "Semua" : STAGE_LABEL[f]}
              <span className="tabular-nums opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {units.length > 1 && (
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              aria-label="Saring unit"
              className="h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Semua unit</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama, email, jabatan"
              aria-label="Cari karyawan"
              className="h-8 w-60 pl-8 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Karyawan</th>
              <th className="px-4 py-2 font-medium">Tahap</th>
              <th className="px-4 py-2 font-medium">Kontrak</th>
              <th className="px-4 py-2 font-medium">Berikutnya</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const href = `/admin/karyawan/${r.id}`;
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(href)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <EmployeeAvatar
                        size="sm"
                        id={r.id}
                        full_name={r.name}
                        avatar_url={r.avatarUrl}
                        avatar_seed={r.avatarSeed}
                      />
                      <div className="min-w-0">
                        <Link
                          href={href}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:underline"
                        >
                          {r.name || r.email}
                        </Link>
                        {r.isAdmin && <span className="ml-1.5 text-xs text-muted-foreground">Admin</span>}
                        <p className="truncate text-xs text-muted-foreground">
                          {[r.jobRole, r.unit].filter(Boolean).join(" · ") || "Jabatan belum diisi"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StagePill stage={r.stage} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.isAdmin ? "—" : r.contractLabel}</td>
                  <td className="px-4 py-2">
                    {r.nextAction ? (
                      <span className={SEVERITY_TEXT[r.nextAction.severity]}>
                        {r.nextAction.label}
                        {r.actionCount > 1 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">+{r.actionCount - 1}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="pr-3 text-muted-foreground">
                    <ChevronRight size={16} aria-hidden />
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Tidak ada karyawan yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
