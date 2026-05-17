"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { PosNavLink } from "./PosNavLink";
import { PosTopNav } from "./PosTopNav";
import { Camera, Loader2, Minus, Palette, Plus, Settings, Sparkles, X } from "lucide-react";
import "./workstation.css";
import { toast } from "sonner";
import {
  createPosSale,
  setPosProductNotes,
  type PaymentMethod,
  type PosProduct,
  type PosProductVariant,
  type PosSaleItemInput,
} from "@/lib/actions/pos.actions";
import { useRouter } from "next/navigation";
import { attachPosQrisReceipt } from "@/lib/actions/pos-receipt.actions";
import { formatRp } from "@/lib/cashflow/format";
import { QRIS_RECEIPT_AT_CHECKOUT } from "@/lib/pos/flags";

interface Props {
  bankAccountId: string;
  accountName: string;
  products: PosProduct[];
  /** Admin-only UI affordances (link ke /pos/produk, empty-state CTA). */
  isAdmin: boolean;
  /** On-hand stok per SKU keyed by `cartKey(productId, variantId|null)`.
   *  null = produk tidak tracked / stok belum di-fetch (bypass gating). */
  stockByKey: Record<string, number> | null;
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
  /** Optional varian untuk open-price + variant — submit-nya jadi
   *  `{ productId, variantId, customPrice, qty }`. */
  variantId?: string;
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
export function POSClient({
  bankAccountId,
  accountName,
  products,
  isAdmin,
  stockByKey,
}: Props) {
  // Catalog cart: Record<cartKey, qty>.
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState<CustomLine[]>([]);
  const [confirmMethod, setConfirmMethod] =
    useState<PaymentMethod | null>(null);
  // QRIS wajib upload foto nota customer sebagai bukti — state-nya
  // di-reset setiap kali konfirmasi dibuka/ditutup.
  const [qrisReceipt, setQrisReceipt] = useState<File | null>(null);
  // Cash payment: jumlah uang yang diterima kasir dari customer.
  // null = belum diisi → tombol Bayar disabled (UX: jangan biarkan
  // kasir bayar tanpa konfirmasi nominal). Reset ke null tiap modal
  // dibuka/ditutup untuk hindari nilai stale lintas transaksi.
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  // Quick edit catatan publik produk (mis. "Latte habis hari ini").
  // null = dialog tertutup; kalau ada productId → edit untuk produk itu.
  const [notesEditFor, setNotesEditFor] = useState<string | null>(null);
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(false);
  // productId yang sedang dibuka variant-pickernya; null = tertutup.
  const [variantPickerFor, setVariantPickerFor] = useState<string | null>(null);
  // Open-price dialog target. variantId optional — diisi saat produk
  // open-price punya varian (kasir pilih varian dulu).
  const [openPriceFor, setOpenPriceFor] = useState<{
    productId: string;
    variantId: string | null;
  } | null>(null);
  // Variant picker untuk open-price product — beda dari variantPickerFor
  // biasa karena tap variant buka OpenPriceDialog (bukan inc qty).
  const [openPriceVariantFor, setOpenPriceVariantFor] = useState<string | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  // Concept-b "tweaks": palette tint + grid density. Persisted per-device
  // di localStorage agar kasir tidak perlu set ulang tiap shift. Default:
  // palette violet (default token) + density cozy.
  type Palette = "default" | "pink" | "yellow";
  type Density = "cozy" | "dense";
  const [palette, setPalette] = useState<Palette>("default");
  const [density, setDensity] = useState<Density>("cozy");
  const [tweaksOpen, setTweaksOpen] = useState(false);
  useEffect(() => {
    const p = localStorage.getItem("pos-palette") as Palette | null;
    const d = localStorage.getItem("pos-density") as Density | null;
    if (p === "default" || p === "pink" || p === "yellow") setPalette(p);
    if (d === "cozy" || d === "dense") setDensity(d);
  }, []);
  useEffect(() => {
    localStorage.setItem("pos-palette", palette);
  }, [palette]);
  useEffect(() => {
    localStorage.setItem("pos-density", density);
  }, [density]);

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

  /**
   * Resolve stok kapasitas untuk satu cart key, given a snapshot of
   * cart state (untuk hindari race saat callback baca state lama).
   * Mengembalikan `null` kalau produk tidak track stok / data belum
   * tersedia (caller treat sebagai "tak terbatas").
   *
   * Aggregate-variant: stok disimpan di product-level. Cap untuk
   * satu varian = onHand_produk - jumlah_kart_seluruh_varian +
   * qty_varian_ini (supaya naik 1 item varian sendiri tetap valid
   * selama total tidak lewat onHand produk).
   */
  function capacityFor(
    key: string,
    snapshot: Record<string, number>
  ): number | null {
    if (!stockByKey) return null;
    const { productId, variantId } = parseCartKey(key);
    const product = products.find((p) => p.id === productId);
    if (!product || !product.trackStock || product.isOpenPrice) return null;
    if (product.stockAggregateVariants && product.variants.length > 0) {
      const onHand = stockByKey[cartKey(productId, null)] ?? 0;
      let inCartOtherVariants = 0;
      for (const v of product.variants) {
        if (v.id === variantId) continue;
        inCartOtherVariants += snapshot[cartKey(productId, v.id)] ?? 0;
      }
      return Math.max(0, onHand - inCartOtherVariants);
    }
    return stockByKey[key] ?? 0;
  }

  function inc(key: string) {
    setCart((c) => {
      const cap = capacityFor(key, c);
      const next = (c[key] ?? 0) + 1;
      if (cap != null && next > cap) {
        toast.error("Stok habis");
        return c;
      }
      return { ...c, [key]: next };
    });
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

  /** Cek apakah produk masih punya stok yang bisa dijual (bukan
   *  spesifik varian — hanya gating untuk single-SKU dan untuk
   *  membuka varian picker saja). Kembali `true` kalau tidak track
   *  stok atau data tidak ada. */
  function productHasAnyAvailable(p: PosProduct): boolean {
    if (!stockByKey || !p.trackStock || p.isOpenPrice) return true;
    if (p.variants.length === 0) {
      const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
      return onHand - (cart[cartKey(p.id)] ?? 0) > 0;
    }
    if (p.stockAggregateVariants) {
      const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
      let inCart = 0;
      for (const v of p.variants) inCart += cart[cartKey(p.id, v.id)] ?? 0;
      return onHand - inCart > 0;
    }
    // Per-variant stok: at least one variant has remaining capacity.
    return p.variants.some((v) => {
      const onHand = stockByKey[cartKey(p.id, v.id)] ?? 0;
      return onHand - (cart[cartKey(p.id, v.id)] ?? 0) > 0;
    });
  }

  function handleProductTap(p: PosProduct) {
    if (!productHasAnyAvailable(p)) {
      toast.error("Stok habis");
      return;
    }
    if (p.isOpenPrice) {
      // Open-price + varian: pilih varian dulu, lalu input harga.
      // Kalau cuma 1 varian, skip picker langsung ke dialog harga.
      if (p.variants.length > 1) {
        setOpenPriceVariantFor(p.id);
        return;
      }
      const variantId = p.variants[0]?.id ?? null;
      setOpenPriceFor({ productId: p.id, variantId });
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

  function addOpenPriceLine(
    p: PosProduct,
    variantId: string | null,
    price: number,
    qty: number
  ) {
    const variant = variantId
      ? p.variants.find((v) => v.id === variantId)
      : null;
    const name = variant ? `${p.name} — ${variant.name}` : p.name;
    setCustomItems((arr) => [
      ...arr,
      {
        localId: crypto.randomUUID(),
        name,
        price,
        qty,
        productId: p.id,
        variantId: variantId ?? undefined,
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
          ? {
              productId: c.productId,
              variantId: c.variantId ?? null,
              customPrice: c.price,
              qty: c.qty,
            }
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
      setCashReceived(null);
    });
  }

  const showEmptyState = products.length === 0 && customItems.length === 0;

  if (showEmptyState) {
    return (
      <div className="min-h-screen flex flex-col">
        <PosTopNav accountName={accountName} isAdmin={isAdmin} active="pos" />
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
    <div
      data-pos-shell
      data-pos-palette={palette}
      data-pos-density={density}
      className="min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom))]"
    >
      <PosTopNav accountName={accountName} isAdmin={isAdmin} active="pos" />

      <div className="pos-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-3">
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
          // Stok badge: hanya untuk produk track stok + non open-price.
          // - "habis" => onHand - kart === 0 di seluruh varian (atau
          //   single-SKU). Card greyed + disabled.
          // - "low"   => 1..3 sisa, hanya hint warna.
          const stockState = computeStockState(p, stockByKey, cart);
          return (
            <div key={p.id} className="relative">
              {stockState.kind === "habis" && (
                <span className="absolute top-1.5 right-1.5 z-10 inline-flex items-center rounded-full border border-foreground/40 bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Habis
                </span>
              )}
              <div
                role="button"
                tabIndex={stockState.kind === "habis" ? -1 : 0}
                aria-disabled={stockState.kind === "habis"}
                onClick={() => {
                  if (stockState.kind === "habis") return;
                  handleProductTap(p);
                }}
                onKeyDown={(e) => {
                  if (stockState.kind === "habis") return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleProductTap(p);
                  }
                }}
                className={`pos-product-card relative w-full min-h-[104px] sm:min-h-[120px] rounded-2xl border text-left p-2.5 sm:p-3 transition-colors active:bg-muted ${
                  stockState.kind === "habis"
                    ? "border-dashed border-border bg-muted/30 opacity-60 cursor-not-allowed grayscale-[20%]"
                    : selected
                      ? "border-primary bg-primary/5 cursor-pointer"
                      : "border-border bg-card cursor-pointer"
                }`}
              >
                <div className="font-semibold text-foreground text-sm sm:text-base leading-tight pr-8">
                  {p.name}
                  <ProductStockSuffix
                    product={p}
                    stockByKey={stockByKey}
                    cart={cart}
                    stockState={stockState}
                  />
                </div>
                <div className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  {p.isOpenPrice
                    ? "Harga custom"
                    : hasVariants
                      ? variantPriceLabel(p.variants)
                      : formatRp(p.price)}
                </div>
                <VariantStockChips
                  product={p}
                  stockByKey={stockByKey}
                  cart={cart}
                  stockState={stockState}
                />
                {p.notes ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotesEditFor(p.id);
                    }}
                    className="mt-1 w-full text-left rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground line-clamp-2 hover:bg-warning/20"
                    aria-label="Edit catatan"
                  >
                    📝 {p.notes}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotesEditFor(p.id);
                    }}
                    className="mt-1 inline-flex items-center gap-0.5 rounded-md border border-dashed border-border bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Tambah catatan"
                  >
                    <Plus size={9} strokeWidth={2.5} /> Catatan
                  </button>
                )}
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
            setCashReceived(null);
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
            {confirmMethod === "cash" && (
              <CashReceivedField
                total={total}
                value={cashReceived}
                onChange={setCashReceived}
              />
            )}
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
                  setCashReceived(null);
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
                    !qrisReceipt) ||
                  (confirmMethod === "cash" &&
                    (cashReceived == null || cashReceived < total))
                }
                onClick={() => {
                  if (
                    confirmMethod === "cash" &&
                    (cashReceived == null || cashReceived < total)
                  ) {
                    return;
                  }
                  submit(confirmMethod);
                }}
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
          stockByKey={stockByKey}
          onInc={(variantId) => inc(cartKey(pickerProduct.id, variantId))}
          onDec={(variantId) => dec(cartKey(pickerProduct.id, variantId))}
          onClose={() => setVariantPickerFor(null)}
        />
      )}

      {openPriceVariantFor && (() => {
        const p = products.find((x) => x.id === openPriceVariantFor);
        if (!p) return null;
        return (
          <OpenPriceVariantPicker
            product={p}
            onPick={(variantId) => {
              setOpenPriceVariantFor(null);
              setOpenPriceFor({ productId: p.id, variantId });
            }}
            onClose={() => setOpenPriceVariantFor(null)}
          />
        );
      })()}

      {notesEditFor && (() => {
        const p = products.find((x) => x.id === notesEditFor);
        if (!p) return null;
        return (
          <NotesEditDialog
            product={p}
            onClose={() => setNotesEditFor(null)}
            onSaved={() => {
              setNotesEditFor(null);
              router.refresh();
            }}
          />
        );
      })()}

      {openPriceFor && (() => {
        const p = products.find((x) => x.id === openPriceFor.productId);
        if (!p) return null;
        const variant = openPriceFor.variantId
          ? p.variants.find((v) => v.id === openPriceFor.variantId) ?? null
          : null;
        return (
          <OpenPriceDialog
            product={p}
            variant={variant}
            onAdd={(price, qty) =>
              addOpenPriceLine(p, openPriceFor.variantId, price, qty)
            }
            onClose={() => setOpenPriceFor(null)}
          />
        );
      })()}

      <TweaksPanel
        open={tweaksOpen}
        onOpenChange={setTweaksOpen}
        palette={palette}
        onPaletteChange={setPalette}
        density={density}
        onDensityChange={setDensity}
      />
    </div>
  );
}

/**
 * Floating tweaks panel — palette switcher (Violet / Soft Pink / Soft
 * Yellow) + density toggle (Cozy / Dense). Persisted via localStorage
 * di parent. Diambil dari design concept-b zota-pos.
 */
function TweaksPanel({
  open,
  onOpenChange,
  palette,
  onPaletteChange,
  density,
  onDensityChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  palette: "default" | "pink" | "yellow";
  onPaletteChange: (p: "default" | "pink" | "yellow") => void;
  density: "cozy" | "dense";
  onDensityChange: (d: "cozy" | "dense") => void;
}) {
  const palettes: { id: "default" | "pink" | "yellow"; label: string; swatch: string }[] = [
    { id: "default", label: "Violet", swatch: "#8B5CF6" },
    { id: "pink", label: "Soft Pink", swatch: "#E879A8" },
    { id: "yellow", label: "Soft Yellow", swatch: "#D4A017" },
  ];
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Tweaks"
        className="fixed bottom-24 right-4 z-40 size-11 rounded-full bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] inline-flex items-center justify-center text-foreground hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_var(--foreground)] transition-transform"
      >
        <Palette size={18} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => onOpenChange(false)}
          />
          <div
            role="dialog"
            aria-label="POS tweaks"
            className="fixed bottom-40 right-4 z-50 w-72 rounded-2xl bg-card border-2 border-foreground p-4 shadow-[6px_6px_0_0_var(--foreground)] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-foreground">Tweaks</h3>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="size-7 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Palette
              </p>
              <div className="grid grid-cols-3 gap-2">
                {palettes.map((p) => {
                  const active = p.id === palette;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPaletteChange(p.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 px-1 text-[11px] transition-all ${
                        active
                          ? "border-foreground bg-accent font-semibold"
                          : "border-border hover:border-foreground"
                      }`}
                    >
                      <span
                        className="size-6 rounded-full border-2 border-foreground"
                        style={{ background: p.swatch }}
                      />
                      <span className="text-foreground">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Density
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["cozy", "dense"] as const).map((d) => {
                  const active = d === density;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onDensityChange(d)}
                      className={`rounded-xl border-2 py-2 text-xs capitalize transition-all ${
                        active
                          ? "border-foreground bg-accent font-semibold text-foreground"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Cash payment helper field. Kasir input nominal yang diterima
 * customer; live `kembalian = received - total` di bawah, plus chip
 * denominasi yang membulatkan-naik ke kelipatan terdekat (sesuai cara
 * kasir manusia: customer kasih 100rb → satu tap, bukan ketik 100000).
 *
 * Display-only — tidak di-persist ke `pos_sales`. Kalau di iterasi
 * selanjutnya dibutuhkan untuk reconciliation, tinggal pipe `value`
 * + `value - total` ke `createPosSale` sebagai field opsional.
 */
function CashReceivedField({
  total,
  value,
  onChange,
}: {
  total: number;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const change = value == null ? null : value - total;
  const denominations: Array<{ label: string; amount: number }> = [
    { label: "+50rb", amount: 50_000 },
    { label: "+100rb", amount: 100_000 },
    { label: "+200rb", amount: 200_000 },
  ];
  const roundUpTo = (n: number, step: number) =>
    Math.ceil(n / step) * step;

  return (
    <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3 space-y-2">
      <label className="block">
        <span className="text-xs font-medium text-foreground">
          Uang diterima
        </span>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <span className="text-sm font-semibold text-muted-foreground">
            Rp
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value == null ? "" : value.toLocaleString("id-ID")}
            placeholder="0"
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              if (digits === "") {
                onChange(null);
                return;
              }
              const n = parseInt(digits, 10);
              onChange(Number.isFinite(n) ? n : null);
            }}
            className="flex-1 bg-transparent outline-none text-base font-semibold text-foreground tabular-nums"
          />
        </div>
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(total)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted active:scale-95 transition-transform"
        >
          Pas
        </button>
        {denominations.map((d) => (
          <button
            key={d.amount}
            type="button"
            onClick={() => onChange(roundUpTo(Math.max(value ?? total, total), d.amount))}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted active:scale-95 transition-transform"
          >
            {d.label}
          </button>
        ))}
      </div>
      {value != null && (
        <div className="flex items-center justify-between text-sm">
          <span
            className={
              change != null && change < 0
                ? "text-destructive font-semibold"
                : "text-muted-foreground"
            }
          >
            {change == null
              ? "Kembalian"
              : change < 0
                ? "Kurang"
                : change === 0
                  ? "Uang pas"
                  : "Kembalian"}
          </span>
          <span
            className={
              "tabular-nums font-bold " +
              (change != null && change < 0
                ? "text-destructive"
                : change != null && change > 0
                  ? "text-pop-emerald"
                  : "text-muted-foreground")
            }
          >
            {change == null
              ? "Rp 0"
              : change < 0
                ? formatRp(-change)
                : formatRp(change)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Hitung state stok untuk satu kartu produk. "habis" = kartu di-disable
 * + greyed; "low" = sisa 1..3 → strip warning di card; "ok" / "untracked"
 * = render normal.
 *
 * Aggregate-variant: produk simpan stok di product-level. Avail = onHand
 *   produk - jumlah cart di seluruh varian.
 * Per-variant: max avail di antara varian yang masih punya kapasitas.
 *   Ini buat hint card-level — gating granular di varian picker.
 */
type StockState =
  | { kind: "untracked" }
  | { kind: "ok" }
  | { kind: "low"; remaining: number }
  | { kind: "habis" };

/**
 * Suffix "(N)" inline di samping nama produk yang nampilkan sisa stok.
 * Hanya muncul untuk produk track_stock (bukan open-price). Untuk
 * non-aggregate variants, suffix produk-level di-skip — masing-masing
 * varian punya angkanya sendiri di chip varian.
 */
function ProductStockSuffix({
  product,
  stockByKey,
  cart,
  stockState,
}: {
  product: PosProduct;
  stockByKey: Record<string, number> | null;
  cart: Record<string, number>;
  stockState: StockState;
}) {
  if (stockState.kind === "untracked") return null;
  const hasVariants = product.variants.length > 0;
  const aggregate = product.stockAggregateVariants;
  // Non-aggregate variants: per-varian punya angka sendiri, suffix
  // produk-level redundant.
  if (hasVariants && !aggregate) return null;

  let remaining: number;
  if (stockState.kind === "low") {
    remaining = stockState.remaining;
  } else if (stockState.kind === "habis") {
    remaining = 0;
  } else if (!stockByKey) {
    return null;
  } else if (!hasVariants) {
    remaining =
      (stockByKey[cartKey(product.id, null)] ?? 0) -
      (cart[cartKey(product.id)] ?? 0);
  } else {
    let inCart = 0;
    for (const v of product.variants)
      inCart += cart[cartKey(product.id, v.id)] ?? 0;
    remaining = (stockByKey[cartKey(product.id, null)] ?? 0) - inCart;
  }
  remaining = Math.max(0, remaining);
  const tone =
    remaining === 0 ? "text-muted-foreground/60" : "text-muted-foreground";
  return (
    <span className={"ml-1 font-semibold tabular-nums " + tone}>
      ({remaining})
    </span>
  );
}

/**
 * Daftar chip varian dengan sisa stok inline. Format "Varian (N)" —
 * skip kalau produk single-SKU atau aggregate variant (suffix di nama
 * produk sudah cukup) atau untracked.
 */
function VariantStockChips({
  product,
  stockByKey,
  cart,
  stockState,
}: {
  product: PosProduct;
  stockByKey: Record<string, number> | null;
  cart: Record<string, number>;
  stockState: StockState;
}) {
  if (stockState.kind === "untracked") return null;
  if (product.variants.length === 0) return null;
  if (product.stockAggregateVariants) return null;
  if (!stockByKey) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs tabular-nums">
      {product.variants.map((v) => {
        const onHand = stockByKey[cartKey(product.id, v.id)] ?? 0;
        const inCart = cart[cartKey(product.id, v.id)] ?? 0;
        const left = onHand - inCart;
        const tone =
          left <= 0
            ? "text-muted-foreground/60 line-through"
            : "text-foreground/80";
        return (
          <span key={v.id} className={tone}>
            {v.name} <span className="font-semibold">({Math.max(0, left)})</span>
          </span>
        );
      })}
    </div>
  );
}

function computeStockState(
  p: PosProduct,
  stockByKey: Record<string, number> | null,
  cart: Record<string, number>
): StockState {
  if (!stockByKey || !p.trackStock || p.isOpenPrice) {
    return { kind: "untracked" };
  }
  let remaining: number;
  if (p.variants.length === 0) {
    const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
    remaining = onHand - (cart[cartKey(p.id)] ?? 0);
  } else if (p.stockAggregateVariants) {
    const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
    let inCart = 0;
    for (const v of p.variants) inCart += cart[cartKey(p.id, v.id)] ?? 0;
    remaining = onHand - inCart;
  } else {
    remaining = p.variants.reduce((max, v) => {
      const avail =
        (stockByKey[cartKey(p.id, v.id)] ?? 0) -
        (cart[cartKey(p.id, v.id)] ?? 0);
      return Math.max(max, avail);
    }, 0);
  }
  if (remaining <= 0) return { kind: "habis" };
  if (remaining <= 3) return { kind: "low", remaining };
  return { kind: "ok" };
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
  stockByKey,
  onInc,
  onDec,
  onClose,
}: {
  product: PosProduct;
  cart: Record<string, number>;
  stockByKey: Record<string, number> | null;
  onInc: (variantId: string) => void;
  onDec: (variantId: string) => void;
  onClose: () => void;
}) {
  // Aggregate-variant: cap satu varian = onHand_produk - jumlah_cart
  // varian lain. Dihitung per-render karena state cart bisa berubah
  // saat user tap +.
  const tracked = !!stockByKey && product.trackStock && !product.isOpenPrice;
  const productOnHand = stockByKey
    ? stockByKey[cartKey(product.id, null)] ?? 0
    : 0;
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
            // Resolve sisa stok khusus varian ini.
            let remaining: number | null = null;
            if (tracked) {
              if (product.stockAggregateVariants) {
                let inCartOther = 0;
                for (const x of product.variants) {
                  if (x.id === v.id) continue;
                  inCartOther += cart[cartKey(product.id, x.id)] ?? 0;
                }
                remaining = Math.max(0, productOnHand - inCartOther - qty);
              } else {
                remaining =
                  (stockByKey![cartKey(product.id, v.id)] ?? 0) - qty;
              }
            }
            const habis = remaining != null && remaining <= 0;
            return (
              <div
                key={v.id}
                className={`rounded-xl border p-3 flex items-center gap-3 ${
                  habis
                    ? "border-dashed border-border bg-muted/30 opacity-60"
                    : qty > 0
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate flex items-center gap-1.5">
                    {v.name}
                    {habis && (
                      <span className="rounded-full border border-foreground/40 bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Habis
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatRp(v.price)}
                    {remaining != null && remaining > 0 && remaining <= 3 && (
                      <span className="ml-2 text-pop-pink font-semibold">
                        sisa {remaining}
                      </span>
                    )}
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
                    disabled={habis}
                    className="h-9 w-9 flex items-center justify-center rounded-r-full active:bg-primary/80 disabled:opacity-40"
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
 * Quick-edit catatan publik produk dari kasir (`/pos`). Use case: tag
 * "Latte habis" tanpa harus buka admin katalog. Action gated via
 * `setPosProductNotes` (admin atau POS assignee untuk rekening produk
 * tsb.). Hanya field `notes` yang mutable di sini.
 */
function NotesEditDialog({
  product,
  onClose,
  onSaved,
}: {
  product: PosProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(product.notes ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    const next = value.trim();
    const current = product.notes ?? "";
    if (next === current) {
      onSaved();
      return;
    }
    startTransition(async () => {
      const res = await setPosProductNotes({
        productId: product.id,
        notes: next.length > 0 ? next : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal simpan catatan");
        return;
      }
      toast.success(next ? "Catatan tersimpan" : "Catatan dihapus");
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => {
        if (pending) return;
        onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold text-foreground">{product.name}</h2>
          <p className="text-xs text-muted-foreground">
            Catatan untuk kasir & customer — terlihat di kartu produk.
          </p>
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          maxLength={200}
          rows={3}
          placeholder="Mis. 'Varian Latte habis hari ini'"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary outline-none resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {value.length}/200
          </span>
          <div className="flex gap-2">
            {product.notes && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setValue("");
                  startTransition(async () => {
                    const res = await setPosProductNotes({
                      productId: product.id,
                      notes: null,
                    });
                    if (!res.ok) {
                      toast.error(res.error ?? "Gagal hapus catatan");
                      return;
                    }
                    toast.success("Catatan dihapus");
                    onSaved();
                  });
                }}
                className="h-9 px-3 rounded-lg border border-border text-destructive text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                Hapus
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="h-9 px-3 rounded-lg border border-border text-foreground text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {pending && <Loader2 size={12} className="animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
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
  variant,
  onAdd,
  onClose,
}: {
  product: PosProduct;
  variant: PosProductVariant | null;
  onAdd: (price: number, qty: number) => void;
  onClose: () => void;
}) {
  // Default suggestion: variant.price (kalau ada) atau product.price.
  const defaultPrice = variant?.price ?? product.price;
  const [price, setPrice] = useState(
    defaultPrice > 0 ? String(defaultPrice) : ""
  );
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
          <h2 className="font-semibold text-foreground">
            {product.name}
            {variant && (
              <span className="text-muted-foreground"> — {variant.name}</span>
            )}
          </h2>
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

/**
 * Modal pilih varian untuk produk open-price. Tap varian buka
 * OpenPriceDialog dengan varian terpilih (parent yang switch state-nya).
 */
function OpenPriceVariantPicker({
  product,
  onPick,
  onClose,
}: {
  product: PosProduct;
  onPick: (variantId: string) => void;
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
            Pilih varian dulu — harga di-input di langkah berikutnya.
          </p>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {product.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onPick(v.id)}
              className="w-full rounded-xl border border-border bg-card hover:border-primary hover:bg-primary/5 transition p-3 flex items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">
                  {v.name}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  default harga {formatRp(v.price)}
                </p>
              </div>
              <span className="text-xs font-semibold text-primary shrink-0">
                Pilih →
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-xl border border-border text-foreground font-semibold hover:bg-muted"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

