"use client";

import { useMemo, useState, useTransition } from "react";
import { PosNavLink } from "./PosNavLink";
import { BarChart3, Boxes, Camera, History, Loader2, Minus, Plus, Settings, Sparkles, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import {
  createPosSale,
  type PaymentMethod,
  type PosProduct,
  type PosProductVariant,
  type PosSaleItemInput,
} from "@/lib/actions/pos.actions";
import { attachPosQrisReceipt } from "@/lib/actions/pos-receipt.actions";
import { formatRp } from "@/lib/cashflow/format";
import { QRIS_RECEIPT_AT_CHECKOUT } from "@/lib/pos/flags";

interface Props {
  bankAccountId: string;
  accountName: string;
  products: PosProduct[];
  /** Admin-only UI affordances (link ke /pos/produk, empty-state CTA). */
  isAdmin: boolean;
}

interface CustomLine {
  /** Local-only id, cukup untuk React key + edit/remove dari cart. */
  localId: string;
  name: string;
  price: number;
  qty: number;
  /** Kalau diisi, line ini referensi produk katalog open-price; saat
   *  submit dikirim sebagai `{ productId, customPrice, qty }`. Kosong
   *  = item ad-hoc murni (`{ customName, customPrice, qty }`). */
  productId?: string;
}

/** Cart key scheme: "p:<productId>" untuk produk tanpa varian,
 *  "p:<productId>|v:<variantId>" untuk yang pakai varian. */
function cartKey(productId: string, variantId?: string | null) {
  return variantId ? `p:${productId}|v:${variantId}` : `p:${productId}`;
}


function parseCartKey(key: string): { productId: string; variantId: string | null } {
  const [pPart, vPart] = key.split("|");
  const productId = pPart.slice(2);
  const variantId = vPart ? vPart.slice(2) : null;
  return { productId, variantId };
}

/**
 * POS — satu layar, mobile-first. Karyawan tap blok produk untuk
 * menambah qty ke cart; atau tap "Tambah custom" untuk input manual
 * (nama + harga) item satu-kali. Produk dengan varian membuka modal
 * pilih varian sebelum masuk cart. Sticky bottom bar menampilkan total
 * + dua tombol pembayaran besar (Cash / QRIS).
 */
export function POSClient({ bankAccountId, accountName, products, isAdmin }: Props) {
  // Catalog cart: Record<cartKey, qty>.
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState<CustomLine[]>([]);
  const [confirmMethod, setConfirmMethod] =
    useState<PaymentMethod | null>(null);
  // QRIS wajib upload foto nota customer sebagai bukti — state-nya
  // di-reset setiap kali konfirmasi dibuka/ditutup.
  const [qrisReceipt, setQrisReceipt] = useState<File | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  // productId yang sedang dibuka variant-pickernya; null = tertutup.
  const [variantPickerFor, setVariantPickerFor] = useState<string | null>(null);
  // productId open-price yang sedang dibuka dialog input harga; null = tertutup.
  const [openPriceFor, setOpenPriceFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Lookup cartKey → { name, price } untuk total/rendering O(cart entries).
  const lineByKey = useMemo(() => {
    const m = new Map<string, { name: string; price: number; productId: string }>();
    for (const p of products) {
      if (p.variants.length === 0) {
        m.set(cartKey(p.id), { name: p.name, price: p.price, productId: p.id });
      } else {
        for (const v of p.variants) {
          m.set(cartKey(p.id, v.id), {
            name: `${p.name} — ${v.name}`,
            price: v.price,
            productId: p.id,
          });
        }
      }
    }
    return m;
  }, [products]);

  const { total, itemCount, cartLines, qtyByProductId } = useMemo(() => {
    let total = 0;
    let itemCount = 0;
    const cartLines: Array<{
      key: string;
      name: string;
      qty: number;
      subtotal: number;
      custom: boolean;
    }> = [];
    const qtyByProductId = new Map<string, number>();
    for (const [key, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const info = lineByKey.get(key);
      if (!info) continue;
      const subtotal = info.price * qty;
      total += subtotal;
      itemCount += qty;
      cartLines.push({ key, name: info.name, qty, subtotal, custom: false });
      qtyByProductId.set(
        info.productId,
        (qtyByProductId.get(info.productId) ?? 0) + qty
      );
    }
    for (const c of customItems) {
      const subtotal = c.price * c.qty;
      total += subtotal;
      itemCount += c.qty;
      cartLines.push({
        key: `c:${c.localId}`,
        name: c.name,
        qty: c.qty,
        subtotal,
        custom: true,
      });
    }
    return { total, itemCount, cartLines, qtyByProductId };
  }, [cart, customItems, lineByKey]);

  const openPriceByProductId = useMemo(() => {
    const m = new Map<string, { qty: number; lines: number }>();
    for (const c of customItems) {
      if (!c.productId) continue;
      const e = m.get(c.productId) ?? { qty: 0, lines: 0 };
      e.qty += c.qty;
      e.lines += 1;
      m.set(c.productId, e);
    }
    return m;
  }, [customItems]);

  function inc(key: string) {
    setCart((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
  }

  function dec(key: string) {
    setCart((c) => {
      const next = { ...c };
      const n = (next[key] ?? 0) - 1;
      if (n <= 0) delete next[key];
      else next[key] = n;
      return next;
    });
  }

  function handleProductTap(p: PosProduct) {
    // Open-price: tiap tap buka dialog input harga; setiap submit
    // jadi line baru di cart sehingga qty + harga bisa beda-beda.
    if (p.isOpenPrice) {
      setOpenPriceFor(p.id);
      return;
    }
    if (p.variants.length === 0) {
      inc(cartKey(p.id));
      return;
    }
    // Kalau cuma 1 varian aktif, langsung inc tanpa modal — tidak ada
    // ambiguitas. (Admin mungkin hapus varian lain, sisakan 1.)
    if (p.variants.length === 1) {
      inc(cartKey(p.id, p.variants[0].id));
      return;
    }
    setVariantPickerFor(p.id);
  }

  function addOpenPriceLine(p: PosProduct, price: number, qty: number) {
    setCustomItems((arr) => [
      ...arr,
      {
        localId: crypto.randomUUID(),
        name: p.name,
        price,
        qty,
        productId: p.id,
      },
    ]);
  }

  function addCustom(name: string, price: number, qty: number) {
    setCustomItems((arr) => [
      ...arr,
      {
        localId: crypto.randomUUID(),
        name: name.trim(),
        price,
        qty,
      },
    ]);
  }

  function updateCustomQty(localId: string, delta: number) {
    setCustomItems((arr) =>
      arr.flatMap((c) => {
        if (c.localId !== localId) return [c];
        const next = c.qty + delta;
        if (next <= 0) return [];
        return [{ ...c, qty: next }];
      })
    );
  }

  function removeCustom(localId: string) {
    setCustomItems((arr) => arr.filter((c) => c.localId !== localId));
  }

  function resetCart() {
    setCart({});
    setCustomItems([]);
  }

  function submit(method: PaymentMethod) {
    const catalogItems: PosSaleItemInput[] = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const { productId, variantId } = parseCartKey(key);
        return variantId
          ? { productId, variantId, qty }
          : { productId, qty };
      });
    const items: PosSaleItemInput[] = [
      ...catalogItems,
      ...customItems.map((c) =>
        c.productId
          ? { productId: c.productId, customPrice: c.price, qty: c.qty }
          : { customName: c.name, customPrice: c.price, qty: c.qty }
      ),
    ];
    if (items.length === 0) return;
    if (QRIS_RECEIPT_AT_CHECKOUT && method === "qris" && !qrisReceipt) {
      toast.error("QRIS wajib foto nota customer");
      return;
    }
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
      if (QRIS_RECEIPT_AT_CHECKOUT && method === "qris" && qrisReceipt && res.data?.saleId) {
        const form = new FormData();
        form.set("saleId", res.data.saleId);
        form.set("file", qrisReceipt);
        const att = await attachPosQrisReceipt(form);
        if (!att.ok) {
          // Sale sudah committed — kasir perlu tahu supaya bisa
          // re-upload lewat admin panel; jangan void sale karena
          // customer sudah bayar.
          toast.error(`Tersimpan tapi foto gagal upload: ${att.error}`);
          resetCart();
          setConfirmMethod(null);
          setQrisReceipt(null);
          return;
        }
      }
      toast.success(
        `Tersimpan: ${formatRp(res.data?.total ?? 0)} — ${method === "cash" ? "Cash" : "QRIS"}`
      );
      resetCart();
      setConfirmMethod(null);
      setQrisReceipt(null);
    });
  }

  const showEmptyState = products.length === 0 && customItems.length === 0;

  if (showEmptyState) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
          <h1 className="font-semibold text-foreground">{accountName} · POS</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Belum ada produk aktif.
            </p>
            <div className="flex flex-col gap-2 items-center">
              {isAdmin && (
                <PosNavLink
                  href="/pos/produk"
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  <Settings size={14} />
                  Kelola katalog
                </PosNavLink>
              )}
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border border-border text-foreground text-sm font-semibold hover:bg-muted"
              >
                <Sparkles size={14} />
                Tambah item custom
              </button>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground mt-1">
                  Atau minta admin menambahkan produk di <code>/pos/produk</code>.
                </p>
              )}
            </div>
          </div>
        </div>
        {customOpen && (
          <CustomItemDialog
            onClose={() => setCustomOpen(false)}
            onAdd={addCustom}
          />
        )}
      </div>
    );
  }

  const pickerProduct =
    variantPickerFor != null
      ? products.find((p) => p.id === variantPickerFor) ?? null
      : null;

  return (
    <div className="min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            POS
          </p>
          <h1 className="font-semibold text-foreground text-sm truncate">{accountName}</h1>
        </div>
        <nav className="flex items-center gap-1 sm:gap-3 shrink-0">
          {isAdmin && (
            <HeaderNavLink href="/pos/produk" icon={<Settings size={16} />} label="Katalog" />
          )}
          <HeaderNavLink href="/pos/shift" icon={<Wallet size={16} />} label="Saldo" />
          <HeaderNavLink href="/pos/stok" icon={<Boxes size={16} />} label="Stok" />
          <HeaderNavLink href="/pos/riwayat" icon={<History size={16} />} label="Riwayat" />
          {isAdmin && (
            <HeaderNavLink href="/pos/insights" icon={<BarChart3 size={16} />} label="Insights" />
          )}
        </nav>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-3">
        {products.map((p) => {
          const hasVariants = p.variants.length > 0;
          const totalQtyOnThisProduct = qtyByProductId.get(p.id) ?? 0;
          // Open-price lines hidup di customItems (bukan cart) —
          // di-aggregate sekali via useMemo supaya O(1) per kartu.
          const openPriceAgg = p.isOpenPrice
            ? openPriceByProductId.get(p.id)
            : undefined;
          const openPriceQty = openPriceAgg?.qty ?? 0;
          const openPriceLineCount = openPriceAgg?.lines ?? 0;
          const selected =
            totalQtyOnThisProduct > 0 || openPriceQty > 0;
          // Untuk produk tanpa varian (dan bukan open-price), tampilkan
          // [- qty +] pill di card. Open-price tidak punya pill — tiap
          // tap buka dialog harga baru. Variant: tap = modal varian.
          const showInlinePill = !hasVariants && !p.isOpenPrice && selected;
          const singleKey =
            !hasVariants && !p.isOpenPrice ? cartKey(p.id) : null;
          const qtyOnSingleKey = singleKey ? cart[singleKey] ?? 0 : 0;
          return (
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => handleProductTap(p)}
                className={`w-full min-h-[104px] sm:min-h-[120px] rounded-2xl border text-left p-2.5 sm:p-3 transition-colors active:bg-muted ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="font-semibold text-foreground text-sm sm:text-base leading-tight pr-8">
                  {p.name}
                </div>
                <div className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  {p.isOpenPrice
                    ? "Harga custom"
                    : hasVariants
                      ? variantPriceLabel(p.variants)
                      : formatRp(p.price)}
                </div>
                {p.isOpenPrice && openPriceLineCount > 0 && (
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-primary font-semibold">
                    {openPriceLineCount} line · {openPriceQty}× di cart
                  </div>
                )}
                {hasVariants && (
                  <>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.variants.length} varian
                      {totalQtyOnThisProduct > 0 && ` · ${totalQtyOnThisProduct} di cart`}
                    </div>
                    {totalQtyOnThisProduct > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {p.variants
                          .map((v) => ({
                            v,
                            qty: cart[cartKey(p.id, v.id)] ?? 0,
                          }))
                          .filter((x) => x.qty > 0)
                          .map(({ v, qty }) => (
                            <li
                              key={v.id}
                              className="text-xs text-primary tabular-nums"
                            >
                              <span className="font-semibold">{qty}×</span>{" "}
                              {v.name}
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
              </button>
              {showInlinePill && singleKey && (
                <div className="absolute bottom-2 right-2 flex items-center gap-0 rounded-full bg-primary text-primary-foreground shadow select-none">
                  <button
                    type="button"
                    aria-label="Kurangi"
                    onClick={(e) => {
                      e.stopPropagation();
                      dec(singleKey);
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-l-full active:bg-primary/80"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[24px] text-center text-sm font-bold tabular-nums px-1">
                    {qtyOnSingleKey}
                  </span>
                  <button
                    type="button"
                    aria-label="Tambah"
                    onClick={(e) => {
                      e.stopPropagation();
                      inc(singleKey);
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-r-full active:bg-primary/80"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="min-h-[104px] sm:min-h-[120px] rounded-2xl border-2 border-dashed border-border bg-muted/20 p-2.5 sm:p-3 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors active:bg-muted"
        >
          <Sparkles size={18} />
          <span className="text-sm font-semibold">Tambah custom</span>
          <span className="text-[10px] text-muted-foreground">
            nama + harga manual
          </span>
        </button>
      </div>

      {customItems.length > 0 && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Item custom & harga custom
          </p>
          {customItems.map((c) => (
            <div
              key={c.localId}
              className="rounded-xl border border-border bg-card p-3 flex items-center gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">
                  {c.name}
                  {c.productId && (
                    <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      open price
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatRp(c.price)} × {c.qty} = {formatRp(c.price * c.qty)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Kurangi"
                onClick={() => updateCustomQty(c.localId, -1)}
                className="h-8 w-8 rounded-full border border-border text-foreground flex items-center justify-center hover:bg-muted"
              >
                <Minus size={14} />
              </button>
              <span className="w-5 text-center text-sm font-semibold tabular-nums">
                {c.qty}
              </span>
              <button
                type="button"
                aria-label="Tambah"
                onClick={() => updateCustomQty(c.localId, 1)}
                className="h-8 w-8 rounded-full border border-border text-foreground flex items-center justify-center hover:bg-muted"
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                aria-label="Hapus"
                onClick={() => removeCustom(c.localId)}
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

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
              onClick={resetCart}
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

      {confirmMethod && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => {
            if (pending) return;
            setConfirmMethod(null);
            setQrisReceipt(null);
          }}
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
                    key={line.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-foreground">
                      {line.qty}× {line.name}
                      {line.custom && (
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          custom
                        </span>
                      )}
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
            {QRIS_RECEIPT_AT_CHECKOUT && confirmMethod === "qris" && (
              <div className="mb-3">
                <p className="text-xs font-medium text-foreground mb-1.5">
                  Foto nota QRIS dari customer{" "}
                  <span className="text-destructive">*</span>
                </p>
                <label
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition ${
                    qrisReceipt
                      ? "border-success/50 bg-success/10"
                      : "border-dashed border-border bg-muted/30 hover:bg-muted"
                  } ${pending ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 5 * 1024 * 1024) {
                        toast.error("Foto maksimal 5MB");
                        e.target.value = "";
                        return;
                      }
                      setQrisReceipt(f);
                    }}
                  />
                  <Camera size={16} className="text-foreground shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">
                    {qrisReceipt ? qrisReceipt.name : "Ambil foto / pilih gambar"}
                  </span>
                  {qrisReceipt && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setQrisReceipt(null);
                      }}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Hapus foto"
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Wajib sebagai bukti audit — foto bisa di-review admin di
                  rekap finance.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmMethod(null);
                  setQrisReceipt(null);
                }}
                className="h-11 rounded-xl border border-border text-foreground font-semibold hover:bg-muted disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  pending ||
                  (QRIS_RECEIPT_AT_CHECKOUT &&
                    confirmMethod === "qris" &&
                    !qrisReceipt)
                }
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

      {customOpen && (
        <CustomItemDialog
          onClose={() => setCustomOpen(false)}
          onAdd={addCustom}
        />
      )}

      {pickerProduct && (
        <VariantPickerDialog
          product={pickerProduct}
          cart={cart}
          onInc={(variantId) => inc(cartKey(pickerProduct.id, variantId))}
          onDec={(variantId) => dec(cartKey(pickerProduct.id, variantId))}
          onClose={() => setVariantPickerFor(null)}
        />
      )}

      {openPriceFor && (() => {
        const p = products.find((x) => x.id === openPriceFor);
        if (!p) return null;
        return (
          <OpenPriceDialog
            product={p}
            onAdd={(price, qty) => addOpenPriceLine(p, price, qty)}
            onClose={() => setOpenPriceFor(null)}
          />
        );
      })()}
    </div>
  );
}

/** "Rp 10.000" kalau semua varian sama harganya, "Rp 10.000 – Rp 15.000"
 *  untuk rentang. Array diasumsikan non-empty (hanya dipanggil bila ada
 *  varian). */
function variantPriceLabel(variants: PosProductVariant[]): string {
  const prices = variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatRp(min) : `${formatRp(min)} – ${formatRp(max)}`;
}

/** Modal varian — karyawan +/- qty per varian, close untuk apply ke cart
 *  (state langsung update parent via onInc/onDec). */
function VariantPickerDialog({
  product,
  cart,
  onInc,
  onDec,
  onClose,
}: {
  product: PosProduct;
  cart: Record<string, number>;
  onInc: (variantId: string) => void;
  onDec: (variantId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold text-foreground">{product.name}</h2>
          <p className="text-xs text-muted-foreground">
            Pilih varian — tap +/- untuk qty.
          </p>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {product.variants.map((v) => {
            const qty = cart[cartKey(product.id, v.id)] ?? 0;
            return (
              <div
                key={v.id}
                className={`rounded-xl border p-3 flex items-center gap-3 ${
                  qty > 0
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">
                    {v.name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatRp(v.price)}
                  </p>
                </div>
                <div className="flex items-center gap-0 rounded-full bg-primary text-primary-foreground shadow select-none">
                  <button
                    type="button"
                    aria-label="Kurangi"
                    onClick={() => onDec(v.id)}
                    className="h-9 w-9 flex items-center justify-center rounded-l-full active:bg-primary/80 disabled:opacity-40"
                    disabled={qty === 0}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[28px] text-center text-sm font-bold tabular-nums px-1">
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label="Tambah"
                    onClick={() => onInc(v.id)}
                    className="h-9 w-9 flex items-center justify-center rounded-r-full active:bg-primary/80"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
        >
          Selesai
        </button>
      </div>
    </div>
  );
}

/**
 * Dialog input item custom — nama + harga + qty. Nama wajib, harga
 * harus ≥ 0 (boleh 0 untuk freebie/promo), qty integer positif.
 */
function CustomItemDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, price: number, qty: number) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  function submit() {
    const n = name.trim();
    const p = Number(price);
    const q = Number(qty);
    if (!n) {
      toast.error("Nama item wajib diisi");
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      toast.error("Harga tidak valid");
      return;
    }
    if (!Number.isInteger(q) || q <= 0) {
      toast.error("Qty harus bilangan bulat > 0");
      return;
    }
    onAdd(n, p, q);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold text-foreground">Tambah item custom</h2>
          <p className="text-xs text-muted-foreground">
            Item satu-kali — tidak masuk katalog.
          </p>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Nama
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mis. Kue titipan"
              className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
            />
          </label>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Harga
              </span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="15000"
                inputMode="numeric"
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Qty
              </span>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
              />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-border text-foreground font-semibold hover:bg-muted"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
          >
            Tambahkan
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Dialog input harga untuk produk open-price. Tiap submit menambah
 * line BARU ke cart — kasir bisa tap produk yang sama berkali-kali
 * dengan harga berbeda (mis. discount per customer).
 */
function OpenPriceDialog({
  product,
  onAdd,
  onClose,
}: {
  product: PosProduct;
  onAdd: (price: number, qty: number) => void;
  onClose: () => void;
}) {
  // Default suggestion = harga di katalog kalau di-set; kosong kalau 0.
  const [price, setPrice] = useState(product.price > 0 ? String(product.price) : "");
  const [qty, setQty] = useState("1");

  function submit() {
    const p = Number(price);
    const q = Number(qty);
    if (!Number.isFinite(p) || p < 0) {
      toast.error("Harga tidak valid");
      return;
    }
    if (!Number.isInteger(q) || q <= 0) {
      toast.error("Qty harus bilangan bulat > 0");
      return;
    }
    onAdd(p, q);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold text-foreground">{product.name}</h2>
          <p className="text-xs text-muted-foreground">
            Input harga + qty. Submit untuk tambah ke cart sebagai line baru —
            kalau mau beda harga, tap produk lagi.
          </p>
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Harga
            </span>
            <input
              autoFocus
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="contoh 25000"
              inputMode="numeric"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Qty
            </span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="numeric"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-border text-foreground font-semibold hover:bg-muted"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
          >
            Tambah ke cart
          </button>
        </div>
      </div>
    </div>
  );
}

function HeaderNavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <PosNavLink
      href={href}
      className="inline-flex items-center gap-1 h-9 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </PosNavLink>
  );
}
