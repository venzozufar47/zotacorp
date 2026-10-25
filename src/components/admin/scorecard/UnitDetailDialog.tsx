"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/admin/costing/Sparkline";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addScorecardAction,
  getUnitDetail,
  markUnitReviewed,
  setScorecardActionStatus,
  type UnitDetail,
} from "@/lib/actions/unit-scorecard.actions";
import type { HomeMetricCell, HomeUnitCard } from "@/lib/unit-scorecard/persist";
import type { MetricChange } from "@/lib/unit-scorecard/changes";
import {
  METRIC_STATUS_LABEL,
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_TEXT,
  STATUS_TONE,
  TONE_ARROW,
  formatBound,
  formatDelta,
  formatMetricValue,
  formatRupiah,
} from "./format";

/** Nama kunci rincian (snake_case) → label Indonesia. Kunci tak dikenal tetap ditampilkan apa adanya. */
const KEY_LABEL: Record<string, string> = {
  rezim: "Rezim pencatatan",
  sumber: "Sumber data",
  sumber_hpp: "Sumber HPP",
  revenue_neto_rp: "Revenue neto",
  revenue_rp: "Revenue",
  pendapatan_pos_rp: "Pendapatan POS",
  pendapatan_custom_cake_rp: "Pendapatan Custom Cake",
  pendapatan_laba_rugi_rp: "Pendapatan (laporan laba-rugi)",
  other_revenue_rp: "Other revenue",
  cakupan_hpp_pct: "Cakupan HPP",
  pembilang_hpp_rp: "Pembilang: HPP",
  penyebut_revenue_rp: "Penyebut: revenue",
  pembilang_gaji_rp: "Pembilang: gaji",
  pembilang_sewa_rp: "Pembilang: sewa",
  pembilang_waste_rp: "Pembilang: nilai waste (harga pokok)",
  penyebut_hpp_terjual_rp: "Penyebut: HPP terjual",
  pembilang_selisih_abs_rp: "Pembilang: Σ|selisih|",
  penyebut_nilai_stok_sistem_rp: "Penyebut: nilai stok sistem",
  pembilang_menit_terjual: "Pembilang: menit terjual",
  penyebut_menit_terjual_plus_aktif_kosong: "Penyebut: menit terjual + aktif kosong",
  revenue_pos_dengan_hpp_rp: "Revenue POS yang HPP-nya lengkap",
  revenue_pos_tanpa_hpp_rp: "Revenue POS tanpa HPP",
  pembanding_cogs_buku_kas_rp: "Pembanding: COGS buku kas",
  laba_four_wall_rp: "Laba four-wall",
  komponen: "Komponen",
  biaya_operasional_langsung_rincian: "Rincian biaya operasional langsung",
  dikeluarkan_dari_four_wall: "Dikeluarkan dari four-wall",
  modal_awal_rp: "Modal awal",
  periode_laba: "Periode laba yang dirata-rata",
  rata_rata_laba_four_wall_rp: "Rata-rata laba four-wall bulanan",
  qty_waste: "Qty waste",
  qty_waste_tanpa_hpp: "Qty waste tanpa HPP",
  jumlah_opname: "Jumlah opname",
  jam_sibuk: "Definisi jam sibuk",
  hari_kerja_menit: "Hari kerja (menit dari 00:00)",
  akhir_pekan_seharian: "Akhir pekan seharian",
  catatan: "Catatan",
  peringatan: "Peringatan",
  hpp: "HPP",
  cogs: "COGS",
  tenaga_kerja: "Tenaga kerja",
  sewa: "Sewa",
  biaya_operasional_langsung: "Biaya operasional langsung",
  fee_bank_platform: "Fee bank/platform",
  revenue: "Revenue",
  kategori: "Kategori",
  rp: "Rp",
};

function renderValue(key: string, v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "number") {
    if (key.endsWith("_rp") || key === "rp") return formatRupiah(v);
    if (key.endsWith("_pct")) return `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
    return v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    if (v.every((x) => typeof x !== "object")) return v.join(", ");
    return v.map((x) => (typeof x === "object" && x ? Object.entries(x as Record<string, unknown>).map(([k, val]) => renderValue(k, val)).join(" · ") : String(x))).join("; ");
  }
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, val]) => `${KEY_LABEL[k] ?? k}: ${renderValue(k, val)}`).join("; ");
  return String(v);
}

function InputsTable({ inputs }: { inputs: Record<string, unknown> }) {
  const rows = Object.entries(inputs).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0));
  if (rows.length === 0) return <p className="text-[12px] text-muted-foreground">Tidak ada rincian.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-[minmax(0,14rem)_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{KEY_LABEL[k] ?? k.replaceAll("_", " ")}</dt>
          <dd className={cn("break-words tabular-nums", k === "peringatan" && "font-semibold text-warning")}>{renderValue(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function MetricRow({ m, inputs }: { m: HomeMetricCell; inputs: Record<string, unknown> | undefined }) {
  const [open, setOpen] = useState(false);
  const delta = formatDelta(m.delta, m.valueUnit);
  const spark = m.spark.filter((v): v is number => v != null);
  const range =
    m.green == null || m.red == null
      ? "—"
      : m.direction === "lower_better"
        ? `hijau ≤ ${formatBound(m.green, m.valueUnit)} · merah > ${formatBound(m.red, m.valueUnit)}`
        : `hijau ≥ ${formatBound(m.green, m.valueUnit)} · merah < ${formatBound(m.red, m.valueUnit)}`;
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left">
        <div className="min-w-[8rem] flex-1">
          <div className="text-[13px] font-bold">
            {m.label} <span className="font-normal text-muted-foreground">({m.code})</span>
          </div>
          <div className="text-[11px] text-muted-foreground">{range}</div>
        </div>
        <div className={cn("font-display text-lg font-extrabold tabular-nums", STATUS_TEXT[m.status])}>
          <span aria-hidden className="mr-1 text-xs">
            {STATUS_ICON[m.status]}
          </span>
          {formatMetricValue(m.value, m.valueUnit)}
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10.5px] font-bold", STATUS_TONE[m.status])}>{METRIC_STATUS_LABEL[m.status]}</span>
        <div className={cn("w-24 text-right text-[11.5px] tabular-nums", TONE_ARROW[m.tone])}>{delta || "—"}</div>
        <div className="w-[88px]">{spark.length >= 2 ? <Sparkline values={spark} width={84} height={22} /> : null}</div>
        <span className="text-[11px] font-semibold text-muted-foreground">{open ? "Tutup rincian" : "Rincian angka"}</span>
      </button>
      {open && (
        <div className="mt-3 border-t border-border pt-3">
          {inputs ? <InputsTable inputs={inputs} /> : <p className="text-[12px] text-muted-foreground">Rincian belum tersedia untuk periode ini.</p>}
        </div>
      )}
    </li>
  );
}

export function UnitDetailDialog({
  unit,
  monthIso,
  monthLabel,
  changes = [],
  onClose,
  onChanged,
}: {
  unit: HomeUnitCard;
  monthIso: string;
  monthLabel: string;
  /** Perubahan angka unit ini pada pembaruan otomatis terakhir. */
  changes?: MetricChange[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [decision, setDecision] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [metric, setMetric] = useState("");

  async function load() {
    const r = await getUnitDetail(unit.unitId, monthIso);
    if (!r.ok || !r.data) return setLoadError(r.ok ? "Gagal memuat" : r.error);
    setDetail(r.data);
  }

  useEffect(() => {
    let alive = true;
    getUnitDetail(unit.unitId, monthIso).then((r) => {
      if (!alive) return;
      if (!r.ok || !r.data) setLoadError(r.ok ? "Gagal memuat" : r.error);
      else setDetail(r.data);
    });
    return () => {
      alive = false;
    };
  }, [unit.unitId, monthIso]);

  function addAction() {
    start(async () => {
      const r = await addScorecardAction({ unitId: unit.unitId, monthIso, metricCode: metric || null, decision, owner, dueDate: due || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Keputusan dicatat");
      setDecision("");
      setDue("");
      setMetric("");
      await load();
      await onChanged();
    });
  }

  function setStatus(id: string, status: "open" | "done" | "dropped") {
    start(async () => {
      const r = await setScorecardActionStatus(id, status);
      if (!r.ok) return void toast.error(r.error);
      await load();
      await onChanged();
    });
  }

  function review() {
    start(async () => {
      const r = await markUnitReviewed(unit.unitId, monthIso);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Ditandai ditinjau");
      await load();
      await onChanged();
    });
  }

  const inputsByCode = new Map((detail?.inputs ?? []).map((i) => [i.code, i.inputs]));
  const mustFill = unit.confirmedRed && (detail ? detail.actions.filter((a) => a.periodMonth === monthIso).length === 0 : unit.actionsInPeriod === 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">{unit.name}</DialogTitle>
          <DialogDescription>
            {monthLabel} · <span className={cn("font-bold", STATUS_TEXT[unit.status])}>{STATUS_ICON[unit.status]} {STATUS_LABEL[unit.status]}</span>
            {unit.redCount > 0 ? ` · ${unit.redCount} metrik merah` : ""}
            {unit.yellowCount > 0 ? ` · ${unit.yellowCount} kuning` : ""}
          </DialogDescription>
        </DialogHeader>

        {unit.notes && <p className="rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground">{unit.notes}</p>}

        {changes.length > 0 && (
          <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-[12px]">
            <div className="mb-1 font-bold text-warning">▲ Angka berubah di pembaruan otomatis terakhir</div>
            <ul className="space-y-0.5">
              {changes.map((c) => {
                const m = unit.metrics.find((x) => x.code === c.code);
                const unitKind = m?.valueUnit ?? "pct";
                return (
                  <li key={c.code} className="tabular-nums">
                    {m?.label ?? c.code}: {formatMetricValue(c.oldValue, unitKind)} → <span className="font-semibold">{formatMetricValue(c.newValue, unitKind)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {mustFill && (
          <div role="alert" className="rounded-xl border-2 border-destructive bg-destructive/10 p-3 text-[12.5px] font-semibold text-destructive">
            ■ Merah di dua bulan berurutan. Isi minimal satu keputusan (tindakan, penanggung jawab, tenggat) sebelum unit ini bisa ditandai ditinjau.
          </div>
        )}

        <ul className="space-y-2">
          {unit.metrics.map((m) => (
            <MetricRow key={m.code} m={m} inputs={inputsByCode.get(m.code)} />
          ))}
        </ul>

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        <section aria-labelledby="keputusan-title" className="space-y-3 rounded-xl border-2 border-foreground p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="keputusan-title" className="text-sm font-extrabold">
              Keputusan & tindakan
            </h3>
            <button
              type="button"
              onClick={review}
              disabled={pending || detail?.reviewed}
              className="h-8 rounded-lg border-2 border-foreground bg-card px-3 text-[12px] font-bold disabled:opacity-60"
            >
              {detail?.reviewed ? "✓ Sudah ditinjau" : "Tandai ditinjau"}
            </button>
          </div>

          {detail && detail.actions.length > 0 ? (
            <ul className="space-y-1.5">
              {detail.actions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[12.5px]">
                  <span className={cn("flex-1 min-w-[10rem]", a.status !== "open" && "text-muted-foreground line-through")}>
                    {a.decision}
                    {a.metricCode ? <span className="ml-1 text-muted-foreground">({a.metricCode})</span> : null}
                  </span>
                  <span className="text-muted-foreground">PJ: {a.owner}</span>
                  {a.dueDate && <span className="text-muted-foreground tabular-nums">tenggat {new Date(`${a.dueDate}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
                  <select
                    value={a.status}
                    onChange={(e) => setStatus(a.id, e.target.value as "open" | "done" | "dropped")}
                    disabled={pending}
                    aria-label="Status tindakan"
                    className="h-7 rounded-md border border-border bg-card px-1 text-[12px]"
                  >
                    <option value="open">Berjalan</option>
                    <option value="done">Selesai</option>
                    <option value="dropped">Dibatalkan</option>
                  </select>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted-foreground">Belum ada keputusan untuk unit ini.</p>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
            <input value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Keputusan / tindakan (mis. perbaiki, replikasi, hentikan)" aria-label="Keputusan" className="h-9 rounded-lg border-2 border-border bg-background px-2 text-[13px] sm:col-span-1" />
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Penanggung jawab" aria-label="Penanggung jawab" className="h-9 rounded-lg border-2 border-border bg-background px-2 text-[13px]" />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Tenggat" className="h-9 rounded-lg border-2 border-border bg-background px-2 text-[13px]" />
            <button type="button" onClick={addAction} disabled={pending} className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-[12.5px] font-bold disabled:opacity-60">
              Tambah
            </button>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metrik terkait" className="h-8 rounded-md border border-border bg-card px-1 text-[12px] sm:col-span-4">
              <option value="">Tidak terkait metrik tertentu</option>
              {unit.metrics.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} — {m.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
