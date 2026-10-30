"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { saveBranchOmzetTargets } from "@/lib/actions/scorecard-target.actions";
import type { OmzetMonth } from "@/lib/actions/scorecard.actions";

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
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

/**
 * Target omzet bulanan satu cabang, POS dan Custom Cake terpisah. Hanya halaman owner. Terlipat secara bawaan supaya tidak
 * memakan tempat (ringkasan target tetap terlihat di kepala kartu); terbuka sendiri bila alamat membawa jangkar kartu ini.
 */
export function OmzetTargetEditor({
  branch,
  initial,
  history,
}: {
  branch: "Pare" | "Semarang";
  initial: { pos: number | null; cake: number | null };
  /** Omzet 3 bulan penuh terakhir sebagai acuan menetapkan target. */
  history: OmzetMonth[];
}) {
  const router = useRouter();
  const [pos, setPos] = useState(fmt(initial.pos));
  const [cake, setCake] = useState(fmt(initial.cake));
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const anchor = `target-omzet-${branch}`;

  // Tautan "atur target" dari kartu scorecard memakai #target-omzet-<cabang>: buka kartunya agar tujuannya terlihat.
  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === `#${anchor}`) setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [anchor]);

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
    <div id={anchor} className="scroll-mt-24 rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${anchor}-isi`}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold">Target omzet bulanan</span>
          {!open && (
            <span className="block truncate text-[11px] text-muted-foreground">
              {saved.pos == null && saved.cake == null
                ? "Belum diatur"
                : `POS ${saved.pos == null ? "—" : rp(saved.pos)} · Custom Cake ${saved.cake == null ? "—" : rp(saved.cake)}`}
              {dirty && " · belum disimpan"}
            </span>
          )}
        </span>
        <span className="text-[11.5px] font-semibold text-primary">{open ? "Tutup" : "Atur"}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={`${anchor}-isi`} className="space-y-3 border-t border-border p-3.5">
      {history.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[26rem] text-[11.5px]">
            <caption className="sr-only">Omzet 3 bulan terakhir</caption>
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold">Bulan</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">POS</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Custom Cake</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Total</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Per hari kerja</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {history.map((h) => (
                <tr key={h.month} className="border-t border-border">
                  <td className="px-2.5 py-1.5 font-medium">{h.label}</td>
                  <td className="px-2.5 py-1.5 text-right">{rp(h.pos)}</td>
                  <td className="px-2.5 py-1.5 text-right">{rp(h.cake)}</td>
                  <td className="px-2.5 py-1.5 text-right font-semibold">{rp(h.pos + h.cake)}</td>
                  <td className="px-2.5 py-1.5 text-right text-muted-foreground">{rp((h.pos + h.cake) / h.workingDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <MoneyField label="POS" value={pos} onChange={setPos} />
        <MoneyField label="Custom Cake" value={cake} onChange={setCake} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {total > 0 ? `Total target: Rp${total.toLocaleString("id-ID")}. ` : ""}
          Kartu menampilkan progres omzet bulan berjalan terhadap target bulan penuh. Kolom yang kosong tidak ikut dinilai.
        </p>
        <Button type="button" onClick={save} disabled={busy || !dirty} className="h-10">
          {busy ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
        </div>
      )}
    </div>
  );
}
