"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBranchOmzetTargets } from "@/lib/actions/scorecard-target.actions";

const fmt = (n: number | null) => (n == null ? "" : n.toLocaleString("id-ID"));
const parse = (text: string) => {
  const d = text.replace(/\D/g, "");
  return d ? Number(d) : null;
};
const mask = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 12);
  return d ? Number(d).toLocaleString("id-ID") : "";
};

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0 flex-1 space-y-1">
      <span className="text-[12px] font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rp</span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(mask(e.target.value))}
          placeholder="belum diatur"
          className="h-10 min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-3 text-base tabular-nums"
        />
      </span>
    </label>
  );
}

/** Target omzet bulanan satu cabang, POS dan Custom Cake terpisah. Hanya halaman owner. */
export function OmzetTargetEditor({ branch, initial }: { branch: "Pare" | "Semarang"; initial: { pos: number | null; cake: number | null } }) {
  const router = useRouter();
  const [pos, setPos] = useState(fmt(initial.pos));
  const [cake, setCake] = useState(fmt(initial.cake));
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  const next = { pos: parse(pos), cake: parse(cake) };
  const dirty = next.pos !== saved.pos || next.cake !== saved.cake;

  async function save() {
    if (next.pos === 0 || next.cake === 0) {
      toast.error("Target harus lebih dari 0. Kosongkan kolom untuk menghapus target.");
      return;
    }
    setBusy(true);
    const r = await saveBranchOmzetTargets(branch, next);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setSaved(next);
    toast.success("Target omzet disimpan");
    router.refresh();
  }

  const total = (next.pos ?? 0) + (next.cake ?? 0);

  return (
    <div id={`target-omzet-${branch}`} className="scroll-mt-24 space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <p className="text-[12.5px] font-semibold">Target omzet bulanan</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <MoneyField label="POS" value={pos} onChange={setPos} />
        <MoneyField label="Custom Cake" value={cake} onChange={setCake} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {total > 0 ? `Total target: Rp${total.toLocaleString("id-ID")}. ` : ""}
          Dibagi per hari kerja (Senin–Sabtu). Kolom yang kosong tidak ikut dinilai.
        </p>
        <Button type="button" onClick={save} disabled={busy || !dirty} className="h-10">
          {busy ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
