"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveScorecardThresholds } from "@/lib/actions/scorecard-threshold.actions";
import { DEFAULT_THRESHOLDS, validateThresholds, type BranchThresholds } from "@/lib/scorecard/thresholds";

const ANCHOR = "ambang-scorecard";
const toText = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const parse = (v: string) => Number(v.replace(",", "."));

type Fields = Record<keyof BranchThresholds, string>;
const toFields = (t: BranchThresholds): Fields => ({
  wasteGreen: toText(t.wasteGreen),
  wasteYellow: toText(t.wasteYellow),
  slGreen: toText(t.slGreen),
  slYellow: toText(t.slYellow),
});

function Num({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix: string }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-[12px] font-semibold">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{prefix}</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
          className="h-10 w-full min-w-0 rounded-lg border-2 border-border bg-background px-3 text-base tabular-nums md:h-9 md:text-sm"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </span>
    </label>
  );
}

/** Bilah warna kecil: gambaran rentang hijau/kuning/merah dari angka yang sedang diketik. */
function Bar({ order }: { order: ["green" | "yellow" | "red", "green" | "yellow" | "red", "green" | "yellow" | "red"] }) {
  const cls = { green: "bg-success", yellow: "bg-warning", red: "bg-destructive" } as const;
  return (
    <span aria-hidden className="flex h-2 overflow-hidden rounded-full">
      {order.map((b) => (
        <span key={b} className={cn("flex-1", cls[b])} />
      ))}
    </span>
  );
}

/**
 * Ambang warna Scorecard Cabang untuk Waste dan Service level (dipakai beranda karyawan, halaman Scorecard Cabang, dan poin
 * bonus). Terlipat secara bawaan supaya halaman tidak penuh; terbuka sendiri bila alamat membawa #ambang-scorecard.
 */
export function ScorecardThresholdsCard({ initial }: { initial: BranchThresholds }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [f, setF] = useState<Fields>(toFields(initial));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === `#${ANCHOR}`) setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

  const next: BranchThresholds = { wasteGreen: parse(f.wasteGreen), wasteYellow: parse(f.wasteYellow), slGreen: parse(f.slGreen), slYellow: parse(f.slYellow) };
  const error = validateThresholds(next);
  const dirty = (Object.keys(next) as (keyof BranchThresholds)[]).some((k) => next[k] !== saved[k]);
  const isDefault = (Object.keys(DEFAULT_THRESHOLDS) as (keyof BranchThresholds)[]).every((k) => saved[k] === DEFAULT_THRESHOLDS[k]);
  const set = (k: keyof Fields) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save(value: BranchThresholds) {
    setBusy(true);
    try {
      const r = await saveScorecardThresholds(value);
      if (!r.ok || !r.data) {
        toast.error(r.ok ? "Gagal menyimpan" : r.error);
        return;
      }
      // Kartu memegang nilainya sendiri, jadi tidak perlu memuat ulang seluruh halaman (halaman ini berat: menghitung tiap outlet).
      setSaved(r.data);
      setF(toFields(r.data));
      toast.success("Ambang scorecard disimpan");
    } catch {
      // Jaringan putus / server tidak menjawab: tombol harus kembali aktif dan pengguna diberi tahu.
      toast.error("Tidak ada jawaban dari server. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id={ANCHOR} className="scroll-mt-24 rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${ANCHOR}-isi`}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Ambang warna Scorecard Cabang</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            Waste hijau ≤ {toText(saved.wasteGreen)}%, kuning ≤ {toText(saved.wasteYellow)}% · Service level hijau ≥ {toText(saved.slGreen)}%, kuning ≥ {toText(saved.slYellow)}%
            {!isDefault && " · diubah dari bawaan"}
          </span>
        </span>
        <span className="text-xs font-semibold text-primary">{open ? "Tutup" : "Atur"}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={`${ANCHOR}-isi`} className="space-y-4 border-t border-border p-4">
          <p className="text-xs leading-snug text-muted-foreground">
            Menentukan warna kartu &ldquo;Waste &amp; Service level&rdquo; di beranda karyawan dan halaman Scorecard Cabang (warna kartu mengikuti yang lebih
            rendah). Mengubah ambang juga mengubah poin bonus yang dihitung dari scorecard, termasuk saat bulan lalu dihitung ulang.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2.5">
              <h3 className="text-[13px] font-bold">Waste</h3>
              <Bar order={["green", "yellow", "red"]} />
              <div className="grid grid-cols-2 gap-3">
                <Num label="Hijau jika paling banyak" prefix="≤" value={f.wasteGreen} onChange={set("wasteGreen")} />
                <Num label="Kuning jika paling banyak" prefix="≤" value={f.wasteYellow} onChange={set("wasteYellow")} />
              </div>
              <p className="text-[11px] text-muted-foreground">Selebihnya merah. Kecil itu baik.</p>
            </div>
            <div className="space-y-2.5">
              <h3 className="text-[13px] font-bold">Service level</h3>
              <Bar order={["red", "yellow", "green"]} />
              <div className="grid grid-cols-2 gap-3">
                <Num label="Hijau jika minimal" prefix="≥" value={f.slGreen} onChange={set("slGreen")} />
                <Num label="Kuning jika minimal" prefix="≥" value={f.slYellow} onChange={set("slYellow")} />
              </div>
              <p className="text-[11px] text-muted-foreground">Di bawah batas kuning merah. Besar itu baik.</p>
            </div>
          </div>
          {error && dirty && <p className="text-xs font-semibold text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => save(next)} disabled={busy || !dirty || !!error} className="h-10">
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
            {!isDefault && (
              <Button type="button" variant="outline" onClick={() => save(DEFAULT_THRESHOLDS)} disabled={busy} className="h-10">
                Kembalikan bawaan
              </Button>
            )}
            <span className="text-[11px] text-muted-foreground">
              Bawaan: Waste ≤ {DEFAULT_THRESHOLDS.wasteGreen}% / ≤ {DEFAULT_THRESHOLDS.wasteYellow}%, Service level ≥ {DEFAULT_THRESHOLDS.slGreen}% / ≥ {DEFAULT_THRESHOLDS.slYellow}%.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
