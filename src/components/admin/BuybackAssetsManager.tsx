"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  upsertBuybackAsset,
  deleteBuybackAsset,
  publishBuybackReport,
  deleteBuybackReport,
  type BuybackAsset,
  type BuybackReportSummary,
} from "@/lib/actions/yeobo-buyback.actions";
import {
  computeBuybackReport,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DEFAULT_LIFE_MONTHS,
  DEFAULT_RESIDUAL_PCT,
  type BuybackCategory,
} from "@/lib/investor/buyback-depreciation";
import { formatRp } from "@/lib/cashflow/format";

const fmtDate = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${ymd}T00:00:00+07:00`));

interface AssetDraft {
  id?: string;
  name: string;
  qty: string;
  unit: string;
  unitPriceIdr: string;
  totalIdr: string;
  purchaseDate: string;
  category: BuybackCategory;
  sortOrder: number;
  notes: string;
  overrideValueIdr: string;
  overrideSource: string;
}

/**
 * Kelola aset bergerak Tlogosari + terbitkan laporan buyback beku.
 *
 * Ringkasan/preview di bagian atas dihitung LIVE di klien (murni untuk
 * enaknya admin bereksperimen dengan tanggal/umur ekonomis sebelum
 * menerbitkan) — tapi begitu "Terbitkan laporan" ditekan, server
 * menghitung ULANG dari baris master (lihat `publishBuybackReport`),
 * jadi preview di sini tidak pernah jadi sumber kebenaran laporan.
 */
export function BuybackAssetsManager({
  assets,
  reports,
}: {
  assets: BuybackAsset[];
  reports: BuybackReportSummary[];
}) {
  const [draft, setDraft] = useState<AssetDraft | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [asOfDate, setAsOfDate] = useState("");
  const [residualPct, setResidualPct] = useState(DEFAULT_RESIDUAL_PCT);
  const [lifeMonths, setLifeMonths] =
    useState<Record<BuybackCategory, number>>({ ...DEFAULT_LIFE_MONTHS });
  const [reportTitle, setReportTitle] = useState("");
  const [reportNote, setReportNote] = useState("");

  const computed = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) return null;
    // Jaga preview dari "Rp NaN" kalau admin sempat mengosongkan/menaruh 0
    // di salah satu input umur ekonomis (pembagi di rumus book value) —
    // publishBuybackReport tetap menolaknya sendiri di server terlepas
    // dari ini, jadi ini murni kosmetik supaya preview tidak berantakan.
    const lifeMonthsValid = CATEGORY_ORDER.every(
      (cat) => Number.isFinite(lifeMonths[cat]) && lifeMonths[cat] > 0
    );
    if (!lifeMonthsValid || !Number.isFinite(residualPct)) return null;
    return computeBuybackReport(
      assets.map((a) => ({
        id: a.id,
        name: a.name,
        qty: a.qty,
        unit: a.unit,
        unitPriceIdr: a.unitPriceIdr,
        totalIdr: a.totalIdr,
        purchaseDate: a.purchaseDate,
        category: a.category,
        sortOrder: a.sortOrder,
        notes: a.notes,
        overrideValueIdr: a.overrideValueIdr,
        overrideSource: a.overrideSource,
      })),
      { asOfDate, residualPct, lifeMonths }
    );
  }, [assets, asOfDate, residualPct, lifeMonths]);

  const lineByAssetId = useMemo(() => {
    const map = new Map<
      string,
      { elapsedMonths: number; bookValueIdr: number; isOverridden: boolean }
    >();
    computed?.lines.forEach((l) => map.set(l.id, l));
    return map;
  }, [computed]);

  const saveAsset = () => {
    if (!draft) return;
    const qty = Number(draft.qty);
    const unitPriceIdr = Number(draft.unitPriceIdr);
    const totalIdr = Number(draft.totalIdr);
    const overrideValueIdr =
      draft.overrideValueIdr.trim() === "" ? null : Number(draft.overrideValueIdr);
    startTransition(async () => {
      const res = await upsertBuybackAsset({
        id: draft.id,
        name: draft.name,
        qty,
        unit: draft.unit,
        unitPriceIdr,
        totalIdr,
        purchaseDate: draft.purchaseDate,
        category: draft.category,
        sortOrder: draft.sortOrder,
        notes: draft.notes,
        overrideValueIdr,
        overrideSource: draft.overrideSource,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Aset tersimpan");
      setDraft(null);
      router.refresh();
    });
  };

  /** Draft aset baru, ditaruh di akhir kategorinya (bukan sort_order=0)
   *  supaya tidak bentrok/menyalip urutan aset yang sudah ada. */
  const newAssetDraft = (category: BuybackCategory): AssetDraft => {
    const maxInCategory = assets
      .filter((a) => a.category === category)
      .reduce((m, a) => Math.max(m, a.sortOrder), 0);
    return {
      name: "",
      qty: "1",
      unit: "unit",
      unitPriceIdr: "",
      totalIdr: "",
      purchaseDate: "",
      category,
      sortOrder: maxInCategory + 1,
      notes: "",
      overrideValueIdr: "",
      overrideSource: "",
    };
  };

  const removeAsset = (a: BuybackAsset) => {
    if (!confirm(`Hapus aset "${a.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteBuybackAsset(a.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Aset dihapus");
      router.refresh();
    });
  };

  const publish = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      toast.error('Isi tanggal "dihitung s/d" dulu');
      return;
    }
    if (!computed) {
      toast.error("Nilai sisa (%) atau umur ekonomis belum valid");
      return;
    }
    if (!reportTitle.trim()) {
      toast.error("Isi judul laporan dulu");
      return;
    }
    startTransition(async () => {
      const res = await publishBuybackReport({
        title: reportTitle,
        asOfDate,
        residualPct,
        lifeMonths,
        note: reportNote,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Laporan diterbitkan");
      router.push(`/admin/investors/buyback/laporan/${res.data!.id}`);
    });
  };

  const removeReport = (r: BuybackReportSummary) => {
    if (!confirm(`Hapus laporan "${r.title}"?`)) return;
    startTransition(async () => {
      const res = await deleteBuybackReport(r.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Laporan dihapus");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Kebijakan depresiasi + ringkasan live + terbitkan */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-foreground">
          Kebijakan depresiasi &amp; terbitkan laporan
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Dihitung s/d tanggal
            </span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Nilai sisa (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={residualPct}
              onChange={(e) => setResidualPct(Number(e.target.value))}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
            />
          </label>
          {CATEGORY_ORDER.map((cat) => (
            <label className="block" key={cat}>
              <span className="text-xs font-semibold text-muted-foreground">
                Umur ekonomis — {CATEGORY_LABELS[cat]} (bulan)
              </span>
              <input
                type="number"
                min={1}
                value={lifeMonths[cat]}
                onChange={(e) =>
                  setLifeMonths({ ...lifeMonths, [cat]: Number(e.target.value) })
                }
                className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
              />
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-[11px] text-muted-foreground">Nilai awal (total)</p>
            <p className="mt-0.5 font-mono font-semibold text-foreground">
              {computed ? formatRp(computed.totalCostIdr) : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-[11px] text-muted-foreground">Nilai terdepresiasi</p>
            <p className="mt-0.5 font-mono font-semibold text-primary">
              {computed ? formatRp(computed.totalBookValueIdr) : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-[11px] text-muted-foreground">% dari nilai awal</p>
            <p className="mt-0.5 font-mono font-semibold text-foreground">
              {computed && computed.totalCostIdr > 0
                ? `${((computed.totalBookValueIdr / computed.totalCostIdr) * 100).toFixed(2)}%`
                : "—"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Judul laporan
            </span>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="Buyback Aset Tlogosari — September 2026"
              className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Catatan (opsional)
            </span>
            <input
              type="text"
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={publish}
          className="press-feedback inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Terbitkan laporan
        </button>
        <p className="text-[11px] text-muted-foreground">
          Menerbitkan membekukan snapshot (tanggal + semua nilai saat ini) —
          mengedit aset di bawah setelahnya tidak mengubah laporan yang sudah
          terbit.
        </p>
      </div>

      {/* 2. Daftar aset master */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Daftar aset</h3>
          {!draft && (
            <button
              type="button"
              onClick={() => setDraft(newAssetDraft("elektronik"))}
              className="press-feedback inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
            >
              <Plus size={14} /> Aset baru
            </button>
          )}
        </div>

        {draft && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-foreground">
                {draft.id ? "Ubah aset" : "Aset baru"}
              </h4>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-muted-foreground hover:text-foreground p-1"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Nama aset
                </span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Qty</span>
                <input
                  type="number"
                  value={draft.qty}
                  onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  Satuan
                </span>
                <input
                  type="text"
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  Harga/unit (Rp)
                </span>
                <input
                  type="number"
                  value={draft.unitPriceIdr}
                  onChange={(e) => setDraft({ ...draft, unitPriceIdr: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  Nilai total (Rp)
                </span>
                <input
                  type="number"
                  value={draft.totalIdr}
                  onChange={(e) => setDraft({ ...draft, totalIdr: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                />
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  Biasanya qty × harga/unit, tapi boleh disesuaikan kalau beda
                  dengan catatan pembelian asli.
                </p>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  Tanggal beli
                </span>
                <input
                  type="date"
                  value={draft.purchaseDate}
                  onChange={(e) => setDraft({ ...draft, purchaseDate: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  Kategori
                </span>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as BuybackCategory })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                >
                  {CATEGORY_ORDER.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Catatan (opsional)
                </span>
                <input
                  type="text"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                />
              </label>
            </div>

            <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Sparkles size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Override nilai manual (opsional)
                  </p>
                  <p className="text-[10.5px] text-muted-foreground">
                    Isi kalau formula garis lurus tidak realistis utk aset ini
                    (mis. kamera/printer yang harga pasar second-nya tidak
                    ikut kurva depresiasi linear). Kalau diisi, nilai ini
                    MENGGANTIKAN hasil formula di ringkasan &amp; laporan —
                    aset lain tetap pakai formula seperti biasa.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Nilai override (Rp)
                  </span>
                  <input
                    type="number"
                    value={draft.overrideValueIdr}
                    onChange={(e) =>
                      setDraft({ ...draft, overrideValueIdr: e.target.value })
                    }
                    placeholder="Kosongkan utk pakai formula"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Sumber / justifikasi
                  </span>
                  <input
                    type="text"
                    value={draft.overrideSource}
                    onChange={(e) =>
                      setDraft({ ...draft, overrideSource: e.target.value })
                    }
                    placeholder="Riset pasar + link marketplace, atau alasan lain"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="flex-1 sm:flex-none h-10 px-4 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={saveAsset}
                className="flex-1 sm:flex-none h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                Simpan
              </button>
            </div>
          </div>
        )}

        {CATEGORY_ORDER.map((cat) => {
          const rows = assets.filter((a) => a.category === cat);
          if (rows.length === 0) return null;
          const subtotal = computed?.subtotals.find((s) => s.category === cat);
          return (
            <div
              key={cat}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-sm font-bold text-foreground">
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 text-left font-semibold">Nama</th>
                      <th className="px-4 py-2 text-right font-semibold">Qty</th>
                      <th className="px-4 py-2 text-right font-semibold">Harga/unit</th>
                      <th className="px-4 py-2 text-right font-semibold">Nilai awal</th>
                      <th className="px-4 py-2 text-left font-semibold">Tgl beli</th>
                      <th className="px-4 py-2 text-right font-semibold">Bulan jalan</th>
                      <th className="px-4 py-2 text-left font-semibold">
                        Dasar nilai
                      </th>
                      <th className="px-4 py-2 text-right font-semibold">
                        Nilai terdepresiasi
                      </th>
                      <th className="px-4 py-2 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const line = lineByAssetId.get(a.id);
                      return (
                        <tr key={a.id} className="border-t border-border/60">
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-foreground">{a.name}</span>
                            {a.notes && (
                              <p className="text-[10.5px] text-muted-foreground">
                                {a.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            {a.qty} {a.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {formatRp(a.unitPriceIdr)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                            {formatRp(a.totalIdr)}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {fmtDate(a.purchaseDate)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            {line ? line.elapsedMonths : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {a.overrideValueIdr != null ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold"
                                title={a.overrideSource ?? undefined}
                              >
                                <Sparkles size={10} className="shrink-0" /> Override manual
                              </span>
                            ) : a.overrideSource ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium"
                                title={a.overrideSource}
                              >
                                Formula (dicek)
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                Formula
                              </span>
                            )}
                            {a.overrideSource && (
                              <p className="text-[10px] text-muted-foreground mt-1 max-w-[280px]">
                                {a.overrideSource}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-primary">
                            {line ? formatRp(line.bookValueIdr) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    id: a.id,
                                    name: a.name,
                                    qty: String(a.qty),
                                    unit: a.unit,
                                    unitPriceIdr: String(a.unitPriceIdr),
                                    totalIdr: String(a.totalIdr),
                                    purchaseDate: a.purchaseDate,
                                    category: a.category,
                                    sortOrder: a.sortOrder,
                                    notes: a.notes ?? "",
                                    overrideValueIdr:
                                      a.overrideValueIdr == null
                                        ? ""
                                        : String(a.overrideValueIdr),
                                    overrideSource: a.overrideSource ?? "",
                                  })
                                }
                                className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Ubah"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeAsset(a)}
                                className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label="Hapus"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 font-semibold">
                      <td className="px-4 py-2" colSpan={3}>
                        Subtotal
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {subtotal ? formatRp(subtotal.totalCostIdr) : "—"}
                      </td>
                      <td className="px-4 py-2" colSpan={3} />
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-primary">
                        {subtotal ? formatRp(subtotal.totalBookValueIdr) : "—"}
                      </td>
                      <td className="px-4 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}

        {assets.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Belum ada aset.</p>
        )}
      </div>

      {/* 3. Riwayat laporan */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Riwayat laporan</h3>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Belum ada laporan yang diterbitkan.
          </p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/investors/buyback/laporan/${r.id}`}
                    className="font-semibold text-foreground hover:text-primary inline-flex items-center gap-1.5"
                  >
                    <FileText size={14} /> {r.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                    <CalendarDays size={12} /> Dihitung s/d {fmtDate(r.asOfDate)} ·{" "}
                    {formatRp(r.totalBookValueIdr)} dari {formatRp(r.totalCostIdr)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeReport(r)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
                  aria-label="Hapus laporan"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
