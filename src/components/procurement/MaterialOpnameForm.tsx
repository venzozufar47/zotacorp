"use client";

/**
 * Form opname bahan baku. Isi jumlah fisik per bahan (dalam satuan beli ATAU satuan pakai: 2,5 pack lebih cepat dan
 * lebih sedikit salah daripada 1250 gram), sistem menampilkan estimasinya, dan selisih dinilai terhadap TOLERANSI
 * kategori bahan (lihat cycle-count.ts): di dalam toleransi = wajar, di luar = wajib memilih alasan.
 *
 * Opname adalah SATU-SATUNYA kebenaran stok di model ini — di antara dua opname semuanya estimasi. Form ini tidak
 * memaksa mengisi semua bahan: yang dikosongkan sekadar tidak ikut dihitung ulang. Mode "hari ini" menampilkan
 * daftar yang disusun sistem (urut prioritas, dengan progres) dan bukan pengelompokan per kategori.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check } from "lucide-react";
import { parseDecimalId } from "@/components/admin/costing/fields";
import { submitMaterialOpname } from "@/lib/actions/procurement.actions";
import type { ProcurementRow } from "@/lib/procurement/rows";
import {
  VARIANCE_REASONS,
  varianceCheck,
  type AbcClass,
  type CountReason,
  type VarianceReason,
} from "@/lib/procurement/cycle-count";
import { cn } from "@/lib/utils";

export interface CountMeta {
  cls: AbcClass;
  /** Kelas sementara (bahan baru belum punya data pemakaian). */
  provisional?: boolean;
  reasons: CountReason[];
  done: boolean;
}

const REASON_LABEL: Record<CountReason, string> = {
  harian: "Harian",
  hitung_ulang: "Hitung ulang",
  hampir_habis: "Hampir habis",
  jatuh_tempo: "Jatuh tempo",
  belum_pernah: "Hitungan pertama",
};

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

type UnitSel = "usage" | "purchase";

/** Kemasan berisi lebih dari 1 satuan pakai → hitung per kemasan (lebih cepat); selain itu per satuan pakai. */
function defaultUnit(r: ProcurementRow): UnitSel {
  const m = r.material;
  return m.purchase_unit.trim().toLowerCase() !== m.usage_unit.trim().toLowerCase() && m.content_per_purchase > 1
    ? "purchase"
    : "usage";
}

export function MaterialOpnameForm({
  businessUnit,
  rows,
  meta,
}: {
  businessUnit: string;
  rows: ProcurementRow[];
  /** Ada = mode "Opname hari ini": daftar urut prioritas + progres. Tidak ada = semua bahan per kategori. */
  meta?: Record<string, CountMeta>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [unitSel, setUnitSel] = useState<Record<string, UnitSel>>({});
  const [reasons, setReasons] = useState<Record<string, VarianceReason>>({});
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const unitOf = (r: ProcurementRow): UnitSel => unitSel[r.material.id] ?? defaultUnit(r);
  const factorOf = (r: ProcurementRow): number => (unitOf(r) === "purchase" ? r.material.content_per_purchase : 1);

  /** Hanya baris berisi ANGKA valid, sudah dikonversi ke satuan pakai. Jangan `?? 0`: "abc" tercatat 0 = stok terhapus. */
  const filled = useMemo(() => {
    const out: { row: ProcurementRow; qty: number }[] = [];
    for (const r of rows) {
      const raw = draft[r.material.id];
      if (raw === undefined || raw.trim() === "") continue;
      const n = parseDecimalId(raw);
      if (n == null || !Number.isFinite(n) || n < 0) continue;
      const sel = unitSel[r.material.id] ?? defaultUnit(r);
      out.push({ row: r, qty: n * (sel === "purchase" ? r.material.content_per_purchase : 1) });
    }
    return out;
  }, [rows, draft, unitSel]);

  const invalidCount = useMemo(
    () =>
      rows.filter((r) => {
        const raw = draft[r.material.id];
        if (raw === undefined || raw.trim() === "") return false;
        const n = parseDecimalId(raw);
        return n == null || !Number.isFinite(n) || n < 0;
      }).length,
    [rows, draft]
  );

  /** Penilaian selisih per bahan yang punya baseline (hitungan pertama tak punya pembanding). */
  const verdicts = useMemo(() => {
    const m = new Map<string, ReturnType<typeof varianceCheck>>();
    for (const f of filled) {
      if (f.row.metrics.onHandRaw == null || f.row.lastOpnameAt == null) continue;
      m.set(
        f.row.material.id,
        varianceCheck({
          category: f.row.material.category,
          expected: f.row.metrics.onHandRaw,
          physical: f.qty,
          unitCost: f.row.metrics.unitCost,
        })
      );
    }
    return m;
  }, [filled]);

  const outRows = useMemo(() => filled.filter((f) => verdicts.get(f.row.material.id)?.outOfTolerance), [filled, verdicts]);
  const missingReasons = outRows.filter((f) => !reasons[f.row.material.id]).length;
  const outValue = outRows.reduce((s, f) => s + (verdicts.get(f.row.material.id)?.value ?? 0), 0);

  function commit() {
    if (filled.length === 0) {
      toast.error("Isi minimal satu bahan");
      return;
    }
    startTransition(async () => {
      const res = await submitMaterialOpname({
        businessUnit,
        items: filled.map((f) => ({ materialId: f.row.material.id, physicalQty: f.qty })),
        notes: notes.trim() || null,
        reasons,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const out = res.data?.outOfTolerance ?? 0;
      toast.success(out > 0 ? `Opname tersimpan, ${out} bahan di atas toleransi` : "Opname tersimpan");
      setConfirmOpen(false);
      router.push(`/pengadaan?tab=stok&bu=${encodeURIComponent(businessUnit)}`);
      router.refresh();
    });
  }

  function onSubmit() {
    if (invalidCount > 0) return toast.error(`${invalidCount} isian bukan angka yang valid`);
    if (missingReasons > 0) return toast.error(`Pilih alasan selisih untuk ${missingReasons} bahan yang ditandai merah`);
    if (outRows.length > 0) return setConfirmOpen(true);
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

  const todayMode = !!meta;
  const doneCount = todayMode ? rows.filter((r) => meta[r.material.id]?.done || filled.some((f) => f.row.material.id === r.material.id)).length : 0;

  function renderRow(r: ProcurementRow) {
    const id = r.material.id;
    const raw = draft[id] ?? "";
    const sel = unitOf(r);
    const factor = factorOf(r);
    const entered = raw.trim() === "" ? null : parseDecimalId(raw);
    const qtyUsage = entered != null ? entered * factor : null;
    const hasBaseline = r.metrics.onHandRaw != null && r.lastOpnameAt != null;
    const expectedUsage = r.metrics.onHandRaw;
    const v = verdicts.get(id);
    const m = meta?.[id];
    const canSwitch =
      r.material.purchase_unit.trim().toLowerCase() !== r.material.usage_unit.trim().toLowerCase() && r.material.content_per_purchase > 0;
    const unitLabel = sel === "purchase" ? r.material.purchase_unit : r.material.usage_unit;
    return (
      <div
        key={id}
        className={cn(
          "space-y-2 rounded-xl border bg-background/40 px-3 py-2",
          v?.outOfTolerance ? "border-destructive/60" : m?.done ? "border-success/50" : "border-border"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[150px] flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {r.material.name}
              {m && (
                <span
                  className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                  title={m.provisional ? "Kelas sementara: bahan baru, belum ada data pemakaian" : "Kelas otomatis dari biaya pemakaian"}
                >
                  {m.cls}
                  {m.provisional ? "*" : ""}
                </span>
              )}
              {m?.done && <Check size={14} className="text-success" aria-label="Sudah dihitung hari ini" />}
            </div>
            <div className="text-[11px] tabular-nums text-muted-foreground">
              {hasBaseline ? (
                <>
                  estimasi {fmtQty(expectedUsage != null ? expectedUsage / factor : null)} {unitLabel}
                </>
              ) : (
                "belum ada hitungan sebelumnya · angkamu jadi patokan"
              )}
            </div>
            {m && m.reasons.length > 0 && !m.done && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {m.reasons.map((x) => (
                  <span
                    key={x}
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      x === "hitung_ulang" || x === "hampir_habis" ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {REASON_LABEL[x]}
                  </span>
                ))}
              </div>
            )}
          </div>
          <input
            value={raw}
            onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
            inputMode="decimal"
            placeholder="fisik"
            aria-label={`Jumlah fisik ${r.material.name}`}
            aria-invalid={raw.trim() !== "" && entered == null}
            className={cn(
              "h-10 w-24 rounded-lg border bg-background px-2 text-base tabular-nums md:h-9 md:text-sm",
              raw.trim() !== "" && entered == null ? "border-2 border-destructive" : "border-border"
            )}
          />
          {canSwitch ? (
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-[11px] font-semibold">
              {(["purchase", "usage"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitSel((s) => ({ ...s, [id]: u }))}
                  className={cn("px-2 py-1.5", sel === u ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {u === "purchase" ? r.material.purchase_unit : r.material.usage_unit}
                </button>
              ))}
            </div>
          ) : (
            <span className="w-10 text-[11px] text-muted-foreground">{r.material.usage_unit}</span>
          )}
          <span
            className={cn(
              "w-24 text-right text-[11px] font-semibold tabular-nums",
              !v ? "text-muted-foreground" : v.outOfTolerance ? "text-destructive" : "text-success"
            )}
          >
            {!v || qtyUsage == null
              ? "—"
              : `${v.pct > 0 ? "+" : ""}${(v.pct * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%${v.outOfTolerance ? "" : " ✓"}`}
          </span>
        </div>
        {v?.outOfTolerance && (
          <div className="space-y-1.5">
            <p className="text-[11.5px] font-semibold text-destructive">
              Di atas toleransi {Math.round(v.tolerance * 100)}% ({v.value < 0 ? "−" : "+"}Rp {Math.round(Math.abs(v.value)).toLocaleString("id-ID")}). Hitung ulang
              bila ragu, lalu pilih penyebabnya:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIANCE_REASONS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => setReasons((s) => ({ ...s, [id]: x.key }))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
                    reasons[id] === x.key ? "border-foreground bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-2xl border-2 border-foreground bg-card p-3 text-xs text-muted-foreground shadow-hard-sm">
        {todayMode && (
          <p className="text-sm font-bold text-foreground">
            {doneCount}/{rows.length} bahan dihitung hari ini
          </p>
        )}
        <p>
          Isi jumlah <b className="text-foreground">fisik</b> hasil hitung (pilih satuan di sebelah kolom). &ldquo;Estimasi&rdquo; adalah tebakan sistem sejak
          hitungan terakhir. Tulis desimal dengan KOMA (2,5), titik hanya untuk ribuan (1.250). Persen di kanan = selisih terhadap estimasi; hijau = wajar (dalam toleransi kategori), merah = perlu alasan.
          {!todayMode && " Bahan yang dikosongkan tidak ikut diopname."}
        </p>
      </div>

      {todayMode ? (
        <div className="space-y-2">{rows.map((r) => renderRow(r))}</div>
      ) : (
        byCategory.map(([cat, list]) => (
          <div key={cat} className="space-y-2">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {cat}
              <span className="h-px flex-1 bg-border" />
            </h3>
            {list.map((r) => renderRow(r))}
          </div>
        ))
      )}

      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-20 space-y-2 rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard md:bottom-0">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan opname (opsional)"
          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filled.length} bahan diisi
            {outRows.length > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-destructive">{outRows.length} di atas toleransi</span>
              </>
            )}
            {missingReasons > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-destructive">{missingReasons} perlu alasan</span>
              </>
            )}
            {invalidCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-destructive">{invalidCount} isian tak valid</span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || filled.length === 0 || invalidCount > 0}
            className="ml-auto h-10 rounded-xl border-2 border-foreground bg-primary px-4 text-sm font-bold disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : "Simpan opname"}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard" onClick={(e) => e.stopPropagation()}>
            <h2 className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} className="text-warning" />
              Selisih di atas toleransi
            </h2>
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{outRows.length} bahan</b> melewati toleransi kategorinya dan owner akan mendapat pemberitahuan. Sudah yakin
              hitungannya benar?
            </p>
            <p className="text-sm tabular-nums">
              Nilai selisih ≈{" "}
              <b className={outValue < 0 ? "text-destructive" : "text-success"}>
                {outValue.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}
              </b>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="h-10 rounded-lg border border-border px-3 text-sm text-muted-foreground">
                Periksa lagi
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={pending}
                className="h-10 flex-1 rounded-lg border-2 border-foreground bg-primary text-sm font-bold disabled:opacity-60"
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
