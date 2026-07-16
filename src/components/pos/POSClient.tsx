"use client";

import { useMemo, useState, useTransition } from "react";
import { PosNavLink } from "./PosNavLink";
import { PosShell } from "./PosShell";
import "./workstation.css";
import {
  BarChart3,
  Boxes,
  Camera,
  History,
  Home,
  Loader2,
  Minus,
  Plus,
  Printer,
  Search,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
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
import { activateTodayDiscountPreset } from "@/lib/actions/pos-discount.actions";
import { formatRp } from "@/lib/cashflow/format";
import { applyDiscount, type RoundingMode } from "@/lib/pos/discount";
import { QRIS_RECEIPT_AT_CHECKOUT } from "@/lib/pos/flags";
import {
  buildReceiptBytes,
  formatReceiptDateTime,
  type ReceiptData,
} from "@/lib/pos/receipt";
import {
  loadReceiptTransport,
  type ReceiptContent,
} from "@/lib/pos/receipt-settings";
import { sendToPrinter } from "@/lib/pos/print-transport";
import { ReceiptSuccessDialog } from "./ReceiptSuccessDialog";
import { StrukSettingsDialog } from "./StrukSettingsDialog";

interface ActiveDiscountProp {
  id: string;
  percentOff: number;
  roundingUnit: number;
  roundingMode: RoundingMode;
  note: string | null;
}

interface Props {
  bankAccountId: string;
  accountName: string;
  /** Cabang default rekening — dicetak di header struk. */
  branch?: string | null;
  /** Nama kasir (opsional) — dicetak di struk. */
  cashierName?: string | null;
  /** Konten struk bersama (server, per rekening). */
  receiptContent: ReceiptContent;
  products: PosProduct[];
  /** Admin-only UI affordances (link ke /pos/produk, empty-state CTA). */
  isAdmin: boolean;
  /** On-hand stok per SKU keyed by `cartKey(productId, variantId|null)`.
   *  null = produk tidak tracked / stok belum di-fetch (bypass gating). */
  stockByKey: Record<string, number> | null;
  /** Campaign diskon yang berlaku untuk rekening + hari ini (null = none).
   *  Server-resolved supaya UI tinggal render. */
  activeDiscount?: ActiveDiscountProp | null;
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
  branch = null,
  cashierName = null,
  receiptContent,
  products,
  isAdmin,
  stockByKey,
  activeDiscount = null,
}: Props) {
  // Catalog cart: Record<cartKey, qty>.
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState<CustomLine[]>([]);
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

  // Struk: snapshot sale terakhir untuk dialog cetak + toggle setelan.
  // Snapshot ditangkap di submit() SEBELUM reset karena uang tunai/
  // kembalian hanya hidup di client state.
  const [lastSale, setLastSale] = useState<ReceiptData | null>(null);
  const [strukSettingsOpen, setStrukSettingsOpen] = useState(false);

  // Concept-b additions: search filter + mobile cart drawer toggle.
  // payMode menggantikan confirmMethod — pembayaran kini inline di
  // panel cart (cash field / QRIS upload live di footer), bukan modal.
  const [searchQuery, setSearchQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [payMode, setPayMode] = useState<PaymentMethod | "pending">("cash");
  // Nama pemesan + mode fulfillment — wajib untuk SETIAP transaksi.
  // customer_name juga sebagai konfirmasi anti-kepencet sebelum
  // commit (kasir mengetik nama → memastikan tidak salah submit).
  const [customerName, setCustomerName] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<
    "dine_in" | "take_away"
  >("dine_in");
  // Per-item override: key = cartKey ("p:<id>" / "p:<id>|v:<vid>").
  // Hanya entries yang BEDA dari fulfillmentType yang disimpan;
  // server akan resolve sisanya ke transaction-level.
  const [itemFulfillmentOverrides, setItemFulfillmentOverrides] = useState<
    Record<string, "dine_in" | "take_away">
  >({});

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

  // Concept-b: filter produk by case-insensitive substring of nama
  // (sederhana, sesuai design — chips kategori belum ada karena model
  //  produk belum punya field kategori).
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, searchQuery]);

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

  function submit(method: PaymentMethod | "pending") {
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
    if (!customerName.trim()) {
      toast.error("Atas nama pemesan wajib diisi");
      return;
    }
    if (QRIS_RECEIPT_AT_CHECKOUT && method === "qris" && !qrisReceipt) {
      toast.error("QRIS wajib foto nota customer");
      return;
    }
    startTransition(async () => {
      const res = await createPosSale({
        bankAccountId,
        paymentMethod: method,
        items,
        customerName: customerName.trim(),
        fulfillmentType,
        itemFulfillmentOverrides,
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
          setQrisReceipt(null);
          setCartOpen(false);
          return;
        }
      }
      const methodLabel =
        method === "pending"
          ? "Pesanan"
          : method === "cash"
            ? "Cash"
            : "QRIS";
      toast.success(
        method === "pending"
          ? `Pesanan ${customerName.trim()} dibuat — ${formatRp(res.data?.total ?? 0)}`
          : `Tersimpan: ${formatRp(res.data?.total ?? 0)} — ${methodLabel}`
      );

      // Struk: tangkap snapshot SEBELUM reset (uang tunai/kembalian hanya
      // ada di client state). Auto-cetak bila diaktifkan & sudah lunas.
      const rc = receiptContent;
      const t = loadReceiptTransport();
      const effBranch = rc.showBranch ? rc.branchOverride.trim() || branch : null;
      const receipt: ReceiptData = {
        header: rc.header,
        branch: effBranch,
        address: rc.address,
        datetime: formatReceiptDateTime(new Date()),
        cashierName,
        customerName: customerName.trim(),
        fulfillment: fulfillmentType,
        items: cartLines.map((l) => ({
          name: l.name,
          qty: l.qty,
          subtotal: l.subtotal,
        })),
        grossTotal: total,
        discountAmount,
        total: finalTotal,
        method,
        cashReceived: method === "cash" ? cashReceived : null,
        change:
          method === "cash" && cashReceived != null
            ? cashReceived - finalTotal
            : null,
        footer: rc.footer,
        wifiName: rc.wifiName,
        wifiPassword: rc.wifiPassword,
        saleShortId: res.data?.saleId ? res.data.saleId.slice(0, 8) : null,
        labels: rc.labels,
      };
      if (t.autoPrint && method !== "pending") {
        // best-effort — jangan ganggu alur kasir kalau cetak gagal.
        // (Web Bluetooth mungkin butuh perangkat sudah dipilih lebih dulu
        //  lewat tombol; kegagalan di sini diabaikan.)
        void sendToPrinter(buildReceiptBytes(receipt), t.method).catch(() => {});
      }
      setLastSale(receipt);

      resetCart();
      setCustomerName("");
      setFulfillmentType("dine_in");
      setItemFulfillmentOverrides({});
      setQrisReceipt(null);
      setCashReceived(null);
      setCartOpen(false);
    });
  }

  // Diskon hari ini — math di-share dengan server via applyDiscount,
  // jadi angka di cart selalu == angka tersimpan di pos_sales.total.
  // Dihitung sebelum early-return supaya rules-of-hooks tidak komplain.
  const { finalTotal, discountAmount } = useMemo(
    () =>
      activeDiscount
        ? applyDiscount(total, activeDiscount)
        : { finalTotal: total, discountAmount: 0 },
    [total, activeDiscount]
  );
  const grossTotal = total;

  const showEmptyState = products.length === 0 && customItems.length === 0;

  if (showEmptyState) {
    return (
      <PosShell
        outletName={accountName}
        isAdmin={isAdmin}
        active="pos"
        title="POS"
      >
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
      </PosShell>
    );
  }

  const pickerProduct =
    variantPickerFor != null
      ? products.find((p) => p.id === variantPickerFor) ?? null
      : null;

  // Nav items dipakai dua kali: di rail desktop + bottom-nav mobile.
  // Itemnya mirror PosTopNav supaya kasir tidak nyangkut transisi UI.
  const railItems: Array<{
    href: string;
    label: string;
    icon: typeof Home;
    active?: boolean;
    adminOnly?: boolean;
  }> = [
    { href: "/pos", label: "POS", icon: Home, active: true },
    { href: "/pos/produk", label: "Katalog", icon: Settings, adminOnly: true },
    { href: "/pos/shift", label: "Saldo", icon: Wallet },
    { href: "/pos/stok", label: "Stok", icon: Boxes },
    { href: "/pos/pesanan", label: "Pesanan", icon: ShoppingBasket },
    { href: "/pos/riwayat", label: "Riwayat", icon: History },
    { href: "/pos/insights", label: "Insights", icon: BarChart3, adminOnly: true },
  ];
  const visibleRailItems = railItems.filter((it) => !it.adminOnly || isAdmin);

  // Tombol Bayar disabled saat:
  //  - cart kosong / sedang submit
  //  - cash tapi uang diterima < finalTotal
  //  - QRIS + flag receipt aktif tapi belum upload foto
  const payDisabled =
    itemCount === 0 ||
    pending ||
    !customerName.trim() ||
    (payMode === "cash" && (cashReceived == null || cashReceived < finalTotal)) ||
    (QRIS_RECEIPT_AT_CHECKOUT && payMode === "qris" && !qrisReceipt);

  const cartPanel = (
    <div className="flex flex-col h-full bg-card min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Cart
          </p>
          <p className="text-sm font-bold text-foreground">
            {itemCount} item
          </p>
        </div>
        <div className="flex items-center gap-1">
          {itemCount > 0 && (
            <button
              type="button"
              onClick={resetCart}
              className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
            >
              <X size={12} /> Kosongkan
            </button>
          )}
          {/* Close only relevant on mobile sheet */}
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="md:hidden size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
            aria-label="Tutup cart"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {cartLines.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
            <ShoppingCart size={28} className="opacity-40" />
            <p className="text-xs">
              Cart masih kosong. Tap produk untuk mulai.
            </p>
          </div>
        ) : (
          cartLines.map((line) => {
            // Catalog line punya entry di lineByKey — pakai key untuk
            // inc/dec via cart record. Custom line keys-nya `c:<localId>`
            // — render dengan handler customItems.
            const isCustom = line.key.startsWith("c:");
            const customId = isCustom ? line.key.slice(2) : null;
            // Per-item dine/TA override — hanya untuk catalog item
            // (custom item localId tidak stabil cross-render).
            const itemMode: "dine_in" | "take_away" =
              !isCustom && itemFulfillmentOverrides[line.key]
                ? itemFulfillmentOverrides[line.key]
                : fulfillmentType;
            const itemModeOverridden =
              !isCustom &&
              itemFulfillmentOverrides[line.key] !== undefined &&
              itemFulfillmentOverrides[line.key] !== fulfillmentType;
            const toggleItemMode = () => {
              if (isCustom) return;
              setItemFulfillmentOverrides((prev) => {
                const next = { ...prev };
                const newMode: "dine_in" | "take_away" =
                  itemMode === "dine_in" ? "take_away" : "dine_in";
                if (newMode === fulfillmentType) {
                  delete next[line.key];
                } else {
                  next[line.key] = newMode;
                }
                return next;
              });
            };
            return (
              <div
                key={line.key}
                className="rounded-xl border border-border bg-background/40 px-3 py-2 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {line.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatRp(line.subtotal / line.qty)} × {line.qty}
                  </p>
                </div>
                {!isCustom && (
                  <button
                    type="button"
                    onClick={toggleItemMode}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      itemModeOverridden
                        ? "border-pop-amber bg-pop-amber/20 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                    title={
                      itemModeOverridden
                        ? "Override per-item — tap untuk reset ke mode transaksi"
                        : "Mode transaksi — tap untuk override"
                    }
                  >
                    {itemMode === "dine_in" ? "🍽️" : "🥡"}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Kurangi"
                  onClick={() =>
                    customId
                      ? updateCustomQty(customId, -1)
                      : dec(line.key)
                  }
                  className="size-7 rounded-full border border-border text-foreground inline-flex items-center justify-center hover:bg-muted"
                >
                  <Minus size={12} />
                </button>
                <span className="w-5 text-center text-sm font-semibold tabular-nums">
                  {line.qty}
                </span>
                <button
                  type="button"
                  aria-label="Tambah"
                  onClick={() =>
                    customId
                      ? updateCustomQty(customId, 1)
                      : inc(line.key)
                  }
                  className="size-7 rounded-full border border-border text-foreground inline-flex items-center justify-center hover:bg-muted"
                >
                  <Plus size={12} />
                </button>
                {isCustom && customId && (
                  <button
                    type="button"
                    aria-label="Hapus"
                    onClick={() => removeCustom(customId)}
                    className="size-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border bg-card px-4 py-3 space-y-3">
        <div className="space-y-1 tabular-nums">
          {activeDiscount && discountAmount > 0 && (
            <>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatRp(grossTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-success">
                <span>
                  Diskon {Math.round(activeDiscount.percentOff)}%
                  <span className="ml-1 text-[11px] opacity-70">
                    (bulat ke {formatRp(activeDiscount.roundingUnit)} ke bawah)
                  </span>
                </span>
                <span>−{formatRp(discountAmount)}</span>
              </div>
            </>
          )}
          <div
            className={`flex items-center justify-between ${
              activeDiscount && discountAmount > 0
                ? "pt-1 border-t border-border"
                : ""
            }`}
          >
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              {activeDiscount && discountAmount > 0 ? "Total bayar" : "Total"}
            </span>
            <span className="text-lg font-bold text-foreground">
              {formatRp(finalTotal)}
            </span>
          </div>
        </div>

        {/* Atas nama pemesan — wajib + auto-focus saat cart >= 1. */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Atas nama <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nama pemesan…"
            className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Fulfillment picker — dine-in / take-away per transaksi. */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Mode
          </p>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/40 border border-border">
            {(["dine_in", "take_away"] as const).map((m) => {
              const active = fulfillmentType === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFulfillmentType(m)}
                  className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "dine_in" ? "🍽️ Dine-in" : "🥡 Take-away"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pay mode picker — 3 kolom: Cash / QRIS / Pesanan. */}
        <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-muted/40 border border-border">
          {(["cash", "qris", "pending"] as const).map((m) => {
            const active = payMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setPayMode(m)}
                className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? m === "cash"
                      ? "bg-success text-white shadow-sm"
                      : m === "qris"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-pop-amber text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "cash" ? "Cash" : m === "qris" ? "QRIS" : "Pesanan"}
              </button>
            );
          })}
        </div>

        {/* Inline payment surface — replaces the old confirm modal. */}
        {payMode === "cash" && (
          <CashReceivedField
            total={finalTotal}
            value={cashReceived}
            onChange={setCashReceived}
          />
        )}
        {payMode === "qris" && QRIS_RECEIPT_AT_CHECKOUT && (
          <div>
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
              Wajib sebagai bukti audit.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={payDisabled}
          onClick={() => submit(payMode)}
          className={`w-full h-12 rounded-xl font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
            payMode === "cash"
              ? "bg-success text-white"
              : payMode === "qris"
                ? "bg-primary text-primary-foreground"
                : "bg-pop-amber text-foreground"
          }`}
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          {payMode === "pending"
            ? `Buat pesanan ${formatRp(finalTotal)}`
            : `Bayar ${formatRp(finalTotal)}`}
        </button>
      </div>
    </div>
  );

  return (
    <div
      data-pos-shell
      data-pos-palette="pink"
      className="min-h-screen flex flex-col md:grid md:h-screen md:grid-cols-[64px_minmax(0,1fr)_360px] md:grid-rows-[56px_minmax(0,1fr)] bg-background"
    >
      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="md:col-span-3 h-14 border-b border-border bg-card flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0 z-20">
        <div className="size-9 rounded-xl bg-primary text-primary-foreground inline-flex items-center justify-center font-bold text-base shrink-0">
          Z
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
            POS
          </p>
          <p className="font-semibold text-foreground text-sm leading-tight truncate">
            {accountName}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/15 text-success border border-success/30 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
          Shift aktif
        </span>
        <button
          type="button"
          onClick={() => setStrukSettingsOpen(true)}
          className="size-9 rounded-full border border-border bg-card text-foreground inline-flex items-center justify-center shrink-0"
          aria-label="Setelan struk"
          title="Setelan struk"
        >
          <Printer size={16} />
        </button>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="md:hidden relative size-9 rounded-full border border-border bg-card text-foreground inline-flex items-center justify-center shrink-0"
          aria-label="Buka cart"
        >
          <ShoppingCart size={16} />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center border-2 border-card">
              {itemCount}
            </span>
          )}
        </button>
      </header>

      {/* ── Left rail (desktop) ───────────────────────────── */}
      <aside className="hidden md:flex flex-col items-stretch gap-1 border-r border-border bg-card py-3 px-2 overflow-y-auto">
        {visibleRailItems.map((it) => {
          const Icon = it.icon;
          return (
            <PosNavLink
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                it.active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              aria-current={it.active ? "page" : undefined}
            >
              <Icon size={18} />
              {it.label}
            </PosNavLink>
          );
        })}
      </aside>

      {/* ── Main area: search + product grid ──────────────── */}
      <main className="min-w-0 overflow-y-auto pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        <DiscountBanner
          activeDiscount={activeDiscount}
          isAdmin={isAdmin}
          bankAccountId={bankAccountId}
        />
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur p-3 border-b border-border">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari produk…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-3">
          {filteredProducts.map((p) => {
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
              {/* role=button + onKeyDown — bukan <button> — supaya
                  inner Catatan/+/− buttons valid (HTML melarang
                  nested <button>). */}
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
                className={`w-full min-h-[104px] sm:min-h-[120px] rounded-2xl border text-left p-2.5 sm:p-3 transition-colors active:bg-muted ${
                  stockState.kind === "habis"
                    ? "border-dashed border-border bg-muted/30 opacity-60 cursor-not-allowed grayscale-[20%]"
                    : selected
                    ? "border-primary bg-primary/5 cursor-pointer"
                    : "border-border bg-card cursor-pointer"
                }`}
              >
                <div className="font-semibold text-foreground text-sm sm:text-base leading-tight pr-8">
                  {p.name}
                  {/* Sisa stok produk ditampilkan inline di samping
                      nama, mis. "BCB (12)" — kasir tidak perlu buka
                      /pos/stok untuk cek kapasitas. */}
                  {(() => {
                    const r = productRemainingStock(p, stockByKey, cart);
                    return r != null ? (
                      <span className="ml-1 font-normal text-muted-foreground tabular-nums">
                        ({r})
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  {p.isOpenPrice
                    ? "Harga custom"
                    : hasVariants
                      ? variantPriceLabel(p.variants)
                      : formatRp(p.price)}
                </div>
                {stockState.kind === "low" && (
                  <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-pop-pink">
                    Sisa {stockState.remaining}
                  </div>
                )}
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
                            remaining: variantRemainingStock(
                              p,
                              v.id,
                              stockByKey,
                              cart
                            ),
                          }))
                          .filter((x) => x.qty > 0)
                          .map(({ v, qty, remaining }) => (
                            <li
                              key={v.id}
                              className="text-xs text-primary tabular-nums"
                            >
                              <span className="font-semibold">{qty}×</span>{" "}
                              {v.name}
                              {remaining != null && (
                                <span className="ml-1 text-muted-foreground font-normal">
                                  ({remaining})
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
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

        {filteredProducts.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Tidak ada produk yang cocok dengan &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </main>

      {/* ── Cart panel: persistent on desktop ───────────── */}
      <aside className="hidden md:flex md:flex-col border-l border-border min-h-0">
        {cartPanel}
      </aside>

      {/* ── Cart sheet: mobile only, full-screen drawer ─── */}
      {cartOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col bg-background">
          {cartPanel}
        </div>
      )}

      {/* ── Mobile bottom nav (sub-pages POS) ────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch">
          {visibleRailItems.map((it) => {
            const Icon = it.icon;
            return (
              <PosNavLink
                key={it.href}
                href={it.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  it.active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-current={it.active ? "page" : undefined}
              >
                <Icon size={18} />
                {it.label}
              </PosNavLink>
            );
          })}
        </div>
      </nav>

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

      {lastSale && (
        <ReceiptSuccessDialog data={lastSale} onClose={() => setLastSale(null)} />
      )}

      {strukSettingsOpen && (
        <StrukSettingsDialog
          bankAccountId={bankAccountId}
          brand={accountName}
          branch={branch}
          initialContent={receiptContent}
          now={new Date()}
          onClose={() => setStrukSettingsOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Banner thin di atas grid produk. Kalau ada campaign aktif untuk
 * hari ini → notice hijau. Kalau tidak ada dan caller admin →
 * tombol untuk aktivasi preset 10%/floor/Rp 1.000 yang juga
 * meng-update transaksi yang sudah masuk hari ini.
 */
function DiscountBanner({
  activeDiscount,
  isAdmin,
  bankAccountId,
}: {
  activeDiscount: ActiveDiscountProp | null;
  isAdmin: boolean;
  bankAccountId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (activeDiscount) {
    return (
      <div className="px-3 pt-3">
        <div className="rounded-xl border-2 border-success/40 bg-success/10 px-3 py-2 text-xs text-foreground flex items-center gap-2">
          <Sparkles size={14} className="text-success shrink-0" />
          <span>
            <strong className="font-semibold">
              Diskon {Math.round(activeDiscount.percentOff)}% aktif
            </strong>{" "}
            — pembulatan ke bawah Rp{" "}
            {activeDiscount.roundingUnit.toLocaleString("id-ID")}
            {activeDiscount.note ? ` · ${activeDiscount.note}` : ""}
          </span>
        </div>
      </div>
    );
  }
  if (!isAdmin) return null;
  return (
    <div className="px-3 pt-3">
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-foreground flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          Belum ada diskon aktif hari ini.
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await activateTodayDiscountPreset(bankAccountId);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              const n = res.data?.retroUpdatedCount ?? 0;
              toast.success(
                res.data?.created
                  ? `Diskon 10% aktif${n > 0 ? ` · ${n} transaksi hari ini dijadikan diskon` : ""}`
                  : "Diskon hari ini sudah aktif"
              );
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-2.5 h-7 text-[11px] font-semibold disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          Aktifkan 10% hari ini
        </button>
      </div>
    </div>
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

/**
 * Sisa stok (setelah cart) untuk satu varian. Return null kalau produk
 * tidak tracked / open-price — caller skip render badge "(N)". Logic
 * mirror VariantPickerDialog supaya angka di card + picker konsisten.
 */
/**
 * Sisa stok produk (setelah cart) — agregat dari semua varian kalau
 * stok dilacak per-variant. Return null kalau produk tidak tracked /
 * open-price → caller skip render "(N)".
 */
function productRemainingStock(
  p: PosProduct,
  stockByKey: Record<string, number> | null,
  cart: Record<string, number>
): number | null {
  if (!stockByKey || !p.trackStock || p.isOpenPrice) return null;
  if (p.variants.length === 0) {
    const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
    const inCart = cart[cartKey(p.id)] ?? 0;
    return Math.max(0, onHand - inCart);
  }
  if (p.stockAggregateVariants) {
    const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
    let inCart = 0;
    for (const v of p.variants) inCart += cart[cartKey(p.id, v.id)] ?? 0;
    return Math.max(0, onHand - inCart);
  }
  // Per-variant tracking → sum semua varian.
  let total = 0;
  for (const v of p.variants) {
    const onHand = stockByKey[cartKey(p.id, v.id)] ?? 0;
    const inCart = cart[cartKey(p.id, v.id)] ?? 0;
    total += Math.max(0, onHand - inCart);
  }
  return total;
}

function variantRemainingStock(
  p: PosProduct,
  variantId: string,
  stockByKey: Record<string, number> | null,
  cart: Record<string, number>
): number | null {
  if (!stockByKey || !p.trackStock || p.isOpenPrice) return null;
  if (p.stockAggregateVariants) {
    const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
    let inCart = 0;
    for (const v of p.variants) inCart += cart[cartKey(p.id, v.id)] ?? 0;
    return Math.max(0, onHand - inCart);
  }
  const onHand = stockByKey[cartKey(p.id, variantId)] ?? 0;
  const inCart = cart[cartKey(p.id, variantId)] ?? 0;
  return Math.max(0, onHand - inCart);
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
                    <span className="truncate">
                      {v.name}
                      {/* "(N)" — sisa stok varian setelah cart, agar
                          kasir tahu kapasitas tanpa buka /pos/stok. */}
                      {remaining != null && (
                        <span className="ml-1 font-normal text-muted-foreground tabular-nums">
                          ({remaining})
                        </span>
                      )}
                    </span>
                    {habis && (
                      <span className="rounded-full border border-foreground/40 bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Habis
                      </span>
                    )}
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

