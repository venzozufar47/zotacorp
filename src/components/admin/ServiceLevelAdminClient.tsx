"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  Check,
  Clock,
  TrendingDown,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addServiceLevelExclusion,
  deleteServiceLevelExclusion,
  endServiceLevelExclusion,
  setServiceLevelOwners,
  setServiceLevelSettings,
  type ServiceLevelExclusionRow,
  type ServiceLevelOwnerRow,
  type ServiceLevelSummary,
} from "@/lib/actions/pos-service-level.actions";
import type { ServiceLevelResult } from "@/lib/pos/service-level";
import { serviceLevelBandOf, wasteBandOf, type BranchThresholds } from "@/lib/scorecard/thresholds";
import {
  WASTE_QTY_SANITY_CAP,
  type WasteResult,
} from "@/lib/pos/waste";
import {
  WITHDRAWAL_REASON_GROUPS,
  WITHDRAWAL_REASON_META,
} from "@/lib/pos/withdrawal-reasons";
import { formatRp } from "@/lib/cashflow/format";
import { cn } from "@/lib/utils";

interface Outlet {
  id: string;
  accountName: string;
  branch: string | null;
  enabled: boolean;
  openHour: number;
  closeHour: number;
  /** Pecahan 0-1. Lihat migrasi 135. */
  target: number;
  summary: ServiceLevelSummary | null;
  /** Rincian LIVE (penyebab terbesar + per-hari) — sama seperti di POS. */
  live: ServiceLevelResult | null;
  /** Metrik susut untuk rentang aktif — penyeimbang angka Service Level. */
  waste: WasteResult | null;
  owners: ServiceLevelOwnerRow[];
  exclusions: ServiceLevelExclusionRow[];
  skus: Array<{ productId: string; variantId: string | null; label: string }>;
}

type Band = "green" | "yellow" | "red" | null;
const BAND_TEXT: Record<"green" | "yellow" | "red", string> = { green: "text-success", yellow: "text-warning", red: "text-destructive" };
const bandText = (b: Band) => (b ? BAND_TEXT[b] : "text-muted-foreground");

/** Warna kartu mengikuti ambang scorecard (kartu "Ambang warna Scorecard Cabang"), bukan target per outlet. */
const slBand = (pct: number | null, t: BranchThresholds): Band => (pct === null ? null : serviceLevelBandOf(pct, t));
const wasteBand = (rate: number | null, t: BranchThresholds): Band =>
  rate === null || !Number.isFinite(rate) ? null : wasteBandOf(rate * 100, t);
const numId = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function pctLabel(pct: number | null): string {
  return pct === null ? "—" : `${(pct * 100).toFixed(1)}%`;
}

function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function ServiceLevelAdminClient({
  outlets,
  employees,
  rangeLabel,
  thresholds,
}: {
  outlets: Outlet[];
  employees: Array<{ id: string; name: string }>;
  thresholds: BranchThresholds;
  /** Label rentang aktif ("7 hari" / "30 hari" / "16 Agu – hari ini") —
   * SAMA untuk semua outlet, ditentukan picker di page.tsx. */
  rangeLabel: string;
}) {
  // Outlet yang rinciannya ditampilkan: bawaan outlet aktif pertama; kartu ringkasan / tab / tautan #outlet-<id> mengubahnya.
  const [selectedId, setSelectedId] = useState(() => (outlets.find((o) => o.enabled) ?? outlets[0])?.id ?? "");

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#outlet-/, "");
      if (id && outlets.some((o) => o.id === id)) setSelectedId(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [outlets]);

  if (outlets.length === 0) {
    return (
      <div className="panel-sticker p-5 text-sm text-muted-foreground">
        Belum ada rekening POS aktif.
      </div>
    );
  }

  const selected = outlets.find((o) => o.id === selectedId) ?? outlets[0];

  return (
    <div className="space-y-5">
      {/* Ringkasan — supaya superadmin tidak perlu membuka layar kasir. Ketuk kartu untuk melihat rincian outlet itu. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {outlets.map((o) => (
          <SummaryCard key={o.id} outlet={o} thresholds={thresholds} rangeLabel={rangeLabel} selected={o.id === selected.id} onSelect={() => setSelectedId(o.id)} />
        ))}
      </div>

      <OutletPanel key={selected.id} outlet={selected} employees={employees} rangeLabel={rangeLabel} />
    </div>
  );
}

/** Satu outlet: dua angka utama + status terhadap target; rincian sekunder ringkas, peringatan jadi lencana. */
function SummaryCard({
  outlet: o,
  rangeLabel,
  thresholds,
  selected,
  onSelect,
}: {
  outlet: Outlet;
  thresholds: BranchThresholds;
  rangeLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const slB = slBand(o.summary?.percent ?? null, thresholds);
  const wasteB = wasteBand(o.waste?.lossRate ?? null, thresholds);
  // Status kartu = yang terburuk dari dua metrik, sama seperti kartu gabungan di scorecard.
  const worst: Band = slB === "red" || wasteB === "red" ? "red" : slB === "yellow" || wasteB === "yellow" ? "yellow" : slB;
  const status =
    worst === "green"
      ? { text: "Sesuai target", cls: "bg-success/15 text-success" }
      : worst === "yellow"
        ? { text: "Mendekati target", cls: "bg-warning/20 text-warning" }
        : worst === "red"
          ? { text: "Di bawah target", cls: "bg-destructive/15 text-destructive" }
          : { text: "Belum ada data", cls: "bg-muted text-muted-foreground" };

  return (
    <button
      type="button"
      id={`outlet-${o.id}`}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "panel-sticker scroll-mt-20 p-4 text-left transition",
        selected ? "ring-2 ring-foreground" : "hover:bg-muted/40",
        !o.enabled && "opacity-70"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-display text-base font-bold">{o.branch ?? o.accountName}</span>
        {o.enabled ? (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", status.cls)}>{status.text}</span>
        ) : (
          <span className="shrink-0 rounded-full border-2 border-foreground bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Nonaktif</span>
        )}
      </div>

      {o.enabled ? (
        <>
          {/* Dua angka berdampingan, bukan satu: Service Level sendirian bisa dinaikkan dengan produksi berlebih, dan susut
              itulah yang menahannya. Dibaca bersama atau tidak berarti. */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Service level</p>
              <p className={cn("font-display text-3xl font-extrabold leading-tight tabular-nums", bandText(slB))}>
                {pctLabel(o.summary?.percent ?? null)}
              </p>
              <p className="text-[11px] text-muted-foreground">target ≥ {numId(thresholds.slGreen)}%</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Susut (expired &amp; rusak)</p>
              <p className={cn("font-display text-3xl font-extrabold leading-tight tabular-nums", bandText(wasteB))}>
                {pctLabel(o.waste?.lossRate ?? null)}
              </p>
              <p className="text-[11px] text-muted-foreground">target ≤ {numId(thresholds.wasteGreen)}%</p>
            </div>
          </div>
          <p className="mt-3 text-[11.5px] leading-snug text-muted-foreground">
            {o.summary && o.summary.daysCounted > 0
              ? `${o.summary.daysCounted} hari terhitung · ${o.summary.lostSkuHours.toLocaleString("id-ID")} SKU-jam kosong`
              : "Belum ada data snapshot (dihitung tiap 22:30 WIB)"}
            <br />
            {o.waste && o.waste.producedQty > 0
              ? `${o.waste.expiredQty.toLocaleString("id-ID")} dari ${o.waste.producedQty.toLocaleString("id-ID")} produksi terbuang · potensi omzet hilang ${formatRp(o.waste.lostRevenue)}`
              : `Belum ada produksi tercatat ${rangeLabel}`}
          </p>
          {(o.summary?.hasPartialOpname || o.summary?.hasBackfill) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {o.summary?.hasPartialOpname && (
                <span
                  title="Ada hari dengan opname parsial: SKU yang tidak dihitung saat opname terbaca habis, jadi angkanya bisa tertekan semu."
                  className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-[10.5px] font-semibold text-warning"
                >
                  <AlertTriangle size={11} /> Opname parsial
                </span>
              )}
              {o.summary?.hasBackfill && (
                <span
                  title="Sebagian hari dihitung mundur (backfill): penyebutnya memakai katalog hari ini, jadi tidak sebanding dengan hari terukur."
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
                >
                  <AlertTriangle size={11} /> Sebagian dihitung mundur
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-[11.5px] text-muted-foreground">Metrik belum aktif. Aktifkan di Pengaturan outlet pada rincian.</p>
      )}
    </button>
  );
}

function OutletPanel({
  outlet,
  employees,
  rangeLabel,
}: {
  outlet: Outlet;
  employees: Array<{ id: string; name: string }>;
  rangeLabel: string;
}) {
  return (
    <div className="panel-sticker p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">
          Rincian {outlet.branch ?? outlet.accountName}
        </h2>
        <span className="text-xs text-muted-foreground">
          {outlet.skus.length} SKU dilacak · {rangeLabel}
        </span>
      </div>

      {/* Dua daftar ini memang dibaca berdampingan (lihat catatan di
          WastePanel), jadi satu baris dua kolom: lebih ringkas dan
          SKU yang muncul di keduanya mudah dibandingkan. */}
      <div className="grid items-start gap-x-8 gap-y-5 lg:grid-cols-2 [&>*]:min-w-0">
        <WorstSkusSection outlet={outlet} rangeLabel={rangeLabel} />
        <WastePanel outlet={outlet} rangeLabel={rangeLabel} />
      </div>
      <DailyBreakdownSection outlet={outlet} rangeLabel={rangeLabel} />

      {/* Pengaturan jarang dipakai: terlipat. Outlet nonaktif langsung terbuka karena di sinilah ia diaktifkan. */}
      <details open={!outlet.enabled} className="group rounded-2xl border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Pengaturan outlet</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              Aktif/nonaktif, jam buka, target · penanggung jawab · SKU dikecualikan
            </span>
          </span>
          <span className="text-xs font-semibold text-primary group-open:hidden">Buka</span>
          <span className="hidden text-xs font-semibold text-primary group-open:inline">Tutup</span>
        </summary>
        <div className="space-y-5 border-t border-border p-4">
          <HoursSection outlet={outlet} />
          <OwnersSection outlet={outlet} employees={employees} />
          <ExclusionsSection outlet={outlet} />
        </div>
      </details>
    </div>
  );
}

/**
 * Produk yang paling sering kosong — persis kartu "Penyebab terbesar" di
 * halaman POS, supaya superadmin tidak perlu login sebagai kasir untuk
 * lihat SKU mana yang menekan angkanya.
 */
function WorstSkusSection({
  outlet,
  rangeLabel,
}: {
  outlet: Outlet;
  rangeLabel: string;
}) {
  if (!outlet.live || outlet.live.worstSkus.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <TrendingDown size={12} /> Penyebab terbesar ({rangeLabel})
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Produk yang paling sering kosong. 100% artinya selalu kosong dalam
        rentang {rangeLabel} kebelakang.
      </p>
      <ul className="space-y-1.5">
        {outlet.live.worstSkus.slice(0, 10).map((w) => (
          <li
            key={`${w.productId}|${w.variantId ?? ""}`}
            className="flex items-center gap-3 text-xs"
          >
            <span className="min-w-0 flex-1 truncate" title={w.label}>
              {w.label}
            </span>
            <span
              className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-40"
              role="img"
              aria-label={`${w.label} kosong ${(w.percentOut * 100).toFixed(0)} persen waktu`}
            >
              <span
                className="block h-full rounded-full bg-destructive"
                style={{ width: `${Math.max(2, w.percentOut * 100)}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right font-bold tabular-nums text-destructive">
              {(w.percentOut * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Produk yang paling sering TERBUANG — sengaja dipasang tepat di bawah
 * "Penyebab terbesar" supaya dua daftar itu terbaca berdampingan. Di
 * situlah wawasannya: SKU yang tinggi di dua-duanya berarti produksinya
 * tidak stabil (sering habis DAN sering sisa), sedangkan yang tinggi di
 * sini tapi rendah di sana berarti murni overproduksi.
 */
function WastePanel({
  outlet,
  rangeLabel,
}: {
  outlet: Outlet;
  rangeLabel: string;
}) {
  const w = outlet.waste;
  if (!w) return null;
  const lossQty = w.expiredQty + w.damagedQty;
  const nothingToShow =
    lossQty === 0 && w.byReason.length === 0 && w.unknownRows === 0;
  if (nothingToShow) return null;

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Trash2 size={12} /> Susut produk ({rangeLabel})
      </h3>
      <p className="text-[11px] text-muted-foreground">
        {w.producedQty > 0 ? (
          <>
            Penyeimbang Service Level: dari{" "}
            {w.producedQty.toLocaleString("id-ID")} unit yang diproduksi,{" "}
            {w.expiredQty.toLocaleString("id-ID")} terbuang expired dan{" "}
            {w.damagedQty.toLocaleString("id-ID")} rusak — total{" "}
            <span className="font-bold text-destructive tabular-nums">
              {pctLabel(w.lossRate)}
            </span>
            .
          </>
        ) : (
          <>
            {lossQty.toLocaleString("id-ID")} unit ditarik sebagai susut, tapi
            tidak ada produksi tercatat di rentang ini — persentasenya tidak
            bisa dihitung.
          </>
        )}
      </p>

      {w.worstSkus.length > 0 && (
        <ul className="space-y-1.5">
          {w.worstSkus.slice(0, 10).map((s) => (
            <li key={s.key} className="flex items-center gap-3 text-xs">
              <span className="min-w-0 flex-1 truncate" title={s.label}>
                {s.label}
              </span>
              <span
                className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-40"
                role="img"
                aria-label={`${s.label} menyumbang ${(s.share * 100).toFixed(0)} persen dari susut`}
              >
                <span
                  className="block h-full rounded-full bg-destructive"
                  style={{ width: `${Math.max(2, s.share * 100)}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right font-bold tabular-nums text-destructive">
                {s.qty.toLocaleString("id-ID")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Rincian semua alasan, termasuk yang BUKAN kerugian — tanpa ini,
          angka susut terbaca tanpa konteks berapa yang sebenarnya
          terpakai dengan tujuan. */}
      {w.byReason.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {WITHDRAWAL_REASON_GROUPS.map((g) => {
            const items = w.byReason.filter(
              (r) => WITHDRAWAL_REASON_META[r.reason].group === g.group
            );
            if (items.length === 0) return null;
            return (
              <div key={g.group} className="min-w-[9rem]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {items.map((r) => (
                  <p
                    key={r.reason}
                    className={`text-[11px] tabular-nums ${
                      WITHDRAWAL_REASON_META[r.reason].countsAsLoss
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {WITHDRAWAL_REASON_META[r.reason].label}:{" "}
                    {r.qty.toLocaleString("id-ID")}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {w.unknownRows > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {w.unknownRows.toLocaleString("id-ID")} penarikan (
          {w.unknownQty.toLocaleString("id-ID")} unit) tidak punya alasan
          tercatat — tidak ikut dihitung susut, jadi angka di atas kemungkinan
          lebih rendah dari yang sebenarnya.
        </p>
      )}
      {w.cappedRows > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {w.cappedRows.toLocaleString("id-ID")} baris dengan qty tidak masuk
          akal (&gt; {WASTE_QTY_SANITY_CAP.toLocaleString("id-ID")}) dibuang dari
          perhitungan — hampir pasti salah input yang perlu dirapikan.
        </p>
      )}
    </section>
  );
}

/**
 * Rincian per-hari — dikumpulkan di <details> supaya panel tidak melar
 * kalau ada banyak outlet; superadmin buka sesuai kebutuhan, sama seperti
 * grup kategori di editor alokasi Pusat.
 */
function DailyBreakdownSection({
  outlet,
  rangeLabel,
}: {
  outlet: Outlet;
  rangeLabel: string;
}) {
  if (!outlet.live || outlet.live.days.length === 0) return null;
  const days = outlet.live.days.slice().reverse();
  return (
    <details className="group space-y-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <CalendarDays size={12} /> Per hari ({rangeLabel})
        <span className="text-muted-foreground/60 normal-case tracking-normal">
          — klik untuk buka
        </span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {days.map((d) => (
          <li
            key={d.date}
            className="flex items-center gap-3 text-xs tabular-nums"
          >
            <span className="w-[5.5rem] shrink-0 text-muted-foreground">
              {d.date}
            </span>
            <span
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={
                d.percent === null
                  ? `${d.date} tidak dihitung`
                  : `${d.date}: ${(d.percent * 100).toFixed(0)} persen`
              }
            >
              {d.percent !== null && (
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(2, d.percent * 100)}%` }}
                />
              )}
            </span>
            <span className="w-10 shrink-0 text-right font-semibold">
              {d.percent === null ? "—" : `${(d.percent * 100).toFixed(0)}%`}
            </span>
            <span className="w-4 shrink-0 text-center text-warning">
              {d.partialOpname && (
                <span title="Opname parsial — SKU yang tidak dihitung terbaca habis">
                  ⚠
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function HoursSection({ outlet }: { outlet: Outlet }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(outlet.enabled);
  const [open, setOpen] = useState(String(outlet.openHour));
  const [close, setClose] = useState(String(outlet.closeHour));
  const [target, setTarget] = useState(String(Math.round(outlet.target * 100)));
  const [pending, start] = useTransition();

  // `useState` hanya menyemai sekali, sedangkan `router.refresh()` — dipanggil
  // section ini DAN OwnersSection/ExclusionsSection di panel yang sama —
  // mengirim props baru tanpa me-mount ulang. Tanpa sinkronisasi ini field
  // bisa melenceng dari data server (mis. admin lain mengubah target outlet
  // yang sama saat tab ini masih terbuka). Pola sama seperti syncedKey di
  // OwnersSection di bawah.
  const serverKey = `${outlet.enabled}|${outlet.openHour}|${outlet.closeHour}|${outlet.target}`;
  const [syncedKey, setSyncedKey] = useState(serverKey);
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey);
    setEnabled(outlet.enabled);
    setOpen(String(outlet.openHour));
    setClose(String(outlet.closeHour));
    setTarget(String(Math.round(outlet.target * 100)));
  }

  const dirty =
    enabled !== outlet.enabled ||
    Number(open) !== outlet.openHour ||
    Number(close) !== outlet.closeHour ||
    Number(target) !== Math.round(outlet.target * 100);

  function save() {
    start(async () => {
      const res = await setServiceLevelSettings({
        bankAccountId: outlet.id,
        enabled,
        openHour: Number(open),
        closeHour: Number(close),
        target: Number(target) / 100,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengaturan tersimpan");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Clock size={12} /> Jam operasi
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Aktifkan metrik
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Buka</span>
          <input
            type="number"
            min={0}
            max={23}
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            className="mt-0.5 h-9 w-20 rounded-lg border-2 border-foreground bg-card px-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Tutup</span>
          <input
            type="number"
            min={1}
            max={24}
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="mt-0.5 h-9 w-20 rounded-lg border-2 border-foreground bg-card px-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Target %</span>
          <input
            type="number"
            min={1}
            max={100}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-0.5 h-9 w-20 rounded-lg border-2 border-foreground bg-card px-2 text-sm tabular-nums"
          />
        </label>
        <p className="text-[11px] text-muted-foreground">
          Sampel diambil tiap jam bulat, {outlet.openHour}:00–
          {outlet.closeHour - 1}:00 WIB. Jam tutup eksklusif.
        </p>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
        )}
      </div>
    </section>
  );
}

function OwnersSection({
  outlet,
  employees,
}: {
  outlet: Outlet;
  employees: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const initial = outlet.owners.map((o) => o.userId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [pending, start] = useTransition();

  // `useState` hanya menyemai sekali, sedangkan `router.refresh()` — dipanggil
  // section ini DAN HoursSection/ExclusionsSection di panel yang sama —
  // mengirim props baru tanpa me-mount ulang. Tanpa sinkronisasi ini centang
  // bisa melenceng dari data server (mis. admin lain mengubah penugasan).
  // Pembanding dibuat dari ISI daftar, bukan tiap render, supaya centang yang
  // sedang diedit tidak terhapus oleh refresh yang tak berhubungan.
  const serverKey = [...initial].sort().join(",");
  const [syncedKey, setSyncedKey] = useState(serverKey);
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey);
    setSelected(new Set(initial));
  }

  const dirty =
    selected.size !== initial.length || initial.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function save() {
    start(async () => {
      const res = await setServiceLevelOwners({
        bankAccountId: outlet.id,
        userIds: [...selected],
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Penanggung jawab tersimpan");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Users size={12} /> Penanggung jawab
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Metrik ini muncul di dashboard Zota mereka. Boleh lebih dari satu orang.
      </p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
        {employees.map((e) => (
          <label
            key={e.id}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={selected.has(e.id)}
              onChange={() => toggle(e.id)}
            />
            <span className="truncate">{e.name}</span>
          </label>
        ))}
      </div>
      {dirty && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set(initial))}
            disabled={pending}
            className="h-9 rounded-lg border-2 border-foreground bg-card px-3 text-sm font-semibold"
          >
            Batal
          </button>
        </div>
      )}
    </section>
  );
}

function ExclusionsSection({ outlet }: { outlet: Outlet }) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [from, setFrom] = useState(todayWib());
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const skuValue = (s: Outlet["skus"][number]) =>
    `${s.productId}|${s.variantId ?? ""}`;

  function add() {
    const picked = outlet.skus.find((s) => skuValue(s) === sku);
    if (!picked) {
      toast.error("Pilih SKU dulu.");
      return;
    }
    start(async () => {
      const res = await addServiceLevelExclusion({
        bankAccountId: outlet.id,
        productId: picked.productId,
        variantId: picked.variantId,
        excludedFrom: from,
        reason: reason || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengecualian ditambahkan");
      setSku("");
      setReason("");
      router.refresh();
    });
  }

  function end(id: string) {
    const until = todayWib();
    start(async () => {
      const res = await endServiceLevelExclusion({ id, excludedUntil: until });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Pengecualian diakhiri per ${until}`);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (
      !confirm(
        "Hapus permanen? Gunakan ini HANYA untuk membatalkan salah input — " +
          "SKU akan kembali terhitung untuk seluruh periode pengecualian, " +
          "sehingga angka yang sudah dilaporkan ikut berubah."
      )
    )
      return;
    start(async () => {
      const res = await deleteServiceLevelExclusion(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dihapus");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Ban size={12} /> Pengecualian SKU
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Untuk menu yang berhenti dijual. Berlaku <strong>mulai tanggal</strong>{" "}
        yang diisi — periode sebelumnya tetap menghitung SKU ini, jadi angka
        lama tidak berubah.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted-foreground">Produk / varian</span>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="mt-0.5 h-9 min-w-[200px] rounded-lg border-2 border-foreground bg-card px-2 text-sm"
          >
            <option value="">— pilih —</option>
            {outlet.skus.map((s) => (
              <option key={skuValue(s)} value={skuValue(s)}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Mulai</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 h-9 rounded-lg border-2 border-foreground bg-card px-2 text-sm"
          />
        </label>
        <label className="text-xs flex-1 min-w-[140px]">
          <span className="block text-muted-foreground">Alasan (opsional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. sudah tidak diproduksi"
            className="mt-0.5 h-9 w-full rounded-lg border-2 border-foreground bg-card px-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={pending || !sku}
          className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          Tambah
        </button>
      </div>

      {outlet.exclusions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {outlet.exclusions.map((x) => (
            <li
              key={x.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs"
            >
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  x.active
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {x.active ? <Ban size={9} /> : <Check size={9} />}
                {x.active ? "berlaku" : "selesai"}
              </span>
              <span className="font-medium">{x.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {x.excludedFrom} → {x.excludedUntil ?? "seterusnya"}
              </span>
              {x.reason && (
                <span className="text-muted-foreground italic">“{x.reason}”</span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {x.active && (
                  <button
                    type="button"
                    onClick={() => end(x.id)}
                    disabled={pending}
                    className="rounded border border-border px-1.5 py-0.5 hover:bg-muted"
                    title="Akhiri mulai hari ini (riwayat tetap utuh)"
                  >
                    Akhiri
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(x.id)}
                  disabled={pending}
                  className="rounded border border-destructive/40 p-0.5 text-destructive hover:bg-destructive/10"
                  title="Hapus permanen — hanya untuk salah input"
                >
                  <X size={11} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
