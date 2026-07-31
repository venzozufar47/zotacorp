"use client";

/**
 * Form opname bahan baku. Mirror alur `StockOpnameForm` POS: isi jumlah
 * fisik per bahan, sistem menampilkan estimasinya di sebelah, dan selisih
 * besar memunculkan konfirmasi (bukan error) sebelum commit.
 *
 * Opname adalah SATU-SATUNYA kebenaran stok di model ini — di antara dua
 * opname semuanya estimasi. Karena itu form ini tidak memaksa mengisi
 * semua bahan: yang dikosongkan sekadar tidak ikut dihitung ulang.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { parseDecimalId } from "@/components/admin/costing/fields";
import { submitMaterialOpname } from "@/lib/actions/procurement.actions";
import type { ProcurementRow } from "@/lib/procurement/rows";

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

export function MaterialOpnameForm({
  businessUnit,
  rows,
}: {
  businessUnit: string;
  rows: ProcurementRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filled = useMemo(
    () =>
      rows
        .map((r) => ({ row: r, raw: draft[r.material.id] }))
        .filter((x) => x.raw !== undefined && x.raw.trim() !== "")
        .map((x) => ({
          row: x.row,
          qty: parseDecimalId(x.raw!) ?? 0,
        }))
        .filter((x) => Number.isFinite(x.qty) && x.qty >= 0),
    [rows, draft]
  );

  const diffs = useMemo(() => {
    let count = 0;
    let value = 0;
    for (const f of filled) {
      const expected = f.row.metrics.onHandRaw ?? 0;
      const d = f.qty - expected;
      if (Math.abs(d) > 1e-6) {
        count++;
        value += d * f.row.metrics.unitCost;
      }
    }
    return { count, value };
  }, [filled]);

  function commit() {
    if (filled.length === 0) {
      toast.error("Isi minimal satu bahan");
      return;
    }
    startTransition(async () => {
      const res = await submitMaterialOpname({
        businessUnit,
        items: filled.map((f) => ({
          materialId: f.row.material.id,
          physicalQty: f.qty,
        })),
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Opname tersimpan — ${res.data?.diffItems ?? 0} bahan selisih`
      );
      setConfirmOpen(false);
      router.push(`/pengadaan?bu=${encodeURIComponent(businessUnit)}`);
      router.refresh();
    });
  }

  function onSubmit() {
    if (diffs.count > 0) {
      setConfirmOpen(true);
      return;
    }
    commit();
  }

  const byCategory = useMemo(() => {
    const m = new Map<string, ProcurementRow[]>();
    for (const r of rows) {
      const k = r.material.category?.trim() || "Tanpa kategori";
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, "id"));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm text-xs text-muted-foreground">
        Isi jumlah <b className="text-foreground">fisik</b> hasil hitung. Kolom
        &ldquo;estimasi&rdquo; adalah tebakan sistem sejak opname terakhir —
        kalau berbeda jauh, yang benar adalah hitungan fisikmu. Bahan yang
        dikosongkan tidak ikut diopname.
      </div>

      {byCategory.map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {cat}
            <span className="flex-1 h-px bg-border" />
          </h3>
          {list.map((r) => {
            const raw = draft[r.material.id] ?? "";
            const qty = raw.trim() === "" ? null : parseDecimalId(raw);
            const expected = r.metrics.onHandRaw;
            const diff =
              qty != null && expected != null ? qty - expected : null;
            return (
              <div
                key={r.material.id}
                className="rounded-xl border border-border bg-background/40 px-3 py-2 flex flex-wrap items-center gap-2"
              >
                <div className="flex-1 min-w-[160px]">
                  <div className="text-sm font-medium">{r.material.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    estimasi {fmtQty(expected)} {r.material.usage_unit}
                    {r.lastOpnameAt == null && " · belum pernah opname"}
                  </div>
                </div>
                <input
                  value={raw}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [r.material.id]: e.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="fisik"
                  className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
                />
                <span className="text-[11px] text-muted-foreground w-10">
                  {r.material.usage_unit}
                </span>
                <span
                  className={`w-24 text-right text-[11px] tabular-nums font-semibold ${
                    diff == null
                      ? "text-muted-foreground"
                      : Math.abs(diff) < 1e-6
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {diff == null
                    ? "—"
                    : `${diff > 0 ? "+" : ""}${fmtQty(diff)}`}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      <div className="sticky bottom-0 rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard space-y-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan opname (opsional)"
          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filled.length} bahan diisi
            {diffs.count > 0 && (
              <>
                {" · "}
                <span className="text-destructive font-semibold">
                  {diffs.count} selisih
                </span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || filled.length === 0}
            className="ml-auto h-10 px-4 rounded-xl border-2 border-foreground bg-primary text-sm font-bold disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : "Simpan opname"}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card border-2 border-foreground shadow-hard p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning-foreground" />
              Ada selisih
            </h2>
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{diffs.count} bahan</b> berbeda dari
              estimasi sistem. Selisih ini wajar kalau pemakaian harian belum
              akurat, ada susut, atau barang masuk belum tercatat.
            </p>
            <p className="text-sm tabular-nums">
              Nilai selisih ≈{" "}
              <b
                className={
                  diffs.value < 0 ? "text-destructive" : "text-success"
                }
              >
                {diffs.value.toLocaleString("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  maximumFractionDigits: 0,
                })}
              </b>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-10 px-3 rounded-lg border border-border text-sm text-muted-foreground"
              >
                Periksa lagi
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={pending}
                className="flex-1 h-10 rounded-lg bg-primary border-2 border-foreground text-sm font-bold disabled:opacity-60"
              >
                Ya, simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
