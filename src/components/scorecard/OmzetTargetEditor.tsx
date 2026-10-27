"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBranchOmzetTarget } from "@/lib/actions/scorecard-target.actions";

const fmt = (n: number | null) => (n == null ? "" : n.toLocaleString("id-ID"));

/** Target omzet bulanan satu cabang (POS + Custom Cake). Hanya halaman owner. */
export function OmzetTargetEditor({ branch, initial }: { branch: "Pare" | "Semarang"; initial: number | null }) {
  const router = useRouter();
  const [text, setText] = useState(fmt(initial));
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  const digits = text.replace(/\D/g, "");
  const value = digits ? Number(digits) : null;
  const dirty = value !== saved;

  async function save() {
    if (value !== null && value <= 0) {
      toast.error("Target harus lebih dari 0. Kosongkan kolom untuk menghapus target.");
      return;
    }
    setBusy(true);
    const r = await saveBranchOmzetTarget(branch, value);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setSaved(value);
    toast.success(value === null ? "Target omzet dihapus" : "Target omzet disimpan");
    router.refresh();
  }

  return (
    <div id={`target-omzet-${branch}`} className="scroll-mt-24 space-y-2 rounded-2xl border border-border bg-card p-3.5">
      <p className="text-[12.5px] font-semibold">Target omzet bulanan — POS + Custom Cake</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rp</span>
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(0, 12);
            setText(d ? Number(d).toLocaleString("id-ID") : "");
          }}
          placeholder="mis. 60.000.000"
          aria-label={`Target omzet bulanan ${branch}`}
          className="h-10 min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-3 text-base tabular-nums"
        />
        <Button type="button" onClick={save} disabled={busy || !dirty} className="h-10">
          {busy ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Kartu membandingkan omzet berjalan dengan target yang dihitung sebanding hari berjalan. Kosongkan lalu simpan untuk menghapus target.
      </p>
    </div>
  );
}
