"use client";

import { Info, Layers, Lightbulb } from "lucide-react";
import { DiscGraphChart } from "./DiscGraphChart";
import { Disclosure, DisclosureGroup } from "@/components/account/Disclosure";
import { DISC_PATTERN_BY_NUM, type DiscPattern } from "@/lib/disc/data/patterns";
import { DISC_DIMENSIONS, DISC_FACTOR_ORDER, DISC_FACTOR_COLOR } from "@/lib/disc/data/dimensions";
import type { DiscResultDTO } from "@/lib/actions/disc.actions";
import type { DiscGraphValues } from "@/lib/disc/scoring";
import type { DiscFactor } from "@/lib/disc/data/questions";

/**
 * Presentasi hasil DISC — dipakai halaman karyawan (/disc) dan detail
 * admin. Mengikuti struktur laporan Frexor: dua grafik (Adaptasi &
 * Alami), pattern per grafik dengan Kekuatan Utama / Memperbaiki
 * Efektivitas / Kecenderungan, ditambah penjelasan 4 dimensi + tips
 * komunikasi.
 *
 * Tingkat 1: dua grafik + nama pattern. Tingkat 2 (diketuk): rincian
 * pattern per grafik dan penjelasan 4 dimensi.
 */
export function DiscResultView({
  result,
  ownerName,
}: {
  result: DiscResultDTO;
  ownerName?: string;
}) {
  const p1 = result.pattern1Num ? DISC_PATTERN_BY_NUM.get(result.pattern1Num) : undefined;
  const p2 = result.pattern2Num ? DISC_PATTERN_BY_NUM.get(result.pattern2Num) : undefined;

  const g1: DiscGraphValues | null =
    result.graph1 ?? (p1 ? { d: p1.ref[0], i: p1.ref[1], s: p1.ref[2], c: p1.ref[3] } : null);
  const g2: DiscGraphValues | null =
    result.graph2 ?? (p2 ? { d: p2.ref[0], i: p2.ref[1], s: p2.ref[2], c: p2.ref[3] } : null);
  const g1Approx = !result.graph1 && !!p1;
  const g2Approx = !result.graph2 && !!p2;

  const tanggal = new Date(result.takenAt + "T00:00:00").toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {ownerName && <span className="font-display font-semibold">{ownerName}</span>}
        {result.positionLabel && (
          <span className="text-muted-foreground">{result.positionLabel}</span>
        )}
        <span className="text-muted-foreground">{tanggal}</span>
        <span
          className={
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
            (result.source === "app"
              ? "bg-primary/10 text-primary"
              : "bg-warning/15 text-warning")
          }
        >
          {result.source === "app" ? "Tes di Zota App" : "Import hasil Frexor"}
        </span>
      </div>

      {/* Dua grafik */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <GraphCard
          title="Grafik 1 · Adaptasi"
          subtitle="Perilaku di pekerjaan, respons terhadap lingkungan"
          values={g1}
          approx={g1Approx}
          pattern={p1}
          high={result.pattern1High}
        />
        <GraphCard
          title="Grafik 2 · Alami"
          subtitle="Perilaku dasar sehari-hari, dirimu yang sesungguhnya"
          values={g2}
          approx={g2Approx}
          pattern={p2}
          high={result.pattern2High}
        />
      </div>

      {/* Rincian: tertutup sampai diketuk */}
      <DisclosureGroup>
        {p1 && (
          <Disclosure
            title="Rincian Grafik 1 · Adaptasi"
            icon={Layers}
            summary={`${p1.name} #${p1.num}`}
          >
            <PatternDetail pattern={p1} />
          </Disclosure>
        )}
        {p2 && (
          <Disclosure
            title="Rincian Grafik 2 · Alami"
            icon={Layers}
            summary={`${p2.name} #${p2.num}`}
          >
            <PatternDetail pattern={p2} />
          </Disclosure>
        )}
        <Disclosure
          title="Memahami 4 dimensi DISC"
          icon={Lightbulb}
          summary="Tidak ada tipe yang lebih baik atau lebih buruk"
        >
          <DimensionExplainer highlight={[p1?.high, p2?.high].filter(Boolean) as DiscFactor[]} />
        </Disclosure>
      </DisclosureGroup>
    </div>
  );
}

function GraphCard({
  title,
  subtitle,
  values,
  approx,
  pattern,
  high,
}: {
  title: string;
  subtitle: string;
  values: DiscGraphValues | null;
  approx: boolean;
  pattern?: DiscPattern;
  high: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-display text-sm font-semibold">{title}</p>
      <p className="mb-2 text-xs text-muted-foreground">{subtitle}</p>
      {values ? (
        <DiscGraphChart values={values} />
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Nilai grafik tidak tersedia.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {pattern && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            {pattern.name} #{pattern.num}
            {high && (
              <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] text-background">
                {high}
              </span>
            )}
          </span>
        )}
        {approx && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            title="Hasil ini diimport dari PDF; nilai grafik ditampilkan sebagai perkiraan dari bentuk pattern-nya."
          >
            <Info size={11} aria-hidden /> grafik perkiraan dari pattern
          </span>
        )}
      </div>
    </div>
  );
}

function PatternDetail({ pattern }: { pattern: DiscPattern }) {
  const k = pattern.kecenderungan;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold">Kekuatan utama</p>
        <ul className="space-y-1 text-[13px] leading-snug">
          {pattern.kekuatan.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold">Memperbaiki efektivitas dengan</p>
        <ul className="space-y-1 text-[13px] leading-snug">
          {pattern.perbaikan.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold">Kecenderungan</p>
        <dl className="space-y-1.5 text-[13px] leading-snug">
          <TendencyRow k="Tujuan" v={k.tujuan} />
          <TendencyRow k="Menilai orang lain dengan" v={k.menilaiOrang} />
          <TendencyRow k="Mempengaruhi orang lain dengan" v={k.mempengaruhi} />
          <TendencyRow k="Nilai terhadap organisasi" v={k.nilaiOrganisasi} />
          <TendencyRow k="Berlebihan menggunakan" v={k.berlebihan} />
          <TendencyRow k="Ketika di bawah tekanan" v={k.tekanan} />
          <TendencyRow k="Ketakutan" v={k.ketakutan} />
        </dl>
      </div>
    </div>
  );
}

function TendencyRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-xs text-muted-foreground sm:w-52">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Daftar 4 dimensi D-I-S-C + tips komunikasi; tiap dimensi dilipat lagi. */
function DimensionExplainer({ highlight }: { highlight: DiscFactor[] }) {
  const highSet = new Set(highlight);
  return (
    <DisclosureGroup>
      {DISC_FACTOR_ORDER.map((f) => {
        const d = DISC_DIMENSIONS[f];
        return (
          <Disclosure
            key={f}
            title={`${f} · ${d.nama}`}
            summary={highSet.has(f) ? "Faktor tertinggimu" : d.mengukur}
            status={highSet.has(f) ? "ok" : undefined}
            statusLabel="Faktor tertinggimu"
            defaultOpen={f === highlight[0]}
          >
            <div className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
              <span
                className="grid size-6 place-items-center rounded-full text-xs font-semibold text-white md:col-span-2"
                style={{ background: DISC_FACTOR_COLOR[f] }}
              >
                {f}
              </span>
              <ExplainList title="Nilai untuk tim" items={d.nilaiTim} />
              <ExplainList title="Lingkungan ideal" items={d.lingkunganIdeal} />
              <ExplainList title="Saat tertekan cenderung" items={d.saatTertekan} />
              <ExplainList title="Potensi keterbatasan" items={d.keterbatasan} />
              <div className="md:col-span-2">
                <ExplainList
                  title={`Tips berkomunikasi dengan ${f} tinggi`}
                  items={d.tipsKomunikasi}
                />
              </div>
            </div>
          </Disclosure>
        );
      })}
    </DisclosureGroup>
  );
}

function ExplainList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
      <ul className="space-y-0.5">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
