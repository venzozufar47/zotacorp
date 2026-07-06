"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { DiscGraphChart } from "./DiscGraphChart";
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {ownerName && <span className="font-display font-bold">{ownerName}</span>}
        {result.positionLabel && (
          <span className="text-muted-foreground">{result.positionLabel}</span>
        )}
        <span className="text-muted-foreground">{tanggal}</span>
        <span
          className={
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
            (result.source === "app"
              ? "bg-primary/15 text-primary"
              : "bg-amber-100 text-amber-800")
          }
        >
          {result.source === "app" ? "Tes di Zota App" : "Import hasil Frexor"}
        </span>
      </div>

      {/* Dua grafik */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GraphCard
          title="Grafik 1 · Adaptasi"
          subtitle="Perilaku di pekerjaan/kantor — respons terhadap lingkungan"
          values={g1}
          approx={g1Approx}
          pattern={p1}
          high={result.pattern1High}
        />
        <GraphCard
          title="Grafik 2 · Alami"
          subtitle="Perilaku dasar sehari-hari/rumah — dirimu yang sesungguhnya"
          values={g2}
          approx={g2Approx}
          pattern={p2}
          high={result.pattern2High}
        />
      </div>

      {/* Detail pattern */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {p1 && <PatternCard label="Grafik 1 · Adaptasi" pattern={p1} high={result.pattern1High} />}
        {p2 && <PatternCard label="Grafik 2 · Alami" pattern={p2} high={result.pattern2High} />}
      </div>

      {/* Penjelasan dimensi */}
      <DimensionExplainer highlight={[p1?.high, p2?.high].filter(Boolean) as DiscFactor[]} />
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
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
      <p className="font-display font-bold text-sm">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-2">{subtitle}</p>
      {values ? (
        <DiscGraphChart values={values} />
      ) : (
        <p className="text-xs text-muted-foreground italic py-8 text-center">
          Nilai grafik tidak tersedia.
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        {pattern && (
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-warning/40 px-3 py-1 text-xs font-bold">
            {pattern.name} #{pattern.num}
            {high && (
              <span className="rounded-full bg-foreground text-background px-1.5 py-px text-[10px]">
                {high}
              </span>
            )}
          </span>
        )}
        {approx && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            title="Hasil ini diimport dari PDF; nilai grafik ditampilkan sebagai perkiraan dari bentuk pattern-nya."
          >
            <Info size={11} /> grafik perkiraan dari pattern
          </span>
        )}
      </div>
    </div>
  );
}

function PatternCard({
  label,
  pattern,
  high,
}: {
  label: string;
  pattern: DiscPattern;
  high: string | null;
}) {
  const k = pattern.kecenderungan;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {label}
        </p>
        <p className="font-display font-bold text-lg">
          {pattern.name} #{pattern.num}
          {high && <span className="ml-2 text-sm font-semibold text-primary">{high}</span>}
        </p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-1">Kekuatan utama</p>
        <ul className="space-y-1 text-[13px] leading-snug">
          {pattern.kekuatan.map((s, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-success shrink-0">✦</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-1">
          Memperbaiki efektivitas dengan
        </p>
        <ul className="space-y-1 text-[13px] leading-snug">
          {pattern.perbaikan.map((s, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-warning shrink-0">▲</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-1">Kecenderungan</p>
        <dl className="text-[12.5px] leading-snug space-y-1">
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
      <dt className="font-semibold text-muted-foreground sm:w-56 shrink-0 uppercase text-[10.5px] tracking-wide pt-0.5">
        {k}
      </dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Aksordion 4 dimensi D-I-S-C + tips komunikasi. */
function DimensionExplainer({ highlight }: { highlight: DiscFactor[] }) {
  const highSet = new Set(highlight);
  const [open, setOpen] = useState<DiscFactor | null>(highlight[0] ?? null);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-display font-bold text-sm mb-1">Memahami 4 dimensi DISC</p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Setiap orang punya keempat faktor dengan intensitas berbeda — tidak ada
        tipe yang lebih baik atau lebih buruk.
      </p>
      <div className="space-y-2">
        {DISC_FACTOR_ORDER.map((f) => {
          const d = DISC_DIMENSIONS[f];
          const isOpen = open === f;
          return (
            <div key={f} className="rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : f)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/10"
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span
                  className="grid place-items-center size-6 rounded-full text-white text-xs font-bold shrink-0"
                  style={{ background: DISC_FACTOR_COLOR[f] }}
                >
                  {f}
                </span>
                <span className="font-semibold text-sm">{d.nama}</span>
                <span className="text-[11px] text-muted-foreground truncate">{d.mengukur}</span>
                {highSet.has(f) && (
                  <span className="ml-auto shrink-0 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold">
                    faktor tertinggimu
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="px-4 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExplainList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-muted-foreground shrink-0">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
