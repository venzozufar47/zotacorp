import type { ServiceLevelWorstSku } from "@/lib/pos/service-level";

const pct = (v: number) =>
  `${(v * 100).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * "Penyebab terbesar": kontribusi tiap produk terhadap angka yang hilang. Angka di kanan = bagian dari 100% yang hilang
 * karena produk itu kosong, jadi seluruhnya dijumlah = 100% − service level. Produk di luar daftar digabung "Lainnya".
 * `lostShare` = lostSkuHours ÷ totalSkuSamples dari hasil yang sama.
 */
export function ServiceLevelCauses({
  skus,
  lostShare,
  limit,
  slim = false,
}: {
  skus: ServiceLevelWorstSku[];
  lostShare: number;
  limit: number;
  /** Bar lebih tipis (panel superadmin). */
  slim?: boolean;
}) {
  const shown = skus.slice(0, limit);
  const others = Math.max(0, lostShare - shown.reduce((n, w) => n + w.share, 0));
  const max = Math.max(shown[0]?.share ?? 0, others, 0.0001);
  const rows = [
    ...shown.map((w) => ({
      key: `${w.productId}|${w.variantId ?? ""}`,
      label: w.label,
      share: w.share,
      hint: `${w.label}: kosong ${(w.percentOut * 100).toFixed(0)}% dari waktu dinilai`,
    })),
    ...(others >= 0.0005
      ? [{ key: "lainnya", label: "Lainnya", share: others, hint: "Produk lain di luar daftar" }]
      : []),
  ];
  return (
    <>
      <ul className={slim ? "space-y-1.5" : "mt-3 space-y-2"}>
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 text-xs" title={r.hint}>
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span
              className={`${slim ? "h-2" : "h-2.5"} w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-40`}
              role="img"
              aria-label={`${r.label} menghilangkan ${pct(r.share)}`}
            >
              <span
                className="block h-full rounded-full bg-destructive"
                style={{ width: `${Math.max(2, (r.share / max) * 100)}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-bold tabular-nums text-destructive">{pct(r.share)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] font-semibold tabular-nums text-muted-foreground">
        <span>Total hilang = 100% − service level {pct(1 - lostShare)}</span>
        <span className="text-destructive">{pct(lostShare)}</span>
      </p>
    </>
  );
}
