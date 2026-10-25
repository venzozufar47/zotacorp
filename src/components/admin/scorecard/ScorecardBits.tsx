"use client";

import { cn } from "@/lib/utils";
import type { HomeUnitCard, HomeMetricCell } from "@/lib/unit-scorecard/persist";
import type { MetricChange } from "@/lib/unit-scorecard/changes";
import { STATUS_ICON, STATUS_LABEL, STATUS_TEXT, STATUS_TONE, formatMetricValue } from "./format";

/** Tiga metrik utama di kartu cabang: margin four-wall, HPP atau utilisasi, dan tenaga kerja atau payback. */
const KEY_CODES: Record<HomeUnitCard["unitType"], string[]> = {
  cabang_bakery: ["B4", "B1", "B2"],
  cabang_studio: ["S3", "S1", "S5"],
};

export function StatusBadge({ status, className }: { status: HomeUnitCard["status"]; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none", STATUS_TONE[status], className)}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {status === "incomplete" ? "Belum lengkap" : STATUS_LABEL[status]}
    </span>
  );
}

function MetricRow({ m }: { m: HomeMetricCell }) {
  const note = m.status === "incomplete" ? "belum lengkap" : m.status === "not_assessed" ? "tidak dinilai" : null;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-[11.5px] first:pt-0 last:pb-0">
      <span className="text-muted-foreground">{m.label}</span>
      <span className={cn("font-semibold tabular-nums", STATUS_TEXT[m.status])}>
        <span aria-hidden className="mr-0.5 text-[9px]">
          {STATUS_ICON[m.status]}
        </span>
        {formatMetricValue(m.value, m.valueUnit)}
        {note && <span className="ml-1 text-[10px] font-normal text-muted-foreground">({note})</span>}
      </span>
    </div>
  );
}

/** Bagian scorecard di dalam kartu cabang: status, 3 metrik utama, penanda, dan tombol rincian. */
export function ScorecardBlock({
  unit,
  monthLabel,
  changes,
  onOpen,
}: {
  unit: HomeUnitCard;
  monthLabel: string;
  changes: MetricChange[];
  onOpen: () => void;
}) {
  const keys = KEY_CODES[unit.unitType].map((c) => unit.metrics.find((m) => m.code === c)).filter((m): m is HomeMetricCell => !!m);
  const changed = changes.filter((c) => c.unit_id === unit.unitId).length;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2 pt-0.5 pb-1">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">Scorecard · {monthLabel.replace(/^(\S{3})\S*/, "$1")}</span>
        <StatusBadge status={unit.status} />
      </div>
      {unit.status === "rampup" && unit.rampUpUntil && (
        <div className="pb-1 text-[10.5px] text-muted-foreground">
          Ramp-up s.d. {new Date(`${unit.rampUpUntil}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
        </div>
      )}
      {unit.confirmedRed && (
        <div className="mb-1 rounded-md border border-destructive/50 bg-destructive/10 px-1.5 py-1 text-[10.5px] font-semibold text-destructive">
          ■ Merah 2 periode berurutan{unit.actionsInPeriod === 0 ? " — keputusan wajib diisi" : unit.reviewed ? " — sudah ditinjau" : ""}
        </div>
      )}
      <div className="divide-y divide-border/40">
        {keys.map((m) => (
          <MetricRow key={m.code} m={m} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
        <span className="text-[10px] text-muted-foreground">
          {changed > 0 ? <span className="font-semibold text-warning">▲ {changed} angka berubah</span> : null}
          {changed > 0 && unit.openActions > 0 ? " · " : null}
          {unit.openActions > 0 ? `${unit.openActions} tindakan` : null}
        </span>
        <button type="button" onClick={onOpen} className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold text-foreground hover:bg-muted">
          Rincian
        </button>
      </div>
    </div>
  );
}
