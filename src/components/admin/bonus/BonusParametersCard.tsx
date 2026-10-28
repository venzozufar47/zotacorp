"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRp } from "@/lib/cashflow/format";
import { quarterLabel } from "@/lib/bonus/periods";
import { setBonusParameters, type BonusQuarterView } from "@/lib/actions/bonus.actions";

type Branch = "Pare" | "Semarang";
const BRANCHES: Branch[] = ["Pare", "Semarang"];

const mask = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 12);
  return d ? Number(d).toLocaleString("id-ID") : "";
};
const digits = (s: string) => s.replace(/\D/g, "");

interface Draft {
  p: string;
  lk: string;
}

/**
 * Parameter bonus per kuartal (p dan LK dasar) untuk kedua cabang — kuartal berjalan maupun yang sudah lewat.
 * Ringkas bila sudah lengkap, terbuka otomatis bila ada yang belum diisi. Terkunci setelah ada bonus terbit.
 */
export function BonusParametersCard({ view }: { view: BonusQuarterView }) {
  const router = useRouter();
  const missing = BRANCHES.some((b) => !view.params[b]);
  const [editing, setEditing] = useState(missing);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<Branch, Draft>>(() => ({
    Pare: { p: view.params.Pare ? String(view.params.Pare.p) : "", lk: view.params.Pare ? mask(String(view.params.Pare.lkDasar)) : "" },
    Semarang: { p: view.params.Semarang ? String(view.params.Semarang.p) : "", lk: view.params.Semarang ? mask(String(view.params.Semarang.lkDasar)) : "" },
  }));

  const set = (b: Branch, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [b]: { ...d[b], ...patch } }));

  async function save() {
    const todo = BRANCHES.filter((b) => !view.params[b]?.locked);
    for (const b of todo) {
      const p = Number(draft[b].p.replace(",", "."));
      if (draft[b].p.trim() === "" || !Number.isFinite(p) || p < 0 || p > 100) return void toast.error(`${b}: p harus antara 0 dan 100 (%)`);
      if (!digits(draft[b].lk)) return void toast.error(`${b}: isi LK dasar`);
    }
    setSaving(true);
    for (const b of todo) {
      const res = await setBonusParameters({ branch: b, quarter: view.quarter, p: Number(draft[b].p.replace(",", ".")), lkDasar: Number(digits(draft[b].lk)) });
      if (!res.ok) {
        setSaving(false);
        return void toast.error(`${b}: ${res.error}`);
      }
    }
    setSaving(false);
    toast.success(`Parameter ${quarterLabel(view.quarter)} tersimpan`);
    setEditing(false);
    router.refresh();
  }

  const allLocked = BRANCHES.every((b) => view.params[b]?.locked);

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-[15px] font-bold">Parameter {quarterLabel(view.quarter)}</h2>
          <p className="text-[12px] text-muted-foreground">p (%) dan LK dasar berlaku untuk tiga bulan dalam kuartal ini.</p>
        </div>
        {!editing && !allLocked && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Ubah
          </Button>
        )}
      </div>

      {!editing ? (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {BRANCHES.map((b) => {
            const pr = view.params[b];
            return (
              <div key={b} className="rounded-xl bg-muted/50 px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                  {b}
                  {pr?.locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 text-[10px] font-bold uppercase text-warning">
                      <Lock size={10} /> terkunci
                    </span>
                  )}
                </dt>
                <dd className="mt-0.5 text-[14px] font-semibold tabular-nums">
                  p {pr?.p}% · LK dasar {formatRp(pr?.lkDasar ?? 0)}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <div className="mt-3 space-y-4">
          {missing && <p className="rounded-xl bg-warning/10 px-3 py-2 text-[12.5px] text-warning">Parameter kuartal ini belum lengkap — bonus belum bisa dihitung.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {BRANCHES.map((b) => {
              const locked = !!view.params[b]?.locked;
              const prev = view.previous[b];
              return (
                <fieldset key={b} disabled={locked} className="space-y-2 rounded-xl border border-border p-3 disabled:opacity-60">
                  <legend className="px-1 text-[13px] font-bold">
                    {b} {locked && <span className="font-normal text-warning">· terkunci (sudah ada bonus terbit)</span>}
                  </legend>
                  <div className="grid grid-cols-[6rem_1fr] gap-2">
                    <label className="space-y-1">
                      <span className="text-[12px] font-semibold">p (%)</span>
                      <input
                        inputMode="decimal"
                        value={draft[b].p}
                        onChange={(e) => set(b, { p: e.target.value.replace(/[^\d.,]/g, "").slice(0, 6) })}
                        className="h-11 w-full rounded-lg border-2 border-border bg-background px-3 text-base tabular-nums"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[12px] font-semibold">LK dasar</span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Rp</span>
                        <input
                          inputMode="numeric"
                          value={draft[b].lk}
                          onChange={(e) => set(b, { lk: mask(e.target.value) })}
                          className="h-11 min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-3 text-base tabular-nums"
                        />
                      </span>
                    </label>
                  </div>
                  {prev && !locked && (
                    <button
                      type="button"
                      onClick={() => set(b, { p: String(prev.p), lk: mask(String(prev.lkDasar)) })}
                      className="text-[12px] font-semibold text-primary hover:underline"
                    >
                      Pakai nilai kuartal lalu ({prev.p}% · {formatRp(prev.lkDasar)})
                    </button>
                  )}
                </fieldset>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} loading={saving} className="h-11 flex-1 sm:flex-none sm:px-8">
              Simpan parameter
            </Button>
            {!missing && (
              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving} className="h-11">
                Batal
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
