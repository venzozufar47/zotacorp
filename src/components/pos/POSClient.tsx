"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { productImageSrc } from "@/lib/pos/product-images";
import { ArrowLeft } from "lucide-react";
import { PosNavLink } from "./PosNavLink";
import { PosShell } from "./PosShell";
import { PosLogo } from "./PosLogo";
import { PosOutletSwitch } from "./PosOutletSwitch";
import { PosMamayaFlowDialog } from "./PosMamayaFlowDialog";
import { posPalette } from "@/lib/pos/branch";
import "./workstation.css";
import {
  BarChart3,
  Boxes,
  CupSoda,
  History,
  PartyPopper,
  PenLine,
  StickyNote,
  Home,
  Loader2,
  Minus,
  Plus,
  Search,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

/** Ikon pengganti foto untuk produk yang memang tidak punya foto. */
const PRODUCT_ICONS: Record<string, typeof CupSoda> = {
  drinks: CupSoda,
  lilin: PartyPopper,
  "tambah nama": PenLine,
};
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
import {
  cashierCanDisable,
  computeItemPromos,
  describeDiscount,
  jakartaNowParts,
  MAX_PROMO_VOUCHERS,
  pickBestCampaign,
  promoShortName,
  voucherOnlyShortfall,
  voucherMixedProblem,
  MAX_PROMO_PEOPLE,
  type JakartaNow,
  type PickedCampaign,
  type PromoLine,
} from "@/lib/pos/discount";
import type { PosDiscountCampaign } from "@/lib/actions/pos-discount.actions";
import { QRIS_RECEIPT_AT_CHECKOUT } from "@/lib/pos/flags";
import {
  QrisVerificationPicker,
  qrisVerificationOk,
  type QrisVerification,
} from "./QrisVerificationPicker";
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
import { resolveCashierName } from "@/lib/pos/cashier-schedule";
import { ServiceLevelHero } from "@/components/pos/ServiceLevelHero";
import type { ServiceLevelSummary } from "@/lib/actions/pos-service-level.actions";
import { DailyRevenueTargetCard } from "@/components/pos/DailyRevenueTargetCard";
import { FeedbackTargetCard } from "@/components/pos/FeedbackTargetCard";
import { ReadyCakePicker, ReadyCakeTile, type ReadyCakeSummary } from "@/components/pos/ReadyCakePicker";
import type { ReadyCakeItem } from "@/lib/actions/pos-ready-cake.actions";
import type { PosFeedbackToday } from "@/lib/actions/feedback.actions";
import type { PosDailyRevenueSummary } from "@/lib/actions/pos.actions";
import {
  SUGAR_LEVELS,
  SUGAR_LEVEL_LABELS,
  isSugarLevel,
  type SugarLevel,
} from "@/lib/pos/sugar-levels";
import { ReceiptSuccessDialog } from "./ReceiptSuccessDialog";
import { StrukSettingsDialog } from "./StrukSettingsDialog";
import { PosTopbarProvider } from "./pos-topbar-context";
import {
  BIG_FREE_ORDER_MIN,
  looksLikeMamaya,
  saveMamayaHandoff,
  takeMamayaHandoff,
  type HandoffItem,
} from "@/lib/pos/mamaya-guard";

/** Dipakai sebagai bawaan agar identitas array tidak berganti tiap render. */
const NO_CAMPAIGNS: PosDiscountCampaign[] = [];

interface Props {
  bankAccountId: string;
  accountName: string;
  /** Base path publik cabang, mis. "/pospare". Semua nav link relatif ini. */
  basePath: string;
  /** Cabang default rekening — dicetak di header struk. */
  branch?: string | null;
  /** Nama kasir (opsional) — dicetak di struk. */
  cashierName?: string | null;
  /** Mode shift menyala: nama di struk = kasir shift (atau akun login bila insidentil), TIDAK mengikuti jadwal. */
  fixedCashierName?: string | null;
  /** Kendali shift di top bar (pill + Tutup shift / Keluar insidentil). undefined = tampilan lama. */
  shiftSlot?: React.ReactNode | null;
  /** Ringkasan Service Level dari snapshot. null = fitur mati / gagal
   *  dibaca — komponennya tidak dirender, layar kasir tetap utuh. */
  serviceLevel?: ServiceLevelSummary | null;
  /** Omset hari ini vs target (migrasi 146). null = target belum di-set
   *  admin / gagal dibaca — kartu tidak dirender. */
  dailyRevenue?: PosDailyRevenueSummary | null;
  feedbackToday?: PosFeedbackToday | null;
  /** Daftar ready cake cabang ini; null = cabang tanpa SKU Ready Cake (tombol Ready Cake tidak dirender). */
  readyCake?: ReadyCakeSummary | null;
  /** Produk yang tidak dijual di kasir tetapi stoknya dipantau (mis. Freebies Tiramisu). Hanya tampilan. */
  monitorStock?: Array<{ name: string; onHand: number }>;
  /** Konten struk bersama (server, per rekening). */
  receiptContent: ReceiptContent;
  products: PosProduct[];
  /** Admin-only UI affordances (link ke /pos/produk, empty-state CTA). */
  isAdmin: boolean;
  /** On-hand stok per SKU keyed by `cartKey(productId, variantId|null)`.
   *  null = produk tidak tracked / stok belum di-fetch (bypass gating). */
  stockByKey: Record<string, number> | null;
  /** Kampanye diskon aktif yang tanggalnya mencakup hari ini untuk rekening ini. Layar menyaring "berlaku sekarang"
   *  (jam & hari) dengan jam perangkat; server tetap menentukan hasil akhir saat bayar. */
  campaigns?: PosDiscountCampaign[];
}

/** Ready cake yang dipilih kasir ke keranjang (satu kue = satu baris, harga dari pesanan kue). */
interface ReadyLine {
  orderId: string;
  name: string;
  price: number;
  isDiy: boolean;
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

/** Cart key scheme: "p:<productId>[|v:<variantId>][|s:<sugarLevel>]".
 *
 *  Segmen gula IKUT jadi bagian key supaya satu minuman dengan tingkat
 *  gula berbeda jadi baris terpisah. Cart adalah `Record<key, qty>`,
 *  jadi tanpa segmen ini 2 gelas beda gula akan menyatu jadi satu baris
 *  qty 2 dan salah satu tingkat gulanya hilang.
 *
 *  PENTING: `stockByKey` TIDAK memakai segmen gula (stok tidak peduli
 *  gula), jadi lookup stok selalu pakai key tanpa `|s:` — lihat
 *  `cartQtyForSku` untuk menjumlahkan qty lintas tingkat gula. */
function cartKey(
  productId: string,
  variantId?: string | null,
  sugarLevel?: SugarLevel | null
) {
  let k = `p:${productId}`;
  if (variantId) k += `|v:${variantId}`;
  if (sugarLevel) k += `|s:${sugarLevel}`;
  return k;
}

function parseCartKey(key: string): {
  productId: string;
  variantId: string | null;
  sugarLevel: SugarLevel | null;
} {
  let productId = "";
  let variantId: string | null = null;
  let sugarLevel: SugarLevel | null = null;
  for (const part of key.split("|")) {
    if (part.startsWith("p:")) productId = part.slice(2);
    else if (part.startsWith("v:")) variantId = part.slice(2);
    else if (part.startsWith("s:")) {
      const s = part.slice(2);
      if (isSugarLevel(s)) sugarLevel = s;
    }
  }
  return { productId, variantId, sugarLevel };
}

/** Total qty satu SKU (produk + varian) di cart, MENJUMLAHKAN semua
 *  tingkat gula. Stok dan tampilan qty tidak peduli gula, sedangkan
 *  `cart[cartKey(...)]` hanya cocok persis satu tingkat gula — memakai
 *  lookup langsung di sana akan meng-undercount dan bikin stok kejual
 *  melebihi on-hand. */
function cartQtyForSku(
  cart: Record<string, number>,
  productId: string,
  variantId?: string | null
): number {
  const base = cartKey(productId, variantId);
  let n = 0;
  for (const [k, q] of Object.entries(cart)) {
    if (k === base || k.startsWith(`${base}|s:`)) n += q;
  }
  return n;
}

/** Unit yang dijual = varian (kalau produk punya varian), selain itu
 *  produknya sendiri. Cocok dengan aturan resolusi di server. */
function sugarRequiredFor(p: PosProduct, variantId: string | null): boolean {
  if (variantId)
    return p.variants.find((v) => v.id === variantId)?.requiresSugarLevel ?? false;
  return p.requiresSugarLevel;
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
  basePath,
  branch = null,
  cashierName = null,
  fixedCashierName = null,
  shiftSlot,
  serviceLevel = null,
  dailyRevenue = null,
  feedbackToday = null,
  readyCake = null,
  monitorStock = [],
  receiptContent,
  products,
  isAdmin,
  stockByKey,
  campaigns = NO_CAMPAIGNS,
}: Props) {
  // Catalog cart: Record<cartKey, qty>.
  const [cart, setCart] = useState<Record<string, number>>({});
  // Harga diskon per baris cart (mis. produk menjelang expired).
  // Record<cartKey, hargaSatuanDiskon>. Sengaja atribut baris katalog —
  // bukan item custom — supaya product_id tetap terkirim sehingga stok
  // berkurang dan stock opname tidak selisih.
  const [discountByKey, setDiscountByKey] = useState<Record<string, number>>({});
  // Baris cart yang sedang diatur diskonnya; null = dialog tertutup.
  const [discountFor, setDiscountFor] = useState<string | null>(null);
  // Kampanye bermode "kasir memilih" yang sedang diterapkan kasir.
  const [chosenCampaignId, setChosenCampaignId] = useState<string | null>(null);
  // Promo otomatis (mis. soft opening) yang dimatikan kasir untuk transaksi ini. Bawaan kosong = semua promo menyala;
  // kembali kosong setelah transaksi selesai/keranjang dikosongkan.
  const [disabledCampaignIds, setDisabledCampaignIds] = useState<string[]>([]);
  // Voucher promo soft opening yang berhak diklaim di nota ini (kasir yang mengisi; antrean sudah memilah pembeli).
  const [promoVouchers, setPromoVouchers] = useState(0);
  const [promoPeople, setPromoPeople] = useState(1);
  // Kasir melepas kunci "hanya voucher" untuk nota ini; kembali terkunci setelah transaksi selesai.
  const [voucherLockOff, setVoucherLockOff] = useState(false);
  // Jam berjalan (tiap 30 dtk) supaya kampanye berjam (happy hour) mulai/berhenti sendiri tanpa muat ulang.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (campaigns.length === 0) return;
    const t = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [campaigns.length]);
  const liveNow = useMemo(() => jakartaNowParts(new Date(clock)), [clock]);
  const [customItems, setCustomItems] = useState<CustomLine[]>([]);
  // Pengaman pencampuran Mamaya di POS Semarang (lihat lib/pos/mamaya-guard.ts).
  const isSemarangPos = branch === "Semarang";
  // Item bebas berbau Mamaya yang menunggu keputusan kasir; null = tidak ada.
  const [mamayaPrompt, setMamayaPrompt] = useState<HandoffItem | null>(null);
  // Pesanan besar berisi item bebas menunggu kasir memilih asal; menyimpan metode bayar yang tertunda.
  const [originPrompt, setOriginPrompt] = useState<PaymentMethod | "pending" | null>(null);
  // Kasir sudah menegaskan "Semarang" untuk keranjang ini (di-reset saat keranjang dikosongkan).
  const originConfirmedRef = useRef(false);
  // Lanjutan dari POS Semarang: item bebas yang dipindahkan kasir masuk ke keranjang Mamaya.
  useEffect(() => {
    if (branch !== "Mamaya") return;
    const items = takeMamayaHandoff();
    if (items.length === 0) return;
    // sessionStorage = sistem eksternal yang hanya terbaca di klien: membaca di initializer useState merusak hidrasi SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomItems(items.map((i) => ({ localId: crypto.randomUUID(), ...i })));
    toast.success(`${items.length} item dipindahkan dari POS Semarang`);
  }, [branch]);
  const [readyLines, setReadyLines] = useState<ReadyLine[]>([]);
  const [readyPickerOpen, setReadyPickerOpen] = useState(false);
  // QRIS: kasir memilih "ada verifikasi bunyi BukuPay" (tanpa foto) atau "tidak ada bunyi" (foto bukti
  // wajib) — state-nya di-reset setiap kali konfirmasi dibuka/ditutup.
  const [qrisVerification, setQrisVerification] = useState<QrisVerification | null>(null);
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
  // Pemilih tingkat gula (minuman). null = tertutup. Menutup dialog =
  // BATAL menambah — item tidak boleh masuk cart tanpa tingkat gula.
  const [sugarPickerFor, setSugarPickerFor] = useState<{
    productId: string;
    variantId: string | null;
  } | null>(null);
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

  const { total, readyTotal, itemCount, cartLines, qtyByProductId } = useMemo(() => {
    let total = 0;
    let readyTotal = 0;
    let itemCount = 0;
    const cartLines: Array<{
      key: string;
      /** Produk katalog; null untuk custom/ready cake. */
      productId: string | null;
      /** Nama untuk LAYAR (sudah termasuk label gula). */
      name: string;
      /** Nama tanpa label gula — dipakai struk, yang mencetak gula di
       *  baris terpisah agar tidak kena truncation kolom harga. */
      baseName: string;
      optionsLabel: string | null;
      qty: number;
      subtotal: number;
      custom: boolean;
      /** Ready cake dari stok toko: qty tetap 1, tanpa diskon/override. */
      ready: boolean;
      /** Harga satuan efektif (sudah diskon bila ada). */
      unitPrice: number;
      /** Harga normal; non-null hanya bila baris ini didiskon. */
      originalPrice: number | null;
    }> = [];
    const qtyByProductId = new Map<string, number>();
    for (const [key, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      // `lineByKey` di-index tanpa segmen gula, jadi lookup pakai base
      // key lalu label gulanya ditempel ke nama baris.
      const { productId, variantId, sugarLevel } = parseCartKey(key);
      const info = lineByKey.get(cartKey(productId, variantId));
      if (!info) continue;
      const optionsLabel = sugarLevel ? SUGAR_LEVEL_LABELS[sugarLevel] : null;
      const name = optionsLabel ? `${info.name} — ${optionsLabel}` : info.name;
      // Diskon hanya berlaku kalau nilainya benar-benar di bawah harga
      // normal — sama dengan aturan server, supaya total di layar tak
      // pernah beda dengan yang dihitung ulang saat submit.
      const disc = discountByKey[key];
      const discounted = disc != null && disc < info.price ? disc : null;
      const unitPrice = discounted ?? info.price;
      const subtotal = unitPrice * qty;
      total += subtotal;
      itemCount += qty;
      cartLines.push({
        key,
        productId: info.productId,
        name,
        baseName: info.name,
        optionsLabel,
        qty,
        subtotal,
        custom: false,
        ready: false,
        unitPrice,
        originalPrice: discounted != null ? info.price : null,
      });
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
        productId: null,
        name: c.name,
        baseName: c.name,
        optionsLabel: null,
        qty: c.qty,
        subtotal,
        custom: true,
        ready: false,
        unitPrice: c.price,
        originalPrice: null,
      });
    }
    for (const r of readyLines) {
      // Ready cake = omset kue, bukan omset POS: tidak masuk `total` (dasar diskon), tapi tetap uang yang diterima kasir.
      readyTotal += r.price;
      itemCount += 1;
      cartLines.push({
        key: `r:${r.orderId}`,
        productId: null,
        name: `Ready Cake — ${r.name}${r.isDiy ? " (DIY)" : ""}`,
        baseName: `Ready Cake — ${r.name}`,
        optionsLabel: null,
        qty: 1,
        subtotal: r.price,
        custom: false,
        ready: true,
        unitPrice: r.price,
        originalPrice: null,
      });
    }
    return { total, readyTotal, itemCount, cartLines, qtyByProductId };
  }, [cart, customItems, readyLines, lineByKey, discountByKey]);

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
    const aggregate =
      product.stockAggregateVariants && product.variants.length > 0;
    // Pool stok yang ditarik baris ini: level produk kalau agregat,
    // selain itu level SKU (produk+varian). Key stok tidak pernah
    // menyertakan segmen gula.
    const onHand = aggregate
      ? stockByKey[cartKey(productId, null)] ?? 0
      : stockByKey[cartKey(productId, variantId)] ?? 0;
    // Semua baris cart LAIN yang menarik dari pool yang sama — termasuk
    // baris SKU yang sama dengan tingkat gula berbeda. Tanpa ini, satu
    // SKU berstok 3 bisa terjual 3× per tingkat gula.
    let othersFromSamePool = 0;
    for (const [k, q] of Object.entries(snapshot)) {
      if (k === key) continue;
      const other = parseCartKey(k);
      if (other.productId !== productId) continue;
      if (!aggregate && other.variantId !== variantId) continue;
      othersFromSamePool += q;
    }
    return Math.max(0, onHand - othersFromSamePool);
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
      if (n <= 0) {
        delete next[key];
        // Baris habis → diskonnya ikut dibuang, jangan sampai nyangkut
        // dan diam-diam berlaku lagi saat produk yang sama ditambah.
        setDiscountByKey((d) => {
          if (d[key] === undefined) return d;
          const nd = { ...d };
          delete nd[key];
          return nd;
        });
      } else next[key] = n;
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
      return onHand - cartQtyForSku(cart, p.id) > 0;
    }
    if (p.stockAggregateVariants) {
      const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
      let inCart = 0;
      for (const v of p.variants) inCart += cartQtyForSku(cart, p.id, v.id);
      return onHand - inCart > 0;
    }
    // Per-variant stok: at least one variant has remaining capacity.
    return p.variants.some((v) => {
      const onHand = stockByKey[cartKey(p.id, v.id)] ?? 0;
      return onHand - cartQtyForSku(cart, p.id, v.id) > 0;
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
      // Minuman tanpa varian → pilih tingkat gula dulu.
      if (sugarRequiredFor(p, null)) {
        setSugarPickerFor({ productId: p.id, variantId: null });
        return;
      }
      inc(cartKey(p.id));
      return;
    }
    // Kalau cuma 1 varian aktif, langsung inc tanpa modal — tidak ada
    // ambiguitas. (Admin mungkin hapus varian lain, sisakan 1.)
    if (p.variants.length === 1) {
      const only = p.variants[0];
      if (sugarRequiredFor(p, only.id)) {
        setSugarPickerFor({ productId: p.id, variantId: only.id });
        return;
      }
      inc(cartKey(p.id, only.id));
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
    if (isSemarangPos && looksLikeMamaya(name)) {
      setMamayaPrompt({ name: name.trim(), price, qty });
      return;
    }
    addCustomLine(name, price, qty);
  }

  function addCustomLine(name: string, price: number, qty: number) {
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

  function addReadyCake(it: ReadyCakeItem) {
    setReadyLines((arr) =>
      arr.some((r) => r.orderId === it.id)
        ? arr
        : [...arr, { orderId: it.id, name: it.name, price: it.priceIdr, isDiy: it.isDiy }]
    );
  }

  function resetCart() {
    setCart({});
    setCustomItems([]);
    setReadyLines([]);
    setDiscountByKey({});
    setChosenCampaignId(null);
    setDisabledCampaignIds([]);
    setPromoVouchers(0);
    setPromoPeople(1);
    setVoucherLockOff(false);
    originConfirmedRef.current = false;
  }

  /** Keranjang hanya berisi item bebas murni → seluruhnya bisa dipindah ke POS Mamaya tanpa kehilangan item Semarang. */
  const onlyFreeItems =
    customItems.length > 0 &&
    customItems.every((c) => !c.productId) &&
    Object.values(cart).every((q) => q <= 0) &&
    readyLines.length === 0;

  function moveToMamaya(items: HandoffItem[]) {
    if (!saveMamayaHandoff(items)) {
      toast.error("Browser tidak bisa menyimpan data pindahan — input ulang di POS Mamaya");
    }
    router.push("/posmamaya");
  }

  function submit(method: PaymentMethod | "pending") {
    const catalogItems: PosSaleItemInput[] = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const { productId, variantId, sugarLevel } = parseCartKey(key);
        // Kirim customPrice hanya kalau diskonnya benar-benar di bawah
        // harga normal; server menolak yang tidak.
        const info = lineByKey.get(cartKey(productId, variantId));
        const disc = discountByKey[key];
        const customPrice =
          info && disc != null && disc < info.price ? disc : undefined;
        const base = variantId
          ? { productId, variantId, qty, sugarLevel }
          : { productId, qty, sugarLevel };
        return customPrice !== undefined ? { ...base, customPrice } : base;
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
      ...readyLines.map((r) => ({ readyCakeOrderId: r.orderId, qty: 1 })),
    ];
    if (items.length === 0) return;
    if (!customerName.trim()) {
      toast.error("Atas nama pemesan wajib diisi");
      return;
    }
    if (
      QRIS_RECEIPT_AT_CHECKOUT &&
      method === "qris" &&
      !qrisVerificationOk(qrisVerification, qrisReceipt)
    ) {
      toast.error(
        qrisVerification === "photo"
          ? "Tidak ada bunyi BukuPay — foto bukti pembayaran wajib"
          : "Pilih dulu: sudah ada verifikasi bunyi BukuPay atau tidak"
      );
      return;
    }
    // Pesanan besar berisi item bebas di POS Semarang: kasir wajib menegaskan asalnya (Semarang / Mamaya) dulu.
    const freeTotal = customItems.reduce((s, c) => (c.productId ? s : s + c.price * c.qty), 0);
    if (isSemarangPos && !originConfirmedRef.current && freeTotal >= BIG_FREE_ORDER_MIN) {
      setOriginPrompt(method);
      return;
    }
    startTransition(async () => {
      const res = await createPosSale({
        bankAccountId,
        paymentMethod: method,
        items,
        customerName: customerName.trim(),
        fulfillmentType,
        qrisVerification:
          method === "qris" ? qrisVerification ?? undefined : undefined,
        campaignId: chosenCampaignId,
        disabledCampaignIds: disabledCampaignIds.length > 0 ? disabledCampaignIds : undefined,
        promoVouchers: promoVouchers > 0 ? promoVouchers : undefined,
        promoPeople: promoPeople > 1 ? promoPeople : undefined,
        voucherLockOff: voucherLockOff || undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menyimpan penjualan");
        return;
      }
      // Foto hanya ada (dan diunggah) kalau tidak ada verifikasi bunyi.
      if (
        QRIS_RECEIPT_AT_CHECKOUT &&
        method === "qris" &&
        qrisVerification === "photo" &&
        qrisReceipt &&
        res.data?.saleId
      ) {
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
          setQrisVerification(null);
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

      // Struk: hanya bila sistem struk rekening ini aktif.
      // Tangkap snapshot SEBELUM reset (uang tunai/kembalian hanya ada di
      // client state). Auto-cetak bila diaktifkan & sudah lunas.
      const rc = receiptContent;
      if (rc.enabled) {
      const t = loadReceiptTransport();
      const now = new Date();
      const effBranch = rc.showBranch ? rc.branchOverride.trim() || branch : null;
      const receipt: ReceiptData = {
        header: rc.header,
        branch: effBranch,
        address: rc.address,
        datetime: formatReceiptDateTime(now),
        // Mode shift: kasir shift. Selain itu cabang Pare pakai jadwal; cabang lain nama akun login.
        cashierName: fixedCashierName ?? resolveCashierName(branch, now, cashierName),
        customerName: customerName.trim(),
        fulfillment: fulfillmentType,
        items: cartLines.map((l) => ({
          name: l.baseName,
          qty: l.qty,
          subtotal: l.subtotal,
          note: l.optionsLabel,
        })),
        grossTotal: total + readyTotal,
        discountAmount,
        total: payTotal,
        method,
        cashReceived: method === "cash" ? cashReceived : null,
        change:
          method === "cash" && cashReceived != null
            ? cashReceived - payTotal
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
      }

      resetCart();
      setCustomerName("");
      setFulfillmentType("dine_in");
      setQrisReceipt(null);
      setQrisVerification(null);
      setCashReceived(null);
      setCartOpen(false);
    });
  }

  // Kampanye terbaik untuk pembeli — pemilihan & math di-share dengan server (pickBestCampaign/applyDiscount),
  // jadi angka di cart == angka tersimpan di pos_sales.total. Dihitung sebelum early-return (rules-of-hooks).
  const promoLines = useMemo(
    () =>
      cartLines
        .filter((l) => l.productId && !l.custom && !l.ready && l.originalPrice == null)
        .map((l) => ({ productId: l.productId, unitPrice: l.unitPrice, qty: l.qty, key: l.key })),
    [cartLines]
  );
  const picked = useMemo(
    () =>
      pickBestCampaign(
        campaigns.filter((c) => !(disabledCampaignIds.includes(c.id) && cashierCanDisable(c))),
        total,
        liveNow,
        chosenCampaignId,
        promoLines,
        promoVouchers,
        promoPeople
      ),
    [campaigns, total, liveNow, chosenCampaignId, promoLines, disabledCampaignIds, promoVouchers, promoPeople]
  );
  // Nota voucher tak boleh dicampur produk lain (semua baris: katalog, custom, ready cake). Server menegakkan hal yang sama.
  const voucherMixedText = useMemo(() => {
    const lines = [
      ...cartLines.map((l) => ({ productId: l.productId, qty: l.qty })),
      ...customItems.map((c) => ({ productId: c.productId ?? null, qty: c.qty })),
      ...readyLines.map(() => ({ productId: null, qty: 1 })),
    ];
    return voucherMixedProblem(campaigns, liveNow, lines, promoVouchers, voucherLockOff)
      ? "Nota voucher tak bisa digabung produk lain. Pisahkan nota."
      : null;
  }, [campaigns, liveNow, cartLines, customItems, readyLines, promoVouchers, voucherLockOff]);
  // Kebijakan hanya-voucher (mis. Matcha Strawberry / Black Forest Semarang): pcs di keranjang tak boleh melebihi voucher,
  // dan mematikan promo tak membuka kuncinya. Server menegakkan hal yang sama saat bayar.
  const voucherLockText = useMemo(() => {
    if (voucherLockOff) return null;
    const lines = [
      ...cartLines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: l.qty })),
      ...customItems.filter((c) => c.productId).map((c) => ({ productId: c.productId ?? null, qty: c.qty })),
    ];
    const bad = voucherOnlyShortfall(campaigns, liveNow, lines, promoVouchers, disabledCampaignIds);
    if (!bad) return null;
    const names = bad.productIds.map((id) => products.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
    return `${names} hanya bisa dibeli dengan voucher: ${bad.pcs} pcs di keranjang, voucher ${bad.allowed}. Isi voucher atau hapus dari keranjang.`;
  }, [campaigns, liveNow, cartLines, customItems, promoVouchers, disabledCampaignIds, products, voucherLockOff]);
  const voucherBlockText = voucherLockText ?? voucherMixedText;
  const promoNameById = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  // `finalTotal` = bagian POS setelah diskon (== pos_sales.total). `payTotal` = yang harus dibayar pembeli,
  // termasuk ready cake yang dibukukan terpisah sebagai omset kue.
  const finalTotal = picked ? picked.finalTotal : total;
  const discountAmount = picked ? picked.discountAmount : 0;
  const grossTotal = total;
  const payTotal = finalTotal + readyTotal;

  const showEmptyState = products.length === 0 && customItems.length === 0;

  if (showEmptyState) {
    return (
      <PosShell
        outletName={accountName}
        basePath={basePath}
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
                  href={`${basePath}/produk`}
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
                  Atau minta admin menambahkan produk di{" "}
                  <code>{basePath}/produk</code>.
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
    { href: basePath, label: "POS", icon: Home, active: true },
    { href: `${basePath}/produk`, label: "Katalog", icon: Settings, adminOnly: true },
    { href: `${basePath}/shift`, label: "Saldo", icon: Wallet },
    { href: `${basePath}/stok`, label: "Stok", icon: Boxes },
    { href: `${basePath}/pesanan`, label: "Pesanan", icon: ShoppingBasket },
    { href: `${basePath}/riwayat`, label: "Riwayat", icon: History },
    { href: `${basePath}/insights`, label: "Insights", icon: BarChart3, adminOnly: true },
  ];
  const visibleRailItems = railItems.filter((it) => !it.adminOnly || isAdmin);

  // Tombol Bayar disabled saat:
  //  - cart kosong / sedang submit
  //  - cash tapi uang diterima < finalTotal
  //  - QRIS belum memilih verifikasi, atau memilih "tanpa bunyi" tapi belum ada foto
  const payDisabled =
    itemCount === 0 ||
    pending ||
    voucherBlockText != null ||
    !customerName.trim() ||
    (payMode === "cash" && (cashReceived == null || cashReceived < payTotal)) ||
    (QRIS_RECEIPT_AT_CHECKOUT &&
      payMode === "qris" &&
      !qrisVerificationOk(qrisVerification, qrisReceipt));

  const cartPanel = (
    <div className="flex flex-col h-full bg-card min-h-0 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
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

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[10rem]">
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
            const isReady = line.ready;
            const isCustom = line.key.startsWith("c:");
            const customId = isCustom ? line.key.slice(2) : null;
            return (
              <div
                key={line.key}
                className="rounded-xl border border-border bg-background/40 p-2.5 flex items-center gap-2"
              >
                {/* Satu baris: nama/gula/harga di kiri, tombol % dan qty
                    sejajar di kanan — kartu tidak tinggi di panel sempit. */}
                <div className="min-w-0 flex-1">
                  {/* Nama boleh 2 baris (tidak dipotong "…"); tingkat gula
                      jadi lencana sendiri supaya selalu terlihat — dulu
                      ditempel di belakang nama dan ikut terpotong. */}
                  <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                    {line.baseName}
                  </p>
                  {line.optionsLabel && (
                    <span className="mt-0.5 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                      {line.optionsLabel}
                    </span>
                  )}
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {line.originalPrice != null && (
                      <span className="line-through opacity-60 mr-1">
                        {formatRp(line.originalPrice)}
                      </span>
                    )}
                    {formatRp(line.unitPrice)} × {line.qty}
                    {line.originalPrice != null && (
                      <span className="ml-1 font-semibold text-pop-amber">
                        diskon
                      </span>
                    )}
                  </p>
                  {/* Rincian potongan promo per-item pada baris ini: berapa pcs, dari promo apa, berapa potongannya. */}
                  {picked?.itemPromo?.byLine[line.key]?.map((r) => {
                    const name = promoNameById.get(r.campaignId) ?? "Promo";
                    return (
                      <p key={r.campaignId} className="mt-0.5 text-[11px] font-semibold leading-tight text-success tabular-nums">
                        {promoShortName(name)} −{formatRp(r.saving)} · {r.pcs} pcs
                        {r.pcs < line.qty && (
                          <span className="font-normal text-muted-foreground"> · {line.qty - r.pcs} normal</span>
                        )}
                      </p>
                    );
                  })}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                {!isCustom && !isReady && (
                  <button
                    type="button"
                    onClick={() => setDiscountFor(line.key)}
                    className={`grid size-8 place-items-center text-xs rounded-lg border transition-colors ${
                      line.originalPrice != null
                        ? "border-pop-amber bg-pop-amber/20 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                    title="Atur harga akhir setelah diskon (mis. menjelang expired)"
                  >
                    %
                  </button>
                )}
                {isReady && (
                  <button
                    type="button"
                    aria-label="Hapus"
                    onClick={() => setReadyLines((arr) => arr.filter((r) => `r:${r.orderId}` !== line.key))}
                    className="size-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                )}
                {!isReady && (
                <button
                  type="button"
                  aria-label="Kurangi"
                  onClick={() =>
                    customId
                      ? updateCustomQty(customId, -1)
                      : dec(line.key)
                  }
                  className="size-8 rounded-full border border-border text-foreground inline-flex items-center justify-center hover:bg-muted"
                >
                  <Minus size={12} />
                </button>
                )}
                {!isReady && (
                <span className="w-6 text-center text-sm font-semibold tabular-nums">
                  {line.qty}
                </span>
                )}
                {!isReady && (
                <button
                  type="button"
                  aria-label="Tambah"
                  onClick={() =>
                    customId
                      ? updateCustomQty(customId, 1)
                      : inc(line.key)
                  }
                  className="size-8 rounded-full border border-border text-foreground inline-flex items-center justify-center hover:bg-muted"
                >
                  <Plus size={12} />
                </button>
                )}
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
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border bg-card px-3 py-2.5 space-y-2 shrink-0">
        <div className="space-y-1 tabular-nums">
          {picked && discountAmount > 0 && (
            <>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatRp(grossTotal)}</span>
              </div>
              {picked.itemPromo ? (
                // Promo per-item: satu baris per promo (voucher / tebus), pcs dan jumlahnya.
                picked.itemPromo.parts.map((p) => (
                  <div key={p.campaignId} className="flex items-center justify-between gap-2 text-sm text-success">
                    <span>
                      {promoShortName(promoNameById.get(p.campaignId) ?? "Promo")} ×{p.pcs}
                    </span>
                    <span className="shrink-0">−{formatRp(p.saving)}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between text-sm text-success">
                  <span>
                    {picked.campaign.name} · {describeDiscount(picked.campaign)}
                    {picked.campaign.kind === "percent" && (
                      <span className="ml-1 text-[11px] opacity-70">
                        (bulat ke {formatRp(picked.campaign.roundingUnit)} ke bawah)
                      </span>
                    )}
                  </span>
                  <span>−{formatRp(discountAmount)}</span>
                </div>
              )}
            </>
          )}
          {readyTotal > 0 && finalTotal > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Ready cake (tanpa diskon)</span>
              <span>{formatRp(readyTotal)}</span>
            </div>
          )}
          <div
            className={`flex items-center justify-between ${
              (picked && discountAmount > 0) || (readyTotal > 0 && finalTotal > 0)
                ? "pt-1 border-t border-border"
                : ""
            }`}
          >
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              {(picked && discountAmount > 0) || (readyTotal > 0 && finalTotal > 0) ? "Total bayar" : "Total"}
            </span>
            <span className="text-lg font-bold text-foreground">
              {formatRp(payTotal)}
            </span>
          </div>
        </div>

        {/* Atas nama pemesan — wajib. Tanpa label terpisah (hemat tinggi
            panel di tablet); wajibnya ditandai di placeholder. */}
        <div>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Atas nama pemesan (wajib)…"
            aria-label="Atas nama pemesan (wajib)"
            className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Fulfillment picker — dine-in / take-away per transaksi. */}
        <div>
          <div
            role="group"
            aria-label="Mode"
            className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/40 border border-border"
          >
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
            total={payTotal}
            value={cashReceived}
            onChange={setCashReceived}
          />
        )}
        {payMode === "qris" && QRIS_RECEIPT_AT_CHECKOUT && (
          <QrisVerificationPicker
            verification={qrisVerification}
            onVerification={setQrisVerification}
            file={qrisReceipt}
            onFile={setQrisReceipt}
            disabled={pending}
          />
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
            ? `Buat pesanan ${formatRp(payTotal)}`
            : `Bayar ${formatRp(payTotal)}`}
        </button>
      </div>
    </div>
  );

  return (
    <PosTopbarProvider value={{ openStrukSettings: () => setStrukSettingsOpen(true) }}>
    <div
      data-pos-shell
      data-pos-palette={posPalette(basePath)}
      className="min-h-screen flex flex-col md:grid md:h-screen md:grid-cols-[64px_minmax(0,1fr)_320px] xl:grid-cols-[64px_minmax(0,1fr)_360px] md:grid-rows-[56px_minmax(0,1fr)] bg-background"
    >
      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="md:col-span-3 h-14 border-b border-border bg-card flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0 z-20">
        {/* Kembali ke beranda Zota. "/" me-redirect sesuai peran (admin →
            /admin, karyawan → /dashboard), jadi satu tautan cukup untuk semua. */}
        <Link prefetch={false}
          href="/"
          className="size-9 rounded-full border border-border bg-card text-foreground inline-flex items-center justify-center shrink-0 hover:bg-muted"
          aria-label="Kembali ke beranda Zota"
          title="Kembali ke beranda Zota"
        >
          <ArrowLeft size={16} />
        </Link>
        <PosLogo size={40} palette={posPalette(basePath)} />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
            POS
          </p>
          <p className="font-semibold text-foreground text-sm leading-tight truncate">
            {accountName}
          </p>
        </div>
        <PosOutletSwitch basePath={basePath} />
        <PosMamayaFlowDialog basePath={basePath} />
        {shiftSlot === undefined ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/15 text-success border border-success/30 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            Shift aktif
          </span>
        ) : (
          shiftSlot
        )}
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
      <main className="@container min-w-0 overflow-y-auto pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        {/* Strip informasional di atas grid produk — ikut ter-scroll saat
            kasir menelusuri produk, jadi tidak permanen memakan ruang. */}
        {(dailyRevenue || serviceLevel || feedbackToday) && (
          <div className="flex items-stretch gap-3 px-3 pt-3">
            {dailyRevenue && (
              <div className="flex min-w-0 flex-1 [&>*]:w-full">
                <DailyRevenueTargetCard summary={dailyRevenue} />
              </div>
            )}
            {feedbackToday && (
              <div className="flex min-w-0 flex-1 [&>*]:w-full">
                <FeedbackTargetCard summary={feedbackToday} href={`${basePath}/feedback`} freebies={monitorStock} bankAccountId={bankAccountId} />
              </div>
            )}
            {serviceLevel && (
              <div className="flex min-w-0 flex-1 [&>*]:w-full">
                <ServiceLevelHero
                  summary={serviceLevel}
                  size="compact"
                  href={`${basePath}/service-level`}
                />
              </div>
            )}
          </div>
        )}
        <DiscountBanner
          campaigns={campaigns}
          now={liveNow}
          picked={picked}
          chosenId={chosenCampaignId}
          onChoose={setChosenCampaignId}
          promoLines={promoLines}
          productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
          grossTotal={total}
          vouchers={promoVouchers}
          onVouchers={setPromoVouchers}
          voucherLockText={voucherBlockText}
          people={promoPeople}
          onPeople={setPromoPeople}
          voucherLockOff={voucherLockOff}
          onToggleVoucherLock={() => setVoucherLockOff((v) => !v)}
          disabledIds={disabledCampaignIds}
          onToggleDisabled={(id) =>
            setDisabledCampaignIds((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))
          }
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

        <div className="grid grid-cols-2 gap-1.5 p-2 @[560px]:grid-cols-3 @[820px]:grid-cols-4 @[1080px]:grid-cols-5">
          {readyCake && (searchQuery.trim() === "" || "ready cake".includes(searchQuery.trim().toLowerCase())) && (
            <ReadyCakeTile summary={readyCake} inCart={readyLines.length} onOpen={() => setReadyPickerOpen(true)} />
          )}
          {filteredProducts.map((p) => {
          const hasVariants = p.variants.length > 0;
          const totalQtyOnThisProduct = qtyByProductId.get(p.id) ?? 0;
          // Open-price lines hidup di customItems (bukan cart) —
          // di-aggregate sekali via useMemo supaya O(1) per kartu.
          const openPriceAgg = p.isOpenPrice
            ? openPriceByProductId.get(p.id)
            : undefined;
          const openPriceQty = openPriceAgg?.qty ?? 0;
          const selected =
            totalQtyOnThisProduct > 0 || openPriceQty > 0;
          // Produk tanpa varian yang WAJIB GULA tidak boleh punya pill:
          // tombol +/- di pill bekerja pada key tanpa segmen gula, jadi
          // "+" akan membuat baris tanpa tingkat gula (ditolak server saat
          // bayar) dan "-" tidak menemukan baris ber-gula. Untuk produk
          // ini setiap penambahan harus lewat dialog gula (tap kartu),
          // dan penyesuaian qty dilakukan di daftar keranjang.
          const needsSugarSingle = !hasVariants && sugarRequiredFor(p, null);
          // Untuk produk tanpa varian (dan bukan open-price), tampilkan
          // [- qty +] pill di card. Open-price tidak punya pill — tiap
          // tap buka dialog harga baru. Variant: tap = modal varian.
          const showInlinePill =
            !hasVariants && !p.isOpenPrice && selected && !needsSugarSingle;
          const singleKey =
            !hasVariants && !p.isOpenPrice ? cartKey(p.id) : null;
          const qtyOnSingleKey = singleKey
            ? cartQtyForSku(cart, p.id)
            : 0;
          // Stok badge: hanya untuk produk track stok + non open-price.
          // - "habis" => onHand - kart === 0 di seluruh varian (atau
          //   single-SKU). Card greyed + disabled.
          // - "low"   => 1..3 sisa, hanya hint warna.
          const stockState = computeStockState(p, stockByKey, cart);
          // Varian yang sudah tidak bisa dijual lagi. Dipakai untuk memberi
          // tahu kasir dari LUAR kartu — tanpa ini "Dubai Chewy Cookies (23)"
          // terlihat aman padahal Grade A sudah nol, dan kasir baru tahu
          // setelah membuka dialog varian di depan pembeli.
          // remaining null = produk tidak melacak stok → bukan habis.
          const soldOutVariants = hasVariants
            ? p.variants.filter(
                (v) => variantRemainingStock(p, v.id, stockByKey, cart) === 0
              )
            : [];
          return (
            <div key={p.id} className="relative h-full">
              {stockState.kind === "habis" && (
                <span className="absolute top-1 right-1 z-10 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                className={`flex h-full w-full items-center gap-2 rounded-xl border p-1.5 text-left transition-colors active:bg-muted ${showInlinePill ? "pb-9" : ""} ${
                  stockState.kind === "habis"
                    ? "border-dashed border-border bg-muted/30 opacity-60 cursor-not-allowed grayscale-[20%]"
                    : selected
                    ? "border-primary bg-primary/5 cursor-pointer"
                    : "border-border bg-card cursor-pointer"
                }`}
              >
                {/* Tingkat 1 (selalu terlihat): foto, nama, harga. Sisanya
                    muncul hanya saat relevan — jumlah di keranjang sebagai
                    lencana di foto (rincian varian ada di panel keranjang),
                    stok hanya menonjol bila menipis, catatan baru tampil
                    bila sudah ada isinya. */}
                {(() => {
                  const img = productImageSrc(p.name);
                  const Icon =
                    PRODUCT_ICONS[p.name.trim().toLowerCase()] ?? ShoppingBasket;
                  const badgeQty = showInlinePill
                    ? 0
                    : totalQtyOnThisProduct + openPriceQty;
                  return (
                    <div className="relative size-12 shrink-0 @[560px]:size-14">
                      <div className="relative size-full overflow-hidden rounded-lg">
                        {img ? (
                          <Image
                            src={img}
                            alt=""
                            fill
                            sizes="56px"
                            quality={90}
                            className="object-contain"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="absolute inset-0 grid place-items-center bg-muted/50 text-primary/70"
                          >
                            <Icon className="size-6" strokeWidth={1.5} />
                          </span>
                        )}
                      </div>
                      {badgeQty > 0 && (
                        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold tabular-nums text-primary-foreground">
                          {badgeQty}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <div
                    className={`line-clamp-2 text-[13px] font-semibold leading-tight text-foreground sm:text-sm ${
                      selected || p.notes ? "pr-5" : ""
                    }`}
                  >
                    {p.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                    {p.isOpenPrice
                      ? "Harga custom"
                      : hasVariants
                        ? variantPriceLabel(p.variants)
                        : formatRp(p.price)}
                    {(() => {
                      const r = productRemainingStock(p, stockByKey, cart);
                      if (r == null) return null;
                      return stockState.kind === "low" ? (
                        <span className="ml-1.5 font-semibold text-pop-pink">
                          Sisa {r}
                        </span>
                      ) : (
                        <span className="ml-1.5 opacity-70">· {r}</span>
                      );
                    })()}
                  </div>
                  {/* Varian yang sudah tidak bisa dijual — DITURUNKAN dari
                      stok, bukan diketik, supaya kasir tahu dari luar kartu.
                      Disembunyikan saat SEMUA varian habis: kartunya sudah
                      kelabu + badge "Habis". */}
                  {stockState.kind !== "habis" && soldOutVariants.length > 0 && (
                    <div className="truncate text-[11px] font-medium text-pop-pink">
                      Habis: {soldOutVariants.map((v) => v.name).join(", ")}
                    </div>
                  )}
                  {p.notes && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotesEditFor(p.id);
                      }}
                      className="mt-0.5 block w-full truncate text-left text-[11px] font-medium text-warning"
                      aria-label="Edit catatan"
                    >
                      {p.notes}
                    </button>
                  )}
                </div>
              </div>
              {/* Ikon catatan: hanya muncul setelah produk dipilih (atau
                  bila sudah ada catatan) — tidak ada tombol di tiap kartu. */}
              {stockState.kind !== "habis" && (selected || p.notes) && (
                <button
                  type="button"
                  onClick={() => setNotesEditFor(p.id)}
                  className={`absolute right-0 top-0 grid size-8 place-items-center rounded-lg transition-colors hover:bg-muted ${
                    p.notes ? "text-warning" : "text-muted-foreground/60"
                  }`}
                  aria-label={p.notes ? "Edit catatan" : "Tambah catatan"}
                >
                  <StickyNote size={15} />
                </button>
              )}
              {showInlinePill && singleKey && (
                <div className="absolute bottom-1 right-1.5 flex items-center gap-0 rounded-full bg-primary text-primary-foreground shadow select-none">
                  <button
                    type="button"
                    aria-label="Kurangi"
                    onClick={(e) => {
                      e.stopPropagation();
                      dec(singleKey);
                    }}
                    className="h-7 w-8 flex items-center justify-center rounded-l-full active:bg-primary/80"
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
                    className="h-7 w-8 flex items-center justify-center rounded-r-full active:bg-primary/80"
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
          className="min-h-[64px] rounded-xl border-2 border-dashed border-border bg-muted/20 p-2 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors active:bg-muted"
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

      {readyPickerOpen && readyCake && (
        <ReadyCakePicker
          summary={readyCake}
          pickedIds={new Set(readyLines.map((r) => r.orderId))}
          onPick={addReadyCake}
          onClose={() => setReadyPickerOpen(false)}
        />
      )}

      {pickerProduct && (
        <VariantPickerDialog
          product={pickerProduct}
          cart={cart}
          stockByKey={stockByKey}
          onInc={(variantId) => {
            // Minuman → lanjut ke pemilih gula (satu dialog pada satu
            // waktu: tutup variant picker dulu).
            if (sugarRequiredFor(pickerProduct, variantId)) {
              setVariantPickerFor(null);
              setSugarPickerFor({ productId: pickerProduct.id, variantId });
              return;
            }
            inc(cartKey(pickerProduct.id, variantId));
          }}
          onDec={(variantId) => dec(cartKey(pickerProduct.id, variantId))}
          onClose={() => setVariantPickerFor(null)}
        />
      )}

      {sugarPickerFor && (() => {
        const p = products.find((x) => x.id === sugarPickerFor.productId);
        if (!p) return null;
        const v = sugarPickerFor.variantId
          ? p.variants.find((x) => x.id === sugarPickerFor.variantId) ?? null
          : null;
        return (
          <SugarPickerDialog
            title={v ? `${p.name} — ${v.name}` : p.name}
            price={v ? v.price : p.price}
            onPick={(level) => {
              inc(cartKey(p.id, sugarPickerFor.variantId, level));
              setSugarPickerFor(null);
            }}
            onClose={() => setSugarPickerFor(null)}
          />
        );
      })()}

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

      {discountFor && (() => {
        const { productId, variantId } = parseCartKey(discountFor);
        const info = lineByKey.get(cartKey(productId, variantId));
        if (!info) return null;
        return (
          <DiscountDialog
            name={info.name}
            listPrice={info.price}
            current={discountByKey[discountFor] ?? null}
            onApply={(price) =>
              setDiscountByKey((d) => ({ ...d, [discountFor]: price }))
            }
            onClear={() =>
              setDiscountByKey((d) => {
                const next = { ...d };
                delete next[discountFor];
                return next;
              })
            }
            onClose={() => setDiscountFor(null)}
          />
        );
      })()}

      {lastSale && (
        <ReceiptSuccessDialog data={lastSale} onClose={() => setLastSale(null)} />
      )}

      {mamayaPrompt && (
        <MamayaGuardDialog
          title="Ini penjualan Mamaya?"
          body={`"${mamayaPrompt.name}" kelihatannya barang Mamaya House. Penjualan Mamaya dicatat di POS Mamaya supaya insight dan laporannya tidak tercampur dengan Semarang.`}
          moveLabel="Pindah ke POS Mamaya"
          stayLabel="Tetap di Semarang"
          canMove={
            customItems.length === 0 &&
            readyLines.length === 0 &&
            Object.values(cart).every((q) => q <= 0)
          }
          cannotMoveHint="Keranjang Semarang sudah berisi item. Selesaikan transaksi ini dulu, lalu input pesanan Mamaya terpisah."
          onMove={() => {
            const item = mamayaPrompt;
            setMamayaPrompt(null);
            moveToMamaya([item]);
          }}
          onStay={() => {
            const item = mamayaPrompt;
            setMamayaPrompt(null);
            addCustomLine(item.name, item.price, item.qty);
          }}
          onCancel={() => setMamayaPrompt(null)}
        />
      )}

      {originPrompt && (
        <MamayaGuardDialog
          title="Pesanan besar — asalnya mana?"
          body={`Keranjang berisi item bebas senilai ${formatRp(
            customItems.reduce((s, c) => (c.productId ? s : s + c.price * c.qty), 0)
          )}. Pesanan Mamaya House harus dicatat di POS Mamaya, bukan di Semarang.`}
          moveLabel="Mamaya — pindah ke POS Mamaya"
          stayLabel="Semarang — lanjut bayar"
          canMove={onlyFreeItems}
          cannotMoveHint="Keranjang juga berisi produk Semarang, jadi tidak bisa dipindah sekaligus. Pisahkan dulu: bayar produk Semarang, lalu input item Mamaya di POS Mamaya."
          onMove={() => {
            const items = customItems
              .filter((c) => !c.productId)
              .map((c) => ({ name: c.name, price: c.price, qty: c.qty }));
            setOriginPrompt(null);
            moveToMamaya(items);
          }}
          onStay={() => {
            const method = originPrompt;
            originConfirmedRef.current = true;
            setOriginPrompt(null);
            submit(method);
          }}
          onCancel={() => setOriginPrompt(null)}
        />
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
    </PosTopbarProvider>
  );
}

/**
 * Banner tipis di atas grid produk: kampanye yang BERLAKU SEKARANG. Kampanye otomatis tampil sebagai pemberitahuan
 * hijau (yang sedang dipakai ditandai); kampanye "kasir memilih" tampil sebagai chip yang diketuk untuk dipakai atau
 * dilepas. Hanya kampanye yang jam & harinya cocok sekarang yang muncul — happy hour hilang sendiri saat habis.
 */
function DiscountBanner({
  campaigns,
  now,
  picked,
  chosenId,
  onChoose,
  promoLines,
  productNames,
  grossTotal,
  vouchers,
  onVouchers,
  voucherLockText,
  people,
  onPeople,
  voucherLockOff,
  onToggleVoucherLock,
  disabledIds,
  onToggleDisabled,
}: {
  /** id produk → nama, untuk menampilkan item yang ikut promo. */
  productNames: Record<string, string>;
  campaigns: PosDiscountCampaign[];
  now: JakartaNow;
  picked: PickedCampaign<PosDiscountCampaign> | null;
  chosenId: string | null;
  onChoose: (id: string | null) => void;
  promoLines: PromoLine[];
  grossTotal: number;
  /** Voucher soft opening yang diklaim di nota ini. */
  vouchers: number;
  onVouchers: (n: number) => void;
  /** Pesan bila produk hanya-voucher di keranjang melebihi voucher; null = aman. */
  voucherLockText: string | null;
  /** Jumlah orang di nota (batas Tebus Murah: 1 pcs per orang). */
  people: number;
  onPeople: (n: number) => void;
  /** Kasir melepas kunci hanya-voucher untuk nota ini. */
  voucherLockOff: boolean;
  onToggleVoucherLock: () => void;
  /** Promo yang dimatikan kasir untuk transaksi ini. */
  disabledIds: string[];
  onToggleDisabled: (id: string) => void;
}) {
  const live = campaigns.filter((c) => {
    if (!c.isActive || now.date < c.startDate || now.date > c.endDate) return false;
    if (c.weekdays && !c.weekdays.includes(now.weekday)) return false;
    if (c.startTime && c.endTime && (now.time < c.startTime || now.time >= c.endTime)) return false;
    return true;
  });
  if (live.length === 0) return null;
  // Soft opening (voucher) lebih dulu, lalu tebus murah, lalu promo otomatis lain.
  const order = (c: PosDiscountCampaign) => (c.kind === "item_price" ? 0 : c.kind === "tebus_murah" ? 1 : 2);
  const auto = live.filter((c) => c.mode === "otomatis").sort((a, b) => order(a) - order(b));
  // Status promo per-item untuk keranjang sekarang (voucher terpakai, hak tebus). Promo yang dimatikan tak ikut.
  const info = computeItemPromos(
    auto.filter((c) => (c.kind === "item_price" || c.kind === "tebus_murah") && !disabledIds.includes(c.id)),
    grossTotal,
    promoLines,
    vouchers,
    people
  );
  const claimedPcs = info.parts.find((p) => p.kind === "item_price")?.pcs ?? 0;
  const tebusPcs = info.parts.find((p) => p.kind === "tebus_murah")?.pcs ?? 0;
  const itemStatus = (c: PosDiscountCampaign): { text: string; warn: boolean } | null => {
    if (c.kind === "item_price") {
      if (voucherLockText) return { text: voucherLockText, warn: true };
      if (voucherLockOff) return { text: "Kunci hanya-voucher dilepas untuk nota ini", warn: true };
      if (vouchers === 0) return { text: "Isi voucher", warn: false };
      if (info.voucherUnused > 0) return { text: `${claimedPcs} klaim · sisa ${info.voucherUnused}`, warn: true };
      if (info.promoPcsAtFullPrice > 0) return { text: `${claimedPcs} klaim · ${info.promoPcsAtFullPrice} normal`, warn: true };
      return { text: `${claimedPcs} klaim`, warn: false };
    }
    if (c.kind === "tebus_murah") {
      if (tebusPcs > 0) return { text: `${tebusPcs} ditebus${info.tebusRoom > 0 ? ` · +${info.tebusRoom} lagi` : ""}`, warn: false };
      return { text: info.tebusRoom > 0 ? `Bisa tebus ${info.tebusRoom}` : "Belum ada hak", warn: false };
    }
    return null;
  };
  const manual = live.filter((c) => c.mode === "kasir");
  const rule = (c: PosDiscountCampaign) =>
    [
      c.minPurchase > 0 ? `min. belanja ${formatRp(c.minPurchase)}` : null,
      c.startTime && c.endTime ? `${c.startTime}–${c.endTime}` : null,
      c.note,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="space-y-1 px-3 pt-2">
      {/* Tablet landscape (≥ md): promo berdampingan supaya hemat tinggi layar. */}
      <div className="grid gap-1 md:grid-cols-2">
      {auto.map((c) => {
        const isVoucher = c.kind === "item_price";
        // Voucher: kasir cukup isi jumlah (0 = tidak ada klaim), tak perlu tombol matikan.
        const canOff = cashierCanDisable(c) && !isVoucher;
        const off = canOff && disabledIds.includes(c.id);
        const status = off ? null : itemStatus(c);
        const itemPromo = isVoucher || c.kind === "tebus_murah";
        // Promo per-item: judul pendek (tanpa catatan panjang); catatan lengkap lewat tooltip.
        const title = itemPromo
          ? `${promoShortName(c.name)} · ${formatRp(c.promoPrice)}`
          : `${c.name} · ${describeDiscount(c)}`;
        return (
          <div
            key={c.id}
            title={[rule(c), status?.text].filter(Boolean).join(" · ") || undefined}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs text-foreground ${
              off ? "border-border bg-muted/50" : "border-success/40 bg-success/10"
            } ${itemPromo ? "" : "md:col-span-2"}`}
          >
            <Sparkles size={13} className={`shrink-0 ${off ? "text-muted-foreground" : "text-success"}`} />
            <span className={`min-w-0 flex-1 truncate whitespace-nowrap leading-tight ${off ? "text-muted-foreground" : ""}`}>
              <strong className={`font-semibold ${off ? "line-through" : ""}`}>{title}</strong>
              {!itemPromo && rule(c) ? <> — {rule(c)}</> : null}
              {off && <span className="ml-1 font-semibold">· mati</span>}
              {status && (
                <span className={`ml-1.5 text-[11px] font-medium ${status.warn ? "text-warning" : "text-muted-foreground"}`}>
                  {status.text}
                </span>
              )}
              {c.kind === "tebus_murah" && !off && (
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  Pilih 1:{" "}
                  {c.productIds
                    .map((id) => productNames[id])
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </span>
            {isVoucher && (
              <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Jumlah voucher klaim">
                <button
                  type="button"
                  aria-label="Kurangi voucher"
                  disabled={vouchers <= 0}
                  onClick={() => onVouchers(Math.max(0, vouchers - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:border-foreground disabled:opacity-40"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-5 text-center text-sm font-bold tabular-nums" aria-live="polite">
                  {vouchers}
                </span>
                <button
                  type="button"
                  aria-label="Tambah voucher"
                  disabled={vouchers >= MAX_PROMO_VOUCHERS}
                  onClick={() => onVouchers(Math.min(MAX_PROMO_VOUCHERS, vouchers + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {c.kind === "tebus_murah" && !off && (
              <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Jumlah orang">
                <span className="text-[11px] text-muted-foreground">Orang</span>
                <button
                  type="button"
                  aria-label="Kurangi orang"
                  disabled={people <= 1}
                  onClick={() => onPeople(Math.max(1, people - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:border-foreground disabled:opacity-40"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-5 text-center text-sm font-bold tabular-nums" aria-live="polite">
                  {people}
                </span>
                <button
                  type="button"
                  aria-label="Tambah orang"
                  disabled={people >= MAX_PROMO_PEOPLE}
                  onClick={() => onPeople(Math.min(MAX_PROMO_PEOPLE, people + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {isVoucher && c.voucherOnlyProductIds.length > 0 && (
              <button
                type="button"
                onClick={onToggleVoucherLock}
                className={`shrink-0 rounded-full border px-2.5 py-1 font-semibold transition ${
                  voucherLockOff
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {voucherLockOff ? "Kunci lagi" : "Lepas kunci"}
              </button>
            )}
            {canOff && (
              <button
                type="button"
                onClick={() => onToggleDisabled(c.id)}
                className={`shrink-0 rounded-full border px-2.5 py-1 font-semibold transition ${
                  off
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {off ? "Nyalakan" : "Matikan"}
              </button>
            )}
          </div>
        );
      })}
      </div>
      {manual.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs">
          <span className="font-semibold text-muted-foreground">Promo (pilih):</span>
          {manual.map((c) => {
            const on = chosenId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChoose(on ? null : c.id)}
                title={rule(c) || undefined}
                className={`rounded-full border-2 px-2.5 py-1 font-semibold transition ${
                  on ? "border-foreground bg-primary text-primary-foreground" : "border-border text-foreground hover:border-foreground"
                }`}
              >
                {c.name} · {describeDiscount(c)}
                {on && picked?.campaign.id !== c.id ? " (belum memenuhi syarat)" : ""}
              </button>
            );
          })}
        </div>
      )}
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
    <div className="rounded-xl border border-border bg-muted/30 p-2 space-y-1.5">
      <label className="block">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
          <span className="text-sm font-semibold text-muted-foreground">
            Rp
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value == null ? "" : value.toLocaleString("id-ID")}
            placeholder="Uang diterima"
            aria-label="Uang diterima"
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
    remaining = onHand - cartQtyForSku(cart, p.id);
  } else if (p.stockAggregateVariants) {
    const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
    let inCart = 0;
    for (const v of p.variants) inCart += cartQtyForSku(cart, p.id, v.id);
    remaining = onHand - inCart;
  } else {
    remaining = p.variants.reduce((max, v) => {
      const avail =
        (stockByKey[cartKey(p.id, v.id)] ?? 0) -
        cartQtyForSku(cart, p.id, v.id);
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
    return Math.max(0, onHand - cartQtyForSku(cart, p.id));
  }
  if (p.stockAggregateVariants) {
    const onHand = stockByKey[cartKey(p.id, null)] ?? 0;
    let inCart = 0;
    for (const v of p.variants) inCart += cartQtyForSku(cart, p.id, v.id);
    return Math.max(0, onHand - inCart);
  }
  // Per-variant tracking → sum semua varian.
  let total = 0;
  for (const v of p.variants) {
    const onHand = stockByKey[cartKey(p.id, v.id)] ?? 0;
    total += Math.max(0, onHand - cartQtyForSku(cart, p.id, v.id));
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
    for (const v of p.variants) inCart += cartQtyForSku(cart, p.id, v.id);
    return Math.max(0, onHand - inCart);
  }
  const onHand = stockByKey[cartKey(p.id, variantId)] ?? 0;
  return Math.max(0, onHand - cartQtyForSku(cart, p.id, variantId));
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
  const img = productImageSrc(product.name);
  let totalQty = 0;
  for (const v of product.variants) {
    totalQty += cartQtyForSku(cart, product.id, v.id);
  }
  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-3 space-y-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          {img && (
            <div className="relative size-10 shrink-0">
              <Image
                src={img}
                alt=""
                fill
                sizes="40px"
                quality={90}
                className="object-contain"
              />
            </div>
          )}
          <h2 className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {product.name}
          </h2>
        </div>
        {/* Tap baris = tambah 1 (sama dengan kartu produk). Tombol −/qty
            baru muncul setelah varian dipilih (progressive disclosure). */}
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {product.variants.map((v) => {
            // Qty dijumlahkan lintas tingkat gula — satu varian bisa
            // punya beberapa baris cart (No/Less/Normal Sugar).
            const qty = cartQtyForSku(cart, product.id, v.id);
            const needsSugar = v.requiresSugarLevel;
            // Resolve sisa stok khusus varian ini.
            let remaining: number | null = null;
            if (tracked) {
              if (product.stockAggregateVariants) {
                let inCartOther = 0;
                for (const x of product.variants) {
                  if (x.id === v.id) continue;
                  inCartOther += cartQtyForSku(cart, product.id, x.id);
                }
                remaining = Math.max(0, productOnHand - inCartOther - qty);
              } else {
                remaining =
                  (stockByKey![cartKey(product.id, v.id)] ?? 0) - qty;
              }
            }
            const habis = remaining != null && remaining <= 0;
            const add = () => {
              if (!habis) onInc(v.id);
            };
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={habis ? -1 : 0}
                aria-disabled={habis}
                onClick={add}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    add();
                  }
                }}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-1.5 transition-colors ${
                  habis && qty === 0
                    ? "border-dashed border-border bg-muted/30 opacity-60 cursor-not-allowed"
                    : qty > 0
                    ? "border-primary bg-primary/5 cursor-pointer"
                    : "border-border bg-card cursor-pointer active:bg-muted"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {v.name}
                  </p>
                  <p className="truncate text-xs tabular-nums text-muted-foreground">
                    {formatRp(v.price)}
                    {/* Sisa stok varian setelah cart — kasir tahu kapasitas
                        tanpa buka /pos/stok; menonjol hanya saat menipis. */}
                    {remaining != null &&
                      (habis ? (
                        <span className="ml-1.5 font-semibold">Habis</span>
                      ) : remaining <= 3 ? (
                        <span className="ml-1.5 font-semibold text-pop-pink">
                          Sisa {remaining}
                        </span>
                      ) : (
                        <span className="ml-1.5 opacity-70">· {remaining}</span>
                      ))}
                  </p>
                </div>
                {needsSugar ? (
                  // Minuman: "−" ambigu di sini (tingkat gula yang mana?),
                  // jadi hanya tambah → buka pemilih gula. Ubah/hapus qty
                  // dilakukan di daftar keranjang, tempat tiap tingkat gula
                  // punya barisnya sendiri.
                  <>
                    {qty > 0 && (
                      <span className="text-sm font-bold tabular-nums text-primary">
                        ×{qty}
                      </span>
                    )}
                    {!habis && (
                      <span
                        aria-hidden
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
                      >
                        <Plus size={16} />
                      </span>
                    )}
                  </>
                ) : qty > 0 ? (
                  <div className="flex items-center rounded-full bg-primary text-primary-foreground select-none">
                    <button
                      type="button"
                      aria-label="Kurangi"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDec(v.id);
                      }}
                      className="h-9 w-9 flex items-center justify-center rounded-l-full active:bg-primary/80"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="min-w-6 text-center text-sm font-bold tabular-nums">
                      {qty}
                    </span>
                    <button
                      type="button"
                      aria-label="Tambah"
                      onClick={(e) => {
                        e.stopPropagation();
                        add();
                      }}
                      disabled={habis}
                      className="h-9 w-9 flex items-center justify-center rounded-r-full active:bg-primary/80 disabled:opacity-40"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ) : (
                  !habis && (
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-foreground/70"
                    >
                      <Plus size={16} />
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 rounded-xl bg-primary text-sm text-primary-foreground font-semibold"
        >
          Selesai{totalQty > 0 ? ` · ${totalQty} item` : ""}
        </button>
      </div>
    </div>
  );
}

/**
 * Pemilih tingkat gula untuk minuman. WAJIB: menutup dialog = batal
 * menambah, item tidak pernah masuk cart tanpa tingkat gula (server juga
 * menolaknya, jadi UI tidak bisa di-bypass).
 *
 * Tiap pilihan menambah SATU baris cart tersendiri, sehingga 2 gelas
 * minuman sama dengan gula berbeda tetap terpisah di keranjang & struk.
 */
function SugarPickerDialog({
  title,
  price,
  onPick,
  onClose,
}: {
  title: string;
  price: number;
  onPick: (level: SugarLevel) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-3 space-y-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="truncate font-semibold text-foreground">{title}</h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatRp(price)} · pilih tingkat gula (wajib)
          </p>
        </div>
        {/* Tiga pilihan sejajar dalam satu baris: satu tap, tanpa scroll. */}
        <div
          className={`grid gap-2 ${
            SUGAR_LEVELS.length === 3 ? "grid-cols-3" : "grid-cols-1"
          }`}
        >
          {SUGAR_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onPick(level)}
              className="h-14 rounded-xl border border-border bg-card px-1 text-sm font-semibold leading-tight text-foreground active:bg-muted hover:border-primary transition-colors"
            >
              {SUGAR_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 rounded-xl text-sm text-muted-foreground font-semibold hover:bg-muted"
        >
          Batal
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
/**
 * Atur harga diskon satu baris cart (mis. produk menjelang expired).
 *
 * Baris tetap produk katalog — hanya harganya turun — sehingga stok
 * berkurang seperti penjualan biasa dan stock opname tidak selisih.
 * Harga wajib di bawah harga normal; server memvalidasi ulang.
 */
function DiscountDialog({
  name,
  listPrice,
  current,
  onApply,
  onClear,
  onClose,
}: {
  name: string;
  listPrice: number;
  current: number | null;
  onApply: (price: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(current != null ? String(current) : "");

  function apply(value?: number) {
    const p = value ?? Number(price);
    if (!Number.isFinite(p) || p < 0) {
      toast.error("Harga tidak valid");
      return;
    }
    if (p >= listPrice) {
      toast.error("Harga akhir harus di bawah harga normal");
      return;
    }
    onApply(p);
    onClose();
  }

  // Preset cepat — harga akhir dibulatkan ke 500 supaya nominalnya wajar
  // di kasir (mis. 15.000 −30% → 10.500).
  //
  // "Gratis" SENGAJA bukan hasil rumus persen yang dibulatkan: pada produk
  // yang sudah murah (listPrice kecil) preset persen harus tetap disabled
  // bila pembulatan membuatnya 0 atau tidak turun dari harga normal
  // (angkanya cuma kebetulan akibat pembulatan, bukan diskon yang
  // sungguhan), sementara "Gratis" adalah 100% off yang memang dimaksud
  // dan harus selalu bisa ditekan. apply()/server menerima 0 (hanya
  // menolak >= harga normal).
  const presets = [
    ...[20, 30, 50].map((pct) => {
      const value = Math.round((listPrice * (1 - pct / 100)) / 500) * 500;
      return {
        label: `−${pct}%`,
        value,
        disabled: value <= 0 || value >= listPrice,
      };
    }),
    {
      label: "Gratis",
      value: 0,
      disabled: listPrice <= 0,
    },
  ];

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
          <h2 className="font-semibold text-foreground">{name}</h2>
          <p className="text-xs text-muted-foreground">
            Harga normal {formatRp(listPrice)}. Isi harga akhir setelah diskon
            (boleh sampai Rp0 untuk gratis) — stok tetap berkurang seperti penjualan biasa.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => apply(p.value)}
              disabled={p.disabled}
              className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs font-semibold hover:border-foreground disabled:opacity-40"
            >
              {/* Persentase saja; nominal hanya untuk Gratis (Rp0). */}
              {p.value > 0 ? p.label : `${p.label} · ${formatRp(p.value)}`}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Harga akhir setelah diskon
          </span>
          <input
            autoFocus
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={`di bawah ${listPrice}`}
            inputMode="numeric"
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
          />
        </label>
        <div className="flex gap-2">
          {current != null && (
            <button
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
              className="h-10 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-destructive"
            >
              Hapus diskon
            </button>
          )}
          <button
            type="button"
            onClick={() => apply()}
            className="flex-1 h-10 rounded-lg bg-primary border-2 border-foreground text-sm font-bold"
          >
            Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}

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
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-3 space-y-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="truncate font-semibold text-foreground">{product.name}</h2>
          <p className="text-xs text-muted-foreground">
            Pilih varian, lalu isi harga.
          </p>
        </div>
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {product.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onPick(v.id)}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-1.5 text-left transition-colors hover:border-primary hover:bg-primary/5 active:bg-muted"
            >
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                {v.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatRp(v.price)}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 rounded-xl text-sm text-muted-foreground font-semibold hover:bg-muted"
        >
          Batal
        </button>
      </div>
    </div>
  );
}


/** Dialog pilihan Semarang vs Mamaya (lihat lib/pos/mamaya-guard.ts). Tidak menutup lewat klik latar: kasir harus memilih. */
function MamayaGuardDialog({
  title,
  body,
  moveLabel,
  stayLabel,
  canMove,
  cannotMoveHint,
  onMove,
  onStay,
  onCancel,
}: {
  title: string;
  body: string;
  moveLabel: string;
  stayLabel: string;
  canMove: boolean;
  cannotMoveHint: string;
  onMove: () => void;
  onStay: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md space-y-4 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--foreground)]"
      >
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          {!canMove && <p className="mt-2 text-xs text-warning">{cannotMoveHint}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onMove}
            disabled={!canMove}
            className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-40"
          >
            {moveLabel}
          </button>
          <button
            type="button"
            onClick={onStay}
            className="h-11 w-full rounded-xl border-2 border-foreground bg-card font-semibold text-foreground hover:bg-muted"
          >
            {stayLabel}
          </button>
          <button type="button" onClick={onCancel} className="h-9 text-sm text-muted-foreground hover:text-foreground">
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
