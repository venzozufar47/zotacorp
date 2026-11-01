import type { ReadyCakeItem } from "@/lib/actions/pos-ready-cake.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";

export interface ReadyCakeSummary {
  /** Stok resmi (sudah memperhitungkan opname dan penarikan). */
  regular: number;
  diy: number;
  items: ReadyCakeItem[];
}

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** Umur kue sejak siap, dalam hari kalender WIB. */
function ageLabel(readyAtIso: string, todayWib: string): string {
  const days = Math.round(
    (Date.parse(`${todayWib}T00:00:00Z`) - Date.parse(`${jakartaDateString(new Date(readyAtIso))}T00:00:00Z`)) / 86_400_000
  );
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  return `${days} hari lalu`;
}

/**
 * Panel "Ready Cake" di atas grid produk POS: berapa kue ready yang tersedia dan daftar tiap kue (nama, harga, umur).
 * Kue dijual lewat tab Pesanan (serah terima), bukan keranjang, jadi panel ini hanya informasi untuk kasir.
 */
export function ReadyCakePanel({ summary }: { summary: ReadyCakeSummary }) {
  const total = summary.regular + summary.diy;
  const todayWib = jakartaDateString(new Date());
  return (
    <div className="mx-3 mt-3 rounded-2xl border-2 border-foreground bg-card px-3 py-2 shadow-[3px_3px_0_0_var(--foreground)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ready Cake</p>
        <p className="text-xs text-muted-foreground">
          <span className={`font-display text-lg font-extrabold tabular-nums ${total > 0 ? "text-foreground" : "text-destructive"}`}>
            {total}
          </span>{" "}
          tersedia
          {summary.diy > 0 ? <span> · {summary.diy} DIY</span> : null}
        </p>
      </div>
      {summary.items.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {summary.items.map((it) => (
            <li
              key={it.id}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground"
            >
              <span className="font-semibold">{it.name}</span>
              {it.isDiy ? <span className="ml-1 text-primary">DIY</span> : null}
              <span className="ml-1 tabular-nums text-muted-foreground">
                {rupiah(it.priceIdr)} · {ageLabel(it.readyAt, todayWib)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Belum ada ready cake. Kue masuk otomatis setelah baker dan cake artist menyelesaikannya.
        </p>
      )}
    </div>
  );
}
