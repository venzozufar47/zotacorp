import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import type { CashPosition } from "@/lib/actions/procurement-wallet.actions";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Uang pengadaan (dibawa petugas) dan isi laci kasir per cabang. Uang pengadaan dihitung otomatis dari
 * saldo buku − isi laci; owner (`admin`) juga melihat rinciannya.
 */
export function CashPositionCard({ positions, admin = false }: { positions: CashPosition[]; admin?: boolean }) {
  if (positions.length === 0) return null;
  return (
    <div className="space-y-3">
      {positions.map((p) => (
        <Branch key={p.businessUnit} p={p} admin={admin} showName={positions.length > 1} />
      ))}
    </div>
  );
}

function Branch({ p, admin, showName }: { p: CashPosition; admin: boolean; showName: boolean }) {
  const d = p.drawer;
  const bal = p.procurementBalance;
  const negative = bal !== null && bal < 0;
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-3.5">
      {showName && <h2 className="font-display text-sm font-bold">{p.businessUnit.replace("Haengbocake ", "")}</h2>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {/* Uang pengadaan */}
        <div className={cn("rounded-xl border p-3", negative ? "border-destructive/60 bg-destructive/5" : "border-border bg-background/40")}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Uang pengadaan</p>
          {bal !== null ? (
            <>
              <p className={cn("mt-0.5 font-display text-2xl font-extrabold tabular-nums", negative && "text-destructive")}>
                {formatRp(bal)}
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                Uang yang semestinya dipegang pengadaan: saldo buku kas cabang dikurangi isi laci.
              </p>
              {negative && (
                <p className="mt-1.5 text-[11.5px] font-semibold text-destructive">
                  Negatif: isi laci lebih besar dari saldo buku. Ada pemasukan tunai yang belum masuk buku, atau
                  pengeluaran yang tercatat dua kali. Periksa hitungan kas shift.
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Belum bisa dihitung: isi laci belum diketahui.</p>
          )}
          {p.lastWithdrawal && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Terakhir diambil dari laci {formatRp(p.lastWithdrawal.amount)} · {timeLabel(p.lastWithdrawal.at)}
            </p>
          )}
        </div>

        {/* Laci kasir */}
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Laci kasir</p>
          {d.balance !== null ? (
            <>
              <p className="mt-0.5 font-display text-2xl font-extrabold tabular-nums">{formatRp(d.balance)}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                {d.state === "open"
                  ? `Shift berjalan${d.cashierName ? ` · ${d.cashierName}` : ""} (hitungan hidup)`
                  : `Sisa setelah tutup shift terakhir${d.sinceIso ? ` (${timeLabel(d.sinceIso)})` : ""}`}
              </p>
              <p className="mt-1.5 text-[11.5px]">
                Modal laci {formatRp(d.float)}
                {d.excess !== null && d.excess > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-warning">kelebihan {formatRp(d.excess)}</span>
                    <span className="text-muted-foreground"> — diambil malam ini</span>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Belum bisa dihitung: belum ada hitungan tutup shift sebelumnya.</p>
          )}
        </div>
      </div>

      {admin && p.bookBalance !== null && (
        <p className="rounded-xl bg-muted/50 px-3 py-2 text-[12px] leading-snug">
          Saldo buku kas (Keuangan) <b className="tabular-nums">{formatRp(p.bookBalance)}</b>
          {d.balance !== null && (
            <>
              {" − isi laci "}
              <b className="tabular-nums">{formatRp(d.balance)}</b>
              {" = uang pengadaan "}
              <b className={cn("tabular-nums", negative && "text-destructive")}>{formatRp(bal ?? 0)}</b>
            </>
          )}
          . Uang yang diambil pemilik untuk keperluan pribadi dicatat sebagai kategori &ldquo;Dividend&rdquo; dan ikut
          berkurang dari buku.
        </p>
      )}
    </section>
  );
}
