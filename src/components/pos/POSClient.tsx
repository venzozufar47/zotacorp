"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { History, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createPosSale,
  type PaymentMethod,
  type PosProduct,
} from "@/lib/actions/pos.actions";
import { formatIDR } from "@/lib/cashflow/format";

interface Props {
  bankAccountId: string;
  accountName: string;
  products: PosProduct[];
}

const formatRp = (n: number) => formatIDR(n, { withRp: true });

/**
 * POS — satu layar, mobile-first. Karyawan tap blok produk untuk
 * menambah qty ke cart; sticky bottom bar menampilkan total + dua
 * tombol pembayaran besar (Cash / QRIS). Submit → createPosSale →
 * toast + cart reset.
 */
export function POSClient({ bankAccountId, accountName, products }: Props) {
  // Map<productId, qty> — gunakan Record biasa supaya re-render gampang.
  const [cart, setCart] = useState<Record<string, number>>({});
  const [confirmMethod, setConfirmMethod] =
    useState<PaymentMethod | null>(null);
  const [pending, startTransition] = useTransition();

  // Lookup table from productId → { name, price } so total / cart
  // line rendering is O(cart entries) not O(products) per render.
  const productById = useMemo(() => {
    const m = new Map<string, { name: string; price: number }>();
    for (const p of products) m.set(p.id, { name: p.name, price: p.price });
    return m;
  }, [products]);

  const { total, itemCount, cartLines } = useMemo(() => {
    let total = 0;
    let itemCount = 0;
    const cartLines: Array<{ name: string; qty: number; subtotal: number }> = [];
    for (const [id, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const info = productById.get(id);
      if (!info) continue;
      const subtotal = info.price * qty;
      total += subtotal;
      itemCount += qty;
      cartLines.push({ name: info.name, qty, subtotal });
    }
    return { total, itemCount, cartLines };
  }, [cart, productById]);

  function inc(id: string) {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  }

  function dec(id: string) {
    setCart((c) => {
      const next = { ...c };
      const n = (next[id] ?? 0) - 1;
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }

  function submit(method: PaymentMethod) {
    const items = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({ productId, qty }));
    if (items.length === 0) return;
    startTransition(async () => {
      const res = await createPosSale({
        bankAccountId,
        paymentMethod: method,
        items,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menyimpan penjualan");
        return;
      }
      toast.success(
        `Tersimpan: ${formatRp(res.data?.total ?? 0)} — ${method === "cash" ? "Cash" : "QRIS"}`
      );
      setCart({});
      setConfirmMethod(null);
    });
  }

  if (products.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
          <h1 className="font-semibold text-foreground">{accountName} · POS</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Belum ada produk aktif.
            </p>
            <p className="text-xs text-muted-foreground">
              Minta admin untuk menambahkan produk di <code>/pos/produk</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom))]">
      {/* Header — sticky, compact. Link ke riwayat di kanan. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            POS
          </p>
          <h1 className="font-semibold text-foreground text-sm">{accountName}</h1>
        </div>
        <Link
          href="/pos/riwayat"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <History size={14} />
          Riwayat
        </Link>
      </header>

      {/* Grid produk — 2 kolom di mobile, lebih banyak di viewport besar. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3">
        {products.map((p) => {
          const qty = cart[p.id] ?? 0;
          const selected = qty > 0;
          return (
            // Relative wrapper so we can place the decrement <button> as
            // a sibling (not nested inside the increment <button>, which
            // would be invalid HTML).
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => inc(p.id)}
                className={`w-full min-h-[120px] rounded-2xl border text-left p-3 transition-colors active:bg-muted ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="font-semibold text-foreground text-base leading-tight pr-8">
                  {p.name}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatRp(p.price)}
                </div>
              </button>
              {selected && (
                <button
                  type="button"
                  aria-label="Kurangi"
                  onClick={() => dec(p.id)}
                  className="absolute top-2 right-2 min-w-[28px] h-7 px-2 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow"
                >
                  {qty}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom bar — sticky, safe-area-aware. */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total ({itemCount} item)
            </p>
            <p className="font-bold text-lg text-foreground">{formatRp(total)}</p>
          </div>
          {itemCount > 0 && (
            <button
              type="button"
              onClick={() => setCart({})}
              className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
            >
              <X size={14} /> Kosongkan
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={itemCount === 0 || pending}
            onClick={() => setConfirmMethod("cash")}
            className="h-12 rounded-xl bg-success text-white font-semibold disabled:opacity-40 disabled:pointer-events-none active:brightness-95"
          >
            Cash
          </button>
          <button
            type="button"
            disabled={itemCount === 0 || pending}
            onClick={() => setConfirmMethod("qris")}
            className="h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 disabled:pointer-events-none active:brightness-95"
          >
            QRIS
          </button>
        </div>
      </div>

      {/* Modal konfirmasi pembayaran. */}
      {confirmMethod && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => !pending && setConfirmMethod(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-foreground mb-1">
              Konfirmasi pembayaran
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              {confirmMethod === "cash" ? "Cash" : "QRIS"} · {itemCount} item
            </p>
            <div className="rounded-xl bg-muted/40 border border-border p-3 mb-4 max-h-60 overflow-y-auto">
              <ul className="space-y-1.5 text-sm">
                {cartLines.map((line) => (
                  <li
                    key={line.name}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-foreground">
                      {line.qty}× {line.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatRp(line.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Total
                </span>
                <span className="font-bold text-foreground tabular-nums">
                  {formatRp(total)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmMethod(null)}
                className="h-11 rounded-xl border border-border text-foreground font-semibold hover:bg-muted disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(confirmMethod)}
                className={`h-11 rounded-xl font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60 ${
                  confirmMethod === "cash" ? "bg-success" : "bg-primary"
                }`}
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                Bayar {formatRp(total)}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
