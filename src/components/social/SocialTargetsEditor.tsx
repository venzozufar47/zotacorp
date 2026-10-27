"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveSocialScorecardConfig, type BrandMetricView, type SocialBrandCard } from "@/lib/actions/social-scorecard.actions";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const UNIT: Record<BrandMetricView["kind"], string> = { rupiah: "Rp", count: "", pct: "%" };

/** Target bulanan + ambang hijau/kuning/merah per brand per metrik. Setiap perubahan = versi baru (wajib alasan). */
export function SocialTargetsEditor({ brands, month }: { brands: SocialBrandCard[]; month: string }) {
  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-muted-foreground">
        Status dinilai dari pencapaian terhadap target: hijau bila ≥ batas hijau, merah bila &lt; batas merah, di antaranya kuning. Target kosong = metrik
        tampil tanpa warna. Perubahan berlaku mulai bulan yang dipilih dan riwayat lama tetap tersimpan.
      </p>
      {brands.map((b) => (
        <section key={b.brandId} className="rounded-2xl border-2 border-foreground bg-card p-3.5">
          <h3 className="mb-2 font-display text-[14px] font-bold">{b.label}</h3>
          <ul className="space-y-1.5">
            {b.metrics.map((m) => (
              <MetricRow key={m.code} brand={b} m={m} month={month} />
            ))}
          </ul>
          {b.history.length > 0 && (
            <details className="mt-2.5 text-[12px]">
              <summary className="cursor-pointer font-semibold text-muted-foreground">Riwayat perubahan ({b.history.length})</summary>
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                {b.history.map((h, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">{h.effectiveFrom.slice(0, 7)}</span> · {labelOf(b, h.metricCode)}: target{" "}
                    {h.targetValue == null ? "kosong" : nf.format(h.targetValue)}, hijau ≥ {nf.format(h.greenBound)}%, merah &lt; {nf.format(h.redBound)}% — “{h.reason}”
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

const labelOf = (b: SocialBrandCard, code: string) => b.metrics.find((m) => m.code === code)?.label ?? code;

function MetricRow({ brand, m, month }: { brand: SocialBrandCard; m: BrandMetricView; month: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [target, setTarget] = useState(m.target == null ? "" : String(m.target));
  const [green, setGreen] = useState(String(m.greenBound ?? 100));
  const [red, setRed] = useState(String(m.redBound ?? 70));
  const [reason, setReason] = useState("");

  function save() {
    const t = target.trim() === "" ? null : Number(target.replace(",", "."));
    if (t != null && !Number.isFinite(t)) return void toast.error("Target harus angka");
    start(async () => {
      const r = await saveSocialScorecardConfig({
        brandId: brand.brandId,
        metricCode: m.code,
        targetValue: t,
        greenBound: Number(green),
        redBound: Number(red),
        effectiveFrom: month,
        reason,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Target tersimpan");
      setEditing(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl bg-muted/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[150px] text-[12.5px] font-semibold">{m.label}</span>
        <span className="text-[12px] text-muted-foreground">
          target {m.target == null ? "belum diisi" : `${UNIT[m.kind]}${nf.format(m.target)}`} · hijau ≥ {m.greenBound ?? "—"}% · merah &lt; {m.redBound ?? "—"}%
        </span>
        {!editing && (
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setEditing(true)}>
            Ubah
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_2fr_auto] sm:items-end">
          <Field label={`Target ${UNIT[m.kind] ? `(${UNIT[m.kind]})` : ""}`.trim()}>
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="kosong" className={inputCls} />
          </Field>
          <Field label="Hijau ≥ (%)">
            <input value={green} onChange={(e) => setGreen(e.target.value)} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Merah < (%)">
            <input value={red} onChange={(e) => setRed(e.target.value)} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Alasan perubahan (wajib)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. target Q4 naik" className={inputCls} />
          </Field>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : null} Simpan
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
              Batal
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

const inputCls = "h-9 w-full rounded-lg border-2 border-border bg-background px-2.5 text-[13px]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
