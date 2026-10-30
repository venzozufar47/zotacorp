"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deriveTargetBasis, type TargetBasisPayload } from "@/lib/scorecard/target-basis";

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;
const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[12.5px] font-bold">{title}</h3>
      <div className="space-y-1 text-[12px] leading-snug">{children}</div>
    </section>
  );
}

/**
 * Tombol "Dasar target" di kepala kartu target omzet; membuka popup berisi hitungan yang mendasari target. Murni catatan
 * pertimbangan owner: tidak mengubah target yang tersimpan. Rinciannya dari tabel `branch_target_basis` (hanya admin).
 */
export function TargetBasisDialog({
  branch,
  basis,
  currentTarget,
}: {
  branch: "Pare" | "Semarang";
  basis: TargetBasisPayload | null;
  /** Total target omzet yang sedang tersimpan (POS + Custom Cake), sebagai pembanding. */
  currentTarget: number;
}) {
  const [open, setOpen] = useState(false);
  if (!basis) return null;
  const r = deriveTargetBasis(basis);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Dasar penentuan target cabang ${branch}`}
        className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold text-primary hover:bg-primary/10"
      >
        <Info size={14} aria-hidden /> Dasar target
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dasar penentuan target · Cabang {branch}</DialogTitle>
            <DialogDescription>
              Agar laba minimal {rp(basis.profitTarget)} per bulan. Omzet = POS + Custom Cake. Bonus LK tidak dihitung. Hanya patokan
              pertimbangan, tidak mengubah target. Per {dateLabel(basis.asOf)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Section title="1. Gaji per bulan">
              {basis.salaries.map((s) => (
                <Row key={s.label} label={s.label} value={rp(s.amount)} />
              ))}
              <Row label="Total gaji" value={rp(r.salaryTotal)} strong />
            </Section>
            <Section title="2. Sewa dan biaya lain per bulan">
              <Row label="Sewa" value={rp(basis.rent)} />
              {basis.other.map((o) => (
                <Row key={o.label} label={o.label} value={rp(o.amount)} />
              ))}
              {basis.otherNote && <p className="text-muted-foreground">{basis.otherNote}</p>}
              <Row label="Total biaya tetap (gaji + sewa + lain)" value={rp(r.fixedCost)} strong />
            </Section>
            <Section title="3. COGS">
              <Row label="COGS dari omzet" value={pct(basis.cogs.pct)} strong />
              <Row label="Sisa tiap rupiah omzet (margin)" value={pct(r.margin * 100)} />
              <p className="text-muted-foreground">{basis.cogs.source}</p>
            </Section>
            <Section title="4. Hasil: omzet bulanan yang dibutuhkan">
              {r.breakEven != null && r.required != null ? (
                <>
                  <Row label={`Impas = ${rp(r.fixedCost)} ÷ ${pct(r.margin * 100)}`} value={rp(r.breakEven)} />
                  <Row
                    label={`Laba ${rp(basis.profitTarget)} = (${rp(r.fixedCost)} + ${rp(basis.profitTarget)}) ÷ ${pct(r.margin * 100)}`}
                    value={rp(r.required)}
                    strong
                  />
                  {currentTarget > 0 && (
                    <>
                      <Row label="Target tersimpan saat ini (POS + Custom Cake)" value={rp(currentTarget)} />
                      <Row
                        label={currentTarget >= r.required ? "Target tersimpan di atas hasil hitung" : "Target tersimpan di bawah hasil hitung"}
                        value={`${currentTarget >= r.required ? "+" : "−"}${rp(Math.abs(currentTarget - r.required))}`}
                      />
                    </>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">COGS 100% atau lebih: omzet berapa pun tidak menutup biaya.</p>
              )}
            </Section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
