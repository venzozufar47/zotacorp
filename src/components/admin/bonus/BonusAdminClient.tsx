"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRp } from "@/lib/cashflow/format";
import {
  setBonusParameters,
  computeBonusPreview,
  saveBonusRun,
  finalizeBonusRun,
  type BonusParameters,
  type BonusPreview,
} from "@/lib/actions/bonus.actions";
import type { ScorecardBranch } from "@/lib/actions/scorecard.actions";

function currentQuarter(): string {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function ParametersCard({
  branch,
  initial,
}: {
  branch: ScorecardBranch;
  initial: BonusParameters | null;
}) {
  const router = useRouter();
  const [p, setP] = useState(initial?.p != null ? String(initial.p) : "");
  const [lkDasar, setLkDasar] = useState(initial?.lkDasar != null ? String(initial.lkDasar) : "");
  const [saving, setSaving] = useState(false);
  const locked = initial?.locked ?? false;

  async function save() {
    setSaving(true);
    try {
      const res = await setBonusParameters({
        branch,
        p: Number(p) || 0,
        lkDasar: Number(lkDasar.replace(/\D/g, "")) || 0,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Parameter tersimpan untuk kuartal ini");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Parameter {branch} — {currentQuarter()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {locked && (
          <p className="text-xs text-warning">
            Sudah ada bonus final kuartal ini — parameter terkunci sampai kuartal depan.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`p-${branch}`}>p (%)</Label>
            <Input id={`p-${branch}`} inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} disabled={locked} />
          </div>
          <div>
            <Label htmlFor={`lk-${branch}`}>LK dasar (Rp)</Label>
            <Input
              id={`lk-${branch}`}
              inputMode="numeric"
              value={lkDasar}
              onChange={(e) => setLkDasar(e.target.value)}
              disabled={locked}
            />
          </div>
        </div>
        <Button onClick={save} loading={saving} disabled={locked} className="w-full">
          Simpan parameter
        </Button>
      </CardContent>
    </Card>
  );
}

function RunCalculator({
  branch,
  employees,
}: {
  branch: ScorecardBranch;
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(currentPeriod());
  const [selected, setSelected] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<BonusPreview | null>(null);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);

  function toggleEmployee(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function compute() {
    if (selected.length === 0) {
      toast.error("Pilih minimal satu karyawan");
      return;
    }
    setComputing(true);
    try {
      const res = await computeBonusPreview({
        branch,
        period,
        employeeUserIds: selected,
        manualExclusions: exclusions,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res.data!);
      setSavedRunId(null);
    } finally {
      setComputing(false);
    }
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    try {
      const res = await saveBonusRun(preview);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Draf tersimpan");
      setSavedRunId(res.data!.runId);
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!savedRunId) return;
    setFinalizing(true);
    try {
      const res = await finalizeBonusRun(savedRunId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Bonus final — karyawan diberi tahu");
      router.refresh();
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hitung bonus {branch}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor={`period-${branch}`}>Bulan</Label>
          <Input
            id={`period-${branch}`}
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Karyawan penerima</Label>
          {employees.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-2 space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(e.id)}
                  onChange={() => toggleEmployee(e.id)}
                />
                {e.name}
              </label>
              {selected.includes(e.id) && (
                <Input
                  placeholder="Kecualikan dengan alasan (opsional, mis. tidak hadir tanpa kabar)"
                  value={exclusions[e.id] ?? ""}
                  onChange={(ev) => setExclusions((x) => ({ ...x, [e.id]: ev.target.value }))}
                  className="text-xs h-8"
                />
              )}
            </div>
          ))}
        </div>
        <Button onClick={compute} loading={computing} variant="outline" className="w-full">
          Hitung pratinjau
        </Button>

        {preview && (
          <div className="space-y-2 rounded-xl border-2 border-foreground p-3">
            <p className="text-sm">
              Laba kotor {formatRp(preview.grossProfit)} − LK dasar {formatRp(preview.lkDasar)}, p={preview.p}%,
              pengali {preview.scorecardMultiplier.toFixed(2)}
            </p>
            <p className="font-display text-xl font-extrabold">Kolam: {formatRp(preview.pool)}</p>
            <div className="space-y-1">
              {preview.shares.map((s) => (
                <div key={s.userId} className="flex items-center justify-between text-sm">
                  <span>
                    {s.name} ({s.hours.toFixed(1)} jam)
                    {s.excluded && <span className="text-destructive"> — {s.excludedReason}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{formatRp(s.share)}</span>
                </div>
              ))}
            </div>
            <Button onClick={save} loading={saving} className="w-full">
              Simpan sebagai draf
            </Button>
            {savedRunId && (
              <Button onClick={finalize} loading={finalizing} variant="secondary" className="w-full">
                Final — beri tahu karyawan
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BonusAdminClient({
  parametersByBranch,
  employees,
}: {
  parametersByBranch: Record<ScorecardBranch, BonusParameters | null>;
  employees: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      {(["Pare", "Semarang"] as ScorecardBranch[]).map((b) => (
        <ParametersCard key={b} branch={b} initial={parametersByBranch[b]} />
      ))}
      {(["Pare", "Semarang"] as ScorecardBranch[]).map((b) => (
        <RunCalculator key={b} branch={b} employees={employees} />
      ))}
    </div>
  );
}
