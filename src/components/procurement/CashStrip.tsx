import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import type { CashPosition } from "@/lib/actions/procurement-wallet.actions";
import type { ShopeeWallet } from "@/lib/actions/procurement-shopee.actions";
import { walletName } from "@/lib/procurement/wallet-label";
import { ShopeeWalletCard } from "./ShopeeWalletCard";

/**
 * Posisi kas petugas dalam satu baris: uang pengadaan, laci kasir, dan saldo belanja online.
 * Rincian, riwayat tambah saldo, dan tombol "Tambah saldo" terbuka saat baris diketuk. Terbuka
 * otomatis bila ada saldo negatif.
 */
export function CashStrip({ position, wallet }: { position: CashPosition; wallet: ShopeeWallet | null }) {
  const proc = position.procurementBalance;
  const drawer = position.drawer.balance;
  const negative = (proc !== null && proc < 0) || (wallet != null && wallet.balance < 0);
  const cells: { label: string; value: number | null; bad?: boolean }[] = [
    { label: "Pengadaan", value: proc, bad: proc !== null && proc < 0 },
    { label: "Laci", value: drawer },
    ...(wallet ? [{ label: walletName(wallet.businessUnit), value: wallet.balance, bad: wallet.balance < 0 }] : []),
  ];
  return (
    <details open={negative} className="group rounded-xl border border-border bg-card">
      <summary className="list-none px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
          {cells.map((c) => (
            <span key={c.label} className="min-w-0">
              <span className="block text-[11px] text-muted-foreground">{c.label}</span>
              <span className={cn("block truncate text-[15px] font-bold tabular-nums", c.bad && "text-destructive")}>
                {c.value === null ? "—" : formatRp(c.value)}
              </span>
            </span>
          ))}
        </span>
        <span className="mt-1 block text-center text-[11px] text-muted-foreground group-open:hidden">Ketuk untuk rincian dan tambah saldo</span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>
            <b className="text-foreground">Uang pengadaan</b> = saldo buku kas cabang − isi laci
            {position.lastWithdrawal && <> · terakhir diambil dari laci {formatRp(position.lastWithdrawal.amount)}</>}
          </li>
          <li>
            <b className="text-foreground">Laci kasir</b>{" "}
            {position.drawer.state === "open"
              ? `· shift berjalan${position.drawer.cashierName ? ` (${position.drawer.cashierName})` : ""}`
              : "· sisa setelah tutup shift terakhir"}
            {" "}· modal {formatRp(position.drawer.float)}
            {position.drawer.excess !== null && position.drawer.excess > 0 && (
              <span className="font-semibold text-warning"> · kelebihan {formatRp(position.drawer.excess)}</span>
            )}
          </li>
        </ul>
        {proc !== null && proc < 0 && (
          <p className="text-xs font-semibold text-destructive">
            Uang pengadaan negatif: isi laci lebih besar dari saldo buku. Periksa hitungan kas shift.
          </p>
        )}
        {wallet && <ShopeeWalletCard wallet={wallet} compact />}
      </div>
    </details>
  );
}
