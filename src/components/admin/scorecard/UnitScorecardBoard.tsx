"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Settings2, Eye, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/admin/costing/Sparkline";
import { getScorecardHome, getScorecardPreview, type PreviewData } from "@/lib/actions/unit-scorecard.actions";
import type { HomeData, HomeUnitCard, HomeMetricCell } from "@/lib/unit-scorecard/persist";
import { UnitDetailDialog } from "./UnitDetailDialog";
import { STATUS_ICON, STATUS_LABEL, STATUS_TEXT, STATUS_TONE, TONE_ARROW, formatDelta, formatMetricValue } from "./format";

/** Tiga metrik utama di kartu: margin four-wall, HPP atau utilisasi, dan tenaga kerja atau payback. */
const KEY_CODES: Record<HomeUnitCard["unitType"], string[]> = {
  cabang_bakery: ["B4", "B1", "B2"],
  cabang_studio: ["S3", "S1", "S5"],
};

export function StatusBadge({ status }: { status: HomeUnitCard["status"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold", STATUS_TONE[status])}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

function MetricMini({ m }: { m: HomeMetricCell }) {
  const delta = formatDelta(m.delta, m.valueUnit);
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-muted-foreground" title={m.label}>
        {m.label}
      </div>
      <div className={cn("font-display text-base font-extrabold tabular-nums", STATUS_TEXT[m.status])}>
        <span aria-hidden className="mr-0.5 text-[10px]">
          {STATUS_ICON[m.status]}
        </span>
        {formatMetricValue(m.value, m.valueUnit)}
      </div>
      {delta ? <div className={cn("text-[10.5px] tabular-nums", TONE_ARROW[m.tone])}>{delta}</div> : <div className="text-[10.5px] text-muted-foreground">{m.status === "incomplete" ? "data belum lengkap" : m.status === "not_assessed" ? "tidak dinilai" : " "}</div>}
    </div>
  );
}

function UnitCard({ u, onOpen }: { u: HomeUnitCard; onOpen: () => void }) {
  const keys = KEY_CODES[u.unitType].map((c) => u.metrics.find((m) => m.code === c)).filter((m): m is HomeMetricCell => !!m);
  const fw = u.metrics.find((m) => m.isFourWall);
  const spark = (fw?.spark ?? []).filter((v): v is number => v != null);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group h-full w-full rounded-2xl border-2 border-foreground bg-card p-4 text-left shadow-hard transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-extrabold">{u.name}</div>
          {u.status === "rampup" && u.rampUpUntil && (
            <div className="text-[11px] text-muted-foreground">
              Ramp-up s.d. {new Date(`${u.rampUpUntil}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
            </div>
          )}
        </div>
        <StatusBadge status={u.status} />
      </div>
      {u.confirmedRed && (
        <div className="mt-2 rounded-lg border border-destructive/50 bg-destructive/10 px-2 py-1 text-[11.5px] font-semibold text-destructive">
          ■ Merah terkonfirmasi (2 periode berurutan){u.actionsInPeriod === 0 ? " — keputusan wajib diisi" : u.reviewed ? " — sudah ditinjau" : ""}
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-3">
        {keys.map((m) => (
          <MetricMini key={m.code} m={m} />
        ))}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Margin four-wall, 6 periode</div>
          {spark.length >= 2 ? <Sparkline values={spark} width={140} height={28} /> : <div className="text-[11px] text-muted-foreground">Belum cukup periode</div>}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {u.openActions > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold">{u.openActions} tindakan</span>}
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </div>
    </button>
  );
}

function PreviewTable({ data }: { data: PreviewData }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-card/60 p-4">
      <div className="mb-2 text-sm font-bold">
        Pratinjau {data.monthLabel}{" "}
        <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">belum tutup buku</span>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground">Hanya metrik operasional (utilisasi, waste, selisih opname). Tidak disimpan sebagai snapshot dan bisa berubah sampai bulan ditutup.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.units.map((u) => (
          <div key={u.unitId} className="rounded-xl border border-border p-3">
            <div className="mb-1 text-[13px] font-bold">{u.name}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {u.cells.map((c) => (
                <div key={c.code} className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className={cn("font-bold tabular-nums", STATUS_TEXT[c.status])}>
                    <span aria-hidden className="mr-0.5 text-[10px]">
                      {STATUS_ICON[c.status]}
                    </span>
                    {c.value == null ? "—" : `${c.value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UnitScorecardBoard({ initial }: { initial: HomeData }) {
  const [home, setHome] = useState(initial);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<HomeUnitCard | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  function changeMonth(month: string) {
    start(async () => {
      const r = await getScorecardHome(month);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Gagal memuat" : r.error);
      setHome(r.data);
    });
  }

  function togglePreview() {
    if (showPreview) return setShowPreview(false);
    setShowPreview(true);
    if (preview) return;
    start(async () => {
      const r = await getScorecardPreview();
      if (!r.ok || !r.data) {
        setShowPreview(false);
        return void toast.error(r.ok ? "Gagal memuat" : r.error);
      }
      setPreview(r.data);
    });
  }

  async function refreshAfterChange() {
    if (!home.selectedMonth) return;
    const r = await getScorecardHome(home.selectedMonth);
    if (r.ok && r.data) {
      setHome(r.data);
      setOpen((cur) => (cur ? r.data!.units.find((u) => u.unitId === cur.unitId) ?? null : null));
    }
  }

  const brands = Array.from(new Set(home.units.map((u) => u.brand)));

  return (
    <section aria-labelledby="unit-scorecard-title" className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 id="unit-scorecard-title" className="font-display text-xl font-extrabold tracking-tight">
            Kesehatan Unit Bisnis
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {home.selectedLabel ? (
              <>
                Tutup buku: <span className="font-semibold text-foreground">{home.selectedLabel}</span>
                {home.version > 1 ? ` · versi ${home.version}` : ""} · nilai di batas masuk status yang lebih baik
              </>
            ) : (
              "Belum ada periode yang ditutup."
            )}
          </p>
        </div>
        {home.periods.length > 0 && (
          <label className="flex items-center gap-1.5 text-[12px] font-semibold">
            Periode
            <select
              value={home.selectedMonth ?? ""}
              onChange={(e) => changeMonth(e.target.value)}
              disabled={pending}
              className="h-9 rounded-lg border-2 border-foreground bg-card px-2 text-[13px] font-semibold"
            >
              {home.periods.map((p) => (
                <option key={p.month} value={p.month}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={togglePreview}
          aria-pressed={showPreview}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-foreground px-3 text-[12.5px] font-bold", showPreview ? "bg-primary" : "bg-card")}
        >
          <Eye size={14} aria-hidden /> Pratinjau bulan berjalan
        </button>
        <Link href="/admin/scorecard-unit" className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-foreground bg-card px-3 text-[12.5px] font-bold">
          <Settings2 size={14} aria-hidden /> Tutup buku & ambang
        </Link>
      </div>

      {showPreview && (preview ? <PreviewTable data={preview} /> : <div className="h-24 animate-pulse rounded-2xl bg-muted" />)}

      {home.units.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
          {home.periods.length === 0 ? (
            <>
              Belum ada bulan yang ditutup. Buka <Link href="/admin/scorecard-unit" className="font-bold text-foreground underline">Tutup buku & ambang</Link>, pilih bulan yang pencatatannya sudah lengkap, lalu tutup buku untuk menghitung scorecard pertama.
            </>
          ) : (
            "Belum ada unit. Tambahkan unit di pengaturan scorecard."
          )}
        </div>
      ) : (
        <div className={cn("space-y-4", pending && "opacity-70")}>
          {brands.map((brand) => (
            <div key={brand}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{brand}</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {home.units
                  .filter((u) => u.brand === brand)
                  .map((u) => (
                    <UnitCard key={u.unitId} u={u} onOpen={() => setOpen(u)} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && home.selectedMonth && (
        <UnitDetailDialog unit={open} monthIso={home.selectedMonth} monthLabel={home.selectedLabel ?? ""} onClose={() => setOpen(null)} onChanged={refreshAfterChange} />
      )}
    </section>
  );
}
