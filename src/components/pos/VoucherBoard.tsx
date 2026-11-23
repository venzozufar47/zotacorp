"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Check, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatRp } from "@/lib/cashflow/format";
import { buildReceiptBytes } from "@/lib/pos/receipt";
import { receiptBaseFields, type ReceiptContext } from "@/lib/pos/receipt-flow";
import { loadReceiptTransport } from "@/lib/pos/receipt-settings";
import { sendToPrinter } from "@/lib/pos/print-transport";
import { concatBytes, voucherReceiptData, VOUCHER_PRINT_BATCH } from "@/lib/pos/voucher-receipt";
import { recordVoucherPrint, revertVoucherPrint, settleVoucherSales, type VoucherProduct } from "@/lib/actions/pos-voucher.actions";

const MAX_PRINT = 500;
/** Jeda antar kiriman ke printer supaya intent RawBT tidak saling menimpa. */
const BATCH_GAP_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digits = (s: string) => s.replace(/\D/g, "").slice(0, 4);
const toInt = (s: string) => (s === "" ? 0 : Math.max(0, Math.floor(Number(s)) || 0));

type Step = "cetak" | "settlement";

/**
 * Alur sekali sehari: pagi cetak struk, malam settlement. Dua langkah dipisah segmented control (hanya satu terlihat
 * sekaligus) supaya layar tetap ringkas; settlement baru dibuka saat dibutuhkan.
 */
export function VoucherBoard({
  bankAccountId,
  products,
  receipt,
}: {
  bankAccountId: string;
  products: VoucherProduct[];
  receipt: ReceiptContext;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("cetak");
  // Jumlah cetak per produk; belum diubah = stok tersedia.
  const [printQty, setPrintQty] = useState<Record<string, string>>({});
  const [printing, setPrinting] = useState<{ id: string; done: number; total: number } | null>(null);
  const [cash, setCash] = useState<Record<string, string>>({});
  const [qris, setQris] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, startSave] = useTransition();
  // Revert struk gagal tercetak: SKU yang panelnya terbuka + jumlah struk yang tidak keluar dari printer.
  const [reverting, setReverting] = useState<string | null>(null);
  const [revertQty, setRevertQty] = useState("");
  const [revertBusy, startRevert] = useTransition();

  // Tak pernah melebihi stok tersedia: jumlah hanya boleh dikurangi dari stok.
  const qtyFor = (p: VoucherProduct) => Math.min(MAX_PRINT, p.onHand, printQty[p.key] != null ? toInt(printQty[p.key]) : p.onHand);

  async function onPrint(p: VoucherProduct) {
    const n = qtyFor(p);
    if (n <= 0 || printing) return;
    setPrinting({ id: p.key, done: 0, total: n });
    let sent = 0;
    let printError: string | null = null;
    try {
      const { method } = loadReceiptTransport();
      const one = buildReceiptBytes(voucherReceiptData(receiptBaseFields(receipt), p));
      for (let done = 0; done < n; done += VOUCHER_PRINT_BATCH) {
        const count = Math.min(VOUCHER_PRINT_BATCH, n - done);
        await sendToPrinter(concatBytes(Array.from({ length: count }, () => one)), method);
        sent = done + count;
        setPrinting({ id: p.key, done: sent, total: n });
        if (sent < n) await sleep(BATCH_GAP_MS);
      }
    } catch (e) {
      printError = e instanceof Error ? e.message : "Gagal mencetak";
    }
    // Stok berkurang sebanyak struk yang benar-benar terkirim, seperti pembelian asli.
    if (sent > 0) {
      const rec = await recordVoucherPrint({ bankAccountId, productId: p.productId, variantId: p.variantId, qty: sent });
      if (!rec.ok) {
        toast.error(`${sent} struk sudah tercetak tetapi stok gagal dikurangi: ${rec.error}. Jangan cetak ulang; hubungi admin.`);
      } else if (printError) {
        toast.error(`${printError}. ${sent} dari ${n} struk tercetak dan sudah mengurangi stok.`);
      } else {
        toast.success(`${sent} struk ${p.name} dicetak, stok berkurang`);
      }
      router.refresh();
    } else if (printError) {
      toast.error(printError);
    }
    setPrinting(null);
  }

  function openRevert(p: VoucherProduct) {
    setReverting(p.key);
    setRevertQty(String(p.printed));
  }

  // Stok dikembalikan lalu jumlah cetak diisi sebanyak yang di-revert, supaya satu ketukan "Cetak" mengulang
  // persis struk yang gagal tanpa memotong stok dua kali.
  function onRevert(p: VoucherProduct) {
    const n = Math.min(p.printed, toInt(revertQty));
    if (n <= 0) return;
    startRevert(async () => {
      const res = await revertVoucherPrint({ bankAccountId, productId: p.productId, variantId: p.variantId, qty: n });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal me-revert" : res.error);
        router.refresh();
        return;
      }
      setPrintQty((s) => ({ ...s, [p.key]: String(n) }));
      setReverting(null);
      toast.success(`${n} struk ${p.name} dikembalikan ke stok. Tekan Cetak untuk mengulang.`);
      router.refresh();
    });
  }

  const rows = products.map((p) => ({ key: p.key, cash: toInt(cash[p.key] ?? ""), qris: toInt(qris[p.key] ?? "") }));
  const priceOf = new Map(products.map((p) => [p.key, p.promoPrice]));
  const totalPcs = rows.reduce((n, r) => n + r.cash + r.qris, 0);
  const printedTotal = products.reduce((n, p) => n + p.printed, 0);
  const usedOf = (id: string) => {
    const r = rows.find((x) => x.key === id);
    return r ? r.cash + r.qris : 0;
  };
  // Impas = tiap produk: dicetak = cash + qris + sisa (kembali ke stok). Melebihi dicetak = tidak boleh disimpan.
  const overPrinted = products.some((p) => usedOf(p.key) > p.printed);
  const returnedTotal = products.reduce((n, p) => n + Math.max(0, p.printed - usedOf(p.key)), 0);
  const cashRp = rows.reduce((n, r) => n + r.cash * (priceOf.get(r.key) ?? 0), 0);
  const qrisRp = rows.reduce((n, r) => n + r.qris * (priceOf.get(r.key) ?? 0), 0);

  function onSave() {
    startSave(async () => {
      const res = await settleVoucherSales({ bankAccountId, rows });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal menyimpan" : res.error);
        setConfirming(false);
        return;
      }
      toast.success(`Settlement tersimpan: ${res.data.sales} nota${res.data.returned > 0 ? `, ${res.data.returned} struk kembali ke stok` : ""}`);
      setCash({});
      setQris({});
      setConfirming(false);
      router.refresh();
    });
  }

  if (products.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Tidak ada promo voucher aktif hari ini untuk cabang ini.</p>;
  }

  const inputCls =
    "h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-center text-lg font-bold tabular-nums text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";
  const segCls = (on: boolean) =>
    `h-11 flex-1 rounded-lg text-sm font-semibold transition-colors ${on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-3 sm:p-5">
      <div role="tablist" aria-label="Langkah voucher" className="flex gap-1 rounded-xl bg-muted p-1">
        <button type="button" role="tab" aria-selected={step === "cetak"} onClick={() => setStep("cetak")} className={segCls(step === "cetak")}>
          1. Cetak struk
        </button>
        <button type="button" role="tab" aria-selected={step === "settlement"} onClick={() => setStep("settlement")} className={segCls(step === "settlement")}>
          2. Settlement
        </button>
      </div>

      {step === "cetak" ? (
        <section className="space-y-3" aria-label="Cetak struk voucher">
          <p className="text-xs text-muted-foreground">
            Satu struk = 1 pcs, sudah berisi harga promo dan tulisan Qris / Cash untuk dicoret kasir. Mencetak langsung mengurangi stok POS seperti pembelian asli. Jumlah awal sama dengan stok tersedia dan hanya bisa dikurangi.
          </p>
          {products.map((p) => {
            const active = printing?.id === p.key ? printing : null;
            const n = qtyFor(p);
            return (
              <div key={p.key} className="rounded-2xl border-2 border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-bold text-foreground">{p.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatRp(p.promoPrice)} · stok {p.onHand}
                    {p.printed > 0 ? ` · dicetak ${p.printed}` : ""}
                  </p>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <label className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                    Jumlah
                    <input
                      inputMode="numeric"
                      className={inputCls + " mt-1"}
                      value={printQty[p.key] ?? String(p.onHand)}
                      disabled={printing != null}
                      onChange={(e) => {
                        const d = digits(e.target.value);
                        setPrintQty((s) => ({ ...s, [p.key]: d === "" ? "" : String(Math.min(p.onHand, toInt(d))) }));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onPrint(p)}
                    disabled={n <= 0 || printing != null}
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
                  >
                    {active ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                    {active ? `Mencetak ${active.done}/${active.total}` : `Cetak ${n} struk`}
                  </button>
                </div>
                {p.printed > 0 && !active && (
                  reverting === p.key ? (
                    <div className="mt-3 space-y-2 rounded-xl bg-muted p-3">
                      <p className="text-xs text-muted-foreground">
                        Berapa struk yang <span className="font-semibold text-foreground">tidak keluar</span> dari printer? Stoknya dikembalikan ({p.printed} tercatat), lalu cetak ulang sebanyak itu. Struk yang sudah keluar tetap tercatat.
                      </p>
                      <label className="block w-28 text-xs font-medium text-muted-foreground">
                        Jumlah
                        <input
                          inputMode="numeric"
                          className={inputCls + " mt-1"}
                          value={revertQty}
                          disabled={revertBusy}
                          onChange={(e) => {
                            const d = digits(e.target.value);
                            setRevertQty(d === "" ? "" : String(Math.min(p.printed, toInt(d))));
                          }}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setReverting(null)}
                          disabled={revertBusy}
                          className="h-12 shrink-0 rounded-xl border-2 border-border px-5 text-sm font-semibold hover:bg-card disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => onRevert(p)}
                          disabled={revertBusy || toInt(revertQty) <= 0}
                          className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {revertBusy ? <Loader2 size={18} className="shrink-0 animate-spin" /> : <Undo2 size={18} className="shrink-0" />}
                          <span className="truncate">{revertBusy ? "Mengembalikan..." : `Revert ${toInt(revertQty)} struk`}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openRevert(p)}
                      disabled={printing != null}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <Undo2 size={14} /> Struk gagal tercetak? Revert
                    </button>
                  )
                )}
                {active && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={active.total} aria-valuenow={active.done}>
                    <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(active.done / active.total) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Selesai mencetak? Pakai tab Settlement nanti saat toko tutup.</p>
        </section>
      ) : (
        <section className="space-y-3" aria-label="Settlement voucher">
          <p className="text-xs text-muted-foreground">
            Isi jumlah voucher yang ditukar per produk. Cash + QRIS tidak boleh melebihi struk yang dicetak; struk tak terpakai kembali ke stok.
          </p>
          {products.map((p) => {
            const used = usedOf(p.key);
            const sisa = p.printed - used;
            return (
            <div key={p.key} className="rounded-2xl border-2 border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-bold text-foreground">{p.name}</p>
                <p className={`text-xs tabular-nums ${sisa < 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                  dicetak {p.printed} · terpakai {used} · {sisa < 0 ? `lebih ${-sisa}` : `sisa ${sisa}`}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-muted-foreground">
                  Cash
                  <input
                    inputMode="numeric"
                    className={inputCls + " mt-1"}
                    value={cash[p.key] ?? ""}
                    placeholder="0"
                    disabled={saving}
                    onChange={(e) => {
                      setConfirming(false);
                      setCash((s) => ({ ...s, [p.key]: digits(e.target.value) }));
                    }}
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  QRIS
                  <input
                    inputMode="numeric"
                    className={inputCls + " mt-1"}
                    value={qris[p.key] ?? ""}
                    placeholder="0"
                    disabled={saving}
                    onChange={(e) => {
                      setConfirming(false);
                      setQris((s) => ({ ...s, [p.key]: digits(e.target.value) }));
                    }}
                  />
                </label>
              </div>
            </div>
            );
          })}

          <div className="rounded-2xl bg-muted p-4 text-sm tabular-nums" aria-live="polite">
            <div className="flex justify-between text-muted-foreground">
              <span>Cash</span>
              <span>{formatRp(cashRp)}</span>
            </div>
            <div className="mt-1 flex justify-between text-muted-foreground">
              <span>QRIS</span>
              <span>{formatRp(qrisRp)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
              <span>{totalPcs} voucher</span>
              <span>{formatRp(cashRp + qrisRp)}</span>
            </div>
            <div className={`mt-1 flex justify-between text-xs ${overPrinted ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
              <span>
                Dicetak {printedTotal} = terpakai {totalPcs} + sisa {returnedTotal}
              </span>
              <span>{overPrinted ? "Tidak impas" : "Impas"}</span>
            </div>
          </div>

          {confirming ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Kas tercatat dan {returnedTotal} struk tak terpakai kembali ke stok. Tidak bisa diulang dari layar ini. Yakin angkanya sudah benar?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={saving}
                  className="h-12 rounded-xl border-2 border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Periksa lagi
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {saving ? "Menyimpan..." : "Ya, simpan"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={printedTotal <= 0 || overPrinted}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Check size={18} /> Simpan settlement
            </button>
          )}
        </section>
      )}
    </div>
  );
}
