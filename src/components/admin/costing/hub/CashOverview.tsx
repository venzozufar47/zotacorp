import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import type { CashPosition } from "@/lib/actions/procurement-wallet.actions";
import type { ShopeeWallet } from "@/lib/actions/procurement-shopee.actions";
import { ShopeeWalletCard } from "@/components/procurement/ShopeeWalletCard";
import { shortBrand } from "./HubHeader";

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

/**
 * Kas pengadaan per cabang dalam satu baris tiga kolom: uang pengadaan, laci kasir, dan saldo
 * belanja online (Shopee/Seabank). Penjelasan hitungan ada di tooltip, bukan paragraf.
 */
export function CashOverview({ positions, wallets }: { positions: CashPosition[]; wallets: ShopeeWallet[] }) {
  const units = [...new Set([...positions.map((p) => p.businessUnit), ...wallets.map((w) => w.businessUnit)])].sort();
  return (
    <div className="space-y-4">
      {units.map((bu) => {
        const p = positions.find((x) => x.businessUnit === bu);
        const w = wallets.find((x) => x.businessUnit === bu);
        return (
          <section key={bu} className="space-y-1.5">
            {units.length > 1 && <h3 className="px-0.5 text-xs font-semibold text-muted-foreground">{shortBrand(bu)}</h3>}
            <div className="grid gap-3 lg:grid-cols-3">
              {p ? <ProcurementTile p={p} /> : <Empty />}
              {p ? <DrawerTile p={p} /> : <Empty />}
              {w ? <ShopeeWalletCard wallet={w} compact /> : <Empty />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Empty() {
  return <div className="hidden rounded-xl border border-dashed border-border lg:block" />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function ProcurementTile({ p }: { p: CashPosition }) {
  const bal = p.procurementBalance;
  const negative = bal !== null && bal < 0;
  const d = p.drawer;
  return (
    <div className={cn("rounded-xl border p-3", negative ? "border-destructive/60 bg-destructive/5" : "border-border bg-card")}>
      <Label>Uang pengadaan</Label>
      {bal !== null ? (
        <p className={cn("mt-0.5 font-display text-xl font-bold tabular-nums", negative && "text-destructive")}>{formatRp(bal)}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Belum bisa dihitung</p>
      )}
      {p.bookBalance !== null && d.balance !== null && (
        <p
          className="mt-1 text-xs tabular-nums text-muted-foreground"
          title="Uang pengadaan = saldo buku kas (Keuangan) − isi laci. Uang yang diambil pemilik dicatat sebagai kategori Dividend dan ikut mengurangi buku."
        >
          Buku {formatRp(p.bookBalance)} − laci {formatRp(d.balance)}
        </p>
      )}
      {p.lastWithdrawal && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Diambil dari laci {formatRp(p.lastWithdrawal.amount)} · {timeLabel(p.lastWithdrawal.at)}
        </p>
      )}
      {negative && (
        <p className="mt-1.5 text-xs font-semibold text-destructive">
          Negatif: isi laci melebihi saldo buku. Periksa pemasukan tunai yang belum dibukukan atau pengeluaran ganda.
        </p>
      )}
    </div>
  );
}

function DrawerTile({ p }: { p: CashPosition }) {
  const d = p.drawer;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <Label>Laci kasir</Label>
      {d.balance !== null ? (
        <>
          <p className="mt-0.5 font-display text-xl font-bold tabular-nums">{formatRp(d.balance)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.state === "open"
              ? `Shift berjalan${d.cashierName ? ` · ${d.cashierName}` : ""}`
              : `Setelah tutup shift${d.sinceIso ? ` · ${timeLabel(d.sinceIso)}` : ""}`}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            Modal {formatRp(d.float)}
            {d.excess !== null && d.excess > 0 && (
              <span className="font-semibold text-warning"> · kelebihan {formatRp(d.excess)}</span>
            )}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Belum ada hitungan tutup shift</p>
      )}
    </div>
  );
}
