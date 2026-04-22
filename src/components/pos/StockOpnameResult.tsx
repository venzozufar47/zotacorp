import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import type { StockOpnameDetail } from "@/lib/actions/pos-stock.actions";

interface Props {
  detail: StockOpnameDetail;
}

export function StockOpnameResult({ detail }: Props) {
  const { summary, items, notes } = detail;
  const totalColor =
    summary.totalDiffValue < 0
      ? "text-destructive"
      : summary.totalDiffValue > 0
      ? "text-success"
      : "text-foreground";

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <header>
        <Link
          href="/pos/stok"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={12} /> Kembali ke Stok
        </Link>
        <h1 className="font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck size={16} /> Hasil Opname
        </h1>
        <p className="text-xs text-muted-foreground tabular-nums">
          {summary.opnameDate}
          {summary.opnameTime ? ` · ${summary.opnameTime}` : ""} · {summary.itemCount} SKU
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Total selisih nilai
        </p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${totalColor}`}>
          {summary.totalDiffValue === 0
            ? "—"
            : (summary.totalDiffValue > 0 ? "+" : "") + formatRp(summary.totalDiffValue)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
          Selisih qty {summary.totalDiffQty > 0 ? "+" : ""}
          {summary.totalDiffQty}
        </p>
      </div>

      {notes && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-foreground">
          <span className="font-medium">Catatan: </span>
          {notes}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">SKU</th>
              <th className="text-right font-medium px-2 py-2">Fisik</th>
              <th className="text-right font-medium px-2 py-2">Seharusnya</th>
              <th className="text-right font-medium px-3 py-2">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const diffColor =
                it.diffValue < 0
                  ? "text-destructive"
                  : it.diffValue > 0
                  ? "text-success"
                  : "text-muted-foreground";
              return (
                <tr
                  key={`${it.productId}-${it.variantId ?? "-"}`}
                  className="border-t border-border"
                >
                  <td className="px-3 py-2 text-foreground">
                    <p className="truncate">{it.productName}</p>
                    {it.variantName && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {it.variantName}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {it.physicalCount}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {it.expectedCount}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${diffColor}`}>
                    <p className="font-medium">
                      {it.diffQty > 0 ? "+" : ""}
                      {it.diffQty}
                    </p>
                    {it.diffValue !== 0 && (
                      <p className="text-[11px]">
                        {(it.diffValue > 0 ? "+" : "") + formatRp(it.diffValue)}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground italic text-center">
        Opname immutable — tidak bisa di-edit setelah submit.
      </p>
    </div>
  );
}
