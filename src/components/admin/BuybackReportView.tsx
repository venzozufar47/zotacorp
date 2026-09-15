"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Sparkles } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/lib/investor/buyback-depreciation";
import type { BuybackReportDetail } from "@/lib/actions/yeobo-buyback.actions";
import { formatRp } from "@/lib/cashflow/format";

const fmtDate = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${ymd}T00:00:00+07:00`));

/** Laporan buyback beku — dibaca apa adanya dari `lines` jsonb, tidak
 *  pernah dihitung ulang di klien. */
export function BuybackReportView({ report }: { report: BuybackReportDetail }) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const { downloadBuybackPdf } = await import(
        "@/lib/investor/downloadBuybackPdf"
      );
      await downloadBuybackPdf(report);
    } catch (err) {
      console.error(err);
      toast.error("Gagal membuat PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 flex-1">
            <div>
              <dt className="text-[11px] text-muted-foreground">Dihitung s/d</dt>
              <dd className="font-semibold text-foreground">
                {fmtDate(report.asOfDate)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Nilai awal</dt>
              <dd className="font-mono font-semibold text-foreground">
                {formatRp(report.totalCostIdr)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">
                Nilai terdepresiasi
              </dt>
              <dd className="font-mono font-semibold text-primary">
                {formatRp(report.totalBookValueIdr)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">
                % dari nilai awal
              </dt>
              <dd className="font-mono font-semibold text-foreground">
                {report.totalCostIdr > 0
                  ? `${((report.totalBookValueIdr / report.totalCostIdr) * 100).toFixed(2)}%`
                  : "—"}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            disabled={downloading}
            onClick={download}
            className="press-feedback inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            {downloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Unduh PDF
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nilai sisa {report.residualPct}% · Umur ekonomis: Elektronik{" "}
          {report.lifeMonths.elektronik} bln, Perabot {report.lifeMonths.perabot}{" "}
          bln, Aksesoris {report.lifeMonths.aksesoris} bln
        </p>
        {report.note && (
          <p className="mt-2 text-sm text-foreground">{report.note}</p>
        )}
        {report.lines.some((l) => l.overrideSource) && (
          <p className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Sparkles size={11} className="text-amber-600 shrink-0" />
            Aset bertanda &ldquo;Disesuaikan manual&rdquo; nilainya diganti dari
            riset pasar (bukan formula garis lurus). Aset lain tetap pakai
            formula garis lurus — catatan di bawah namanya adalah dokumentasi
            kenapa formula dipertahankan, bukan perubahan nilai.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="text-sm font-bold text-foreground">
            Alokasi ke investor Tlogosari
          </span>
          <span className="ml-2 text-[11px] text-muted-foreground">
            100% nilai terdepresiasi, proporsional porsi modal — nama disamarkan
          </span>
        </div>
        {report.investorShares == null ? (
          <p className="px-4 py-4 text-sm text-muted-foreground italic">
            Laporan ini dibuat sebelum fitur alokasi investor ada — tidak
            tersedia.
          </p>
        ) : report.investorShares.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground italic">
            Tidak ada investor aktif tercatat untuk Tlogosari saat laporan ini
            diterbitkan.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-semibold">Investor</th>
                <th className="px-4 py-2 text-right font-semibold">Porsi modal</th>
                <th className="px-4 py-2 text-right font-semibold">
                  Nilai buyback
                </th>
              </tr>
            </thead>
            <tbody>
              {report.investorShares.map((s) => (
                <tr key={s.label} className="border-t border-border/60">
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {s.label}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {s.pct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-primary">
                    {formatRp(s.amountIdr)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30 font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {report.investorShares
                    .reduce((s, x) => s + x.pct, 0)
                    .toFixed(2)}
                  %
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-primary">
                  {formatRp(
                    report.investorShares.reduce((s, x) => s + x.amountIdr, 0)
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const rows = report.lines.filter((l) => l.category === cat);
        if (rows.length === 0) return null;
        const subtotal = report.subtotals.find((s) => s.category === cat);
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
                    <th className="px-4 py-2 text-right font-semibold">
                      Nilai awal
                    </th>
                    <th className="px-4 py-2 text-left font-semibold">Tgl beli</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Bulan jalan
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Nilai terdepresiasi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="border-t border-border/60">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {l.name}
                        {l.isOverridden && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold align-middle">
                            <Sparkles size={10} className="shrink-0" /> Disesuaikan manual
                          </span>
                        )}
                        {l.overrideSource && (
                          <p className="text-[10.5px] font-normal text-muted-foreground mt-0.5">
                            {l.overrideSource}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {l.qty} {l.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                        {formatRp(l.totalIdr)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {fmtDate(l.purchaseDate)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {l.elapsedMonths}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-primary">
                        {formatRp(l.bookValueIdr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <td className="px-4 py-2" colSpan={2}>
                      Subtotal
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {subtotal ? formatRp(subtotal.totalCostIdr) : "—"}
                    </td>
                    <td className="px-4 py-2" colSpan={2} />
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-primary">
                      {subtotal ? formatRp(subtotal.totalBookValueIdr) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
