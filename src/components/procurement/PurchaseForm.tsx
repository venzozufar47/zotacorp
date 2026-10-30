"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  ImageIcon,
  Loader2,
  Landmark,
  PackagePlus,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  ShoppingBag,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { walletLabel, walletName } from "@/lib/procurement/wallet-label";
import { PURCHASE_UNITS } from "@/lib/costing/unit-options";
import { parseMoneyId } from "@/lib/utils/parse-number";
import { NumberHint } from "@/components/shared/NumberHint";
import { formatRp } from "@/lib/cashflow/format";
import { compressImageStrict } from "@/lib/images/compress-image";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { parseDecimalId } from "@/components/admin/costing/fields";
import {
  EXPENSE_CATEGORIES,
  categoryLabelFull,
  expenseCategory,
  searchCategories,
  WIZARD_ROOT,
  type WizardNode,
} from "@/lib/procurement/categories";
import { findSimilarMaterials } from "@/lib/procurement/similar-materials";
import { needsPriceReview, priceDeviation, PRICE_REVIEW_THRESHOLD } from "@/lib/procurement/purchase-math";
import {
  createPurchase,
  discardPurchaseReceipt,
  proposeMaterial,
  uploadPurchaseReceipt,
  type RecentExpense,
  type MoneySource,
  type PurchaseFormData,
  type PurchaseLineInput,
  type PurchaseMaterialOption,
  type PurchaseView,
} from "@/lib/actions/procurement-purchases.actions";

/** Ketikan nominal: hanya angka, titik, koma ("45.500", "45.500,00", "45500.00" semuanya Rp 45.500). */
const moneyText = (v: string) => v.replace(/[^0-9.,]/g, "");
const num = (v: string) => parseMoneyId(v);
const nf = (n: number, max = 2) => n.toLocaleString("id-ID", { maximumFractionDigits: max });

/**
 * Nominal sama saja belum tentu dobel: Rp20.000/Rp10.000 (ongkir, galon) sering muncul berulang. Dianggap mungkin dobel
 * bila nominalnya "tidak bulat" (bukan kelipatan Rp5.000 — kebetulan sama jauh lebih jarang) ATAU keterangannya berbagi
 * kata dengan catatan yang sudah ada.
 */
function likelyDuplicate(line: DraftLine, e: RecentExpense): boolean {
  if (Math.round(line.total) % 5000 !== 0) return true;
  const words = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !["beli", "bayar", "uang", "bahan", "nota", "pengadaan", "dicatat", "kasir", "shift", "laci"].includes(w))
    );
  const mine = words(line.kind === "lain" ? line.description : line.material.name);
  for (const w of words(e.label)) if (mine.has(w)) return true;
  return false;
}

/** Satu baris di draf nota (belum disimpan). */
type DraftLine =
  | {
      key: string;
      kind: "bahan";
      material: PurchaseMaterialOption;
      qty: number;
      unit: string;
      total: number;
      /** Rp per satuan pakai & selisih vs acuan, untuk ditampilkan. */
      perUsage: number;
      deviation: number | null;
      /** Merek terdaftar yang dipilih, atau nama merek baru (dibuat server saat nota disimpan); keduanya null = tanpa merek. */
      brandId: string | null;
      brandName: string | null;
      newBrandName: string | null;
    }
  | { key: string; kind: "lain"; category: string; description: string; total: number };

/** Isi form dari nota yang sudah tersimpan (mode edit). Baris bahan yang bahannya sudah tak aktif dihitung di `skipped`. */
function draftFromView(v: PurchaseView, materials: PurchaseMaterialOption[]): { lines: DraftLine[]; skipped: number } {
  const lines: DraftLine[] = [];
  let skipped = 0;
  for (const l of v.lines) {
    if (l.kind === "bahan") {
      const m = materials.find((x) => x.id === l.materialId);
      if (!m || l.qtyInput == null || !l.unitInput) {
        skipped++;
        continue;
      }
      lines.push({
        key: crypto.randomUUID(),
        kind: "bahan",
        material: m,
        qty: l.qtyInput,
        unit: l.unitInput,
        total: l.total,
        perUsage: l.unitPriceUsage ?? 0,
        deviation: l.deviation,
        brandId: l.brandId,
        brandName: l.brandName,
        newBrandName: null,
      });
    } else {
      lines.push({ key: crypto.randomUUID(), kind: "lain", category: l.category, description: l.description, total: l.total });
    }
  }
  return { lines, skipped };
}

export function PurchaseForm({
  data,
  initialMaterialId,
  onSaved,
  editing,
}: {
  /** Mode edit: nota yang diubah. Semua isinya bisa diganti (seperti input ulang); disimpan menggantikan nota ini. */
  editing?: PurchaseView;
  data: PurchaseFormData;
  /** Bahan yang sudah terpilih (dari tombol "Catat belanja" di papan stok). */
  initialMaterialId?: string;
  /** Dipanggil setelah nota tersimpan, untuk pindah ke Riwayat bila diminta. */
  onSaved?: () => void;
}) {
  const businessUnit = data.businessUnit;
  const today = jakartaDateString(new Date());
  const oldest = jakartaDateString(new Date(Date.now() - 7 * 86_400_000));

  const [materials, setMaterials] = useState<PurchaseMaterialOption[]>(data.materials);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(editing?.receiptUrl ?? null);
  // Mode edit: foto nota lama dipakai kembali sampai petugas memilih foto baru.
  const [keepReceipt, setKeepReceipt] = useState(!!editing);
  const [uploading, setUploading] = useState(false);
  const [vendor, setVendor] = useState(editing?.vendor ?? "");
  const [date, setDate] = useState(editing?.purchaseDate ?? today);
  const [editDate, setEditDate] = useState(!!editing);
  const initialDraft = useMemo(
    () => (editing ? draftFromView(editing, data.materials) : { lines: [] as DraftLine[], skipped: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [lines, setLines] = useState<DraftLine[]>(initialDraft.lines);
  const preselected = initialMaterialId ? data.materials.find((m) => m.id === initialMaterialId) ?? null : null;
  const [composer, setComposer] = useState<"bahan" | "lain" | null>(preselected ? "bahan" : null);
  const { access } = data;
  // Sumber uang: bila hanya satu yang tersedia dipilih otomatis; bila dua, WAJIB dipilih (tanpa bawaan) —
  // salah sumber membuat kas laci tidak cocok.
  const [source, setSource] = useState<MoneySource | null>(
    editing ? editing.moneySource : !access.pengadaan && access.laci ? "laci" : null
  );
  const [saving, startSaving] = useTransition();
  const [done, setDone] = useState<{ total: number; lines: number; flagged: number; source: MoneySource } | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  // Foto dari galeri (screenshot) hanya sah untuk belanja online lewat Saldo Shopee/Seabank; sisanya wajib foto langsung dari kamera.
  const [fromGallery, setFromGallery] = useState(false);
  // Kunci idempotensi: klik ganda / kirim ulang setelah timeout tidak membuat nota kembar. Diganti setelah sukses.
  const clientIdRef = useRef<string>(crypto.randomUUID());

  const total = lines.reduce((s, l) => s + l.total, 0);
  // Edit: saldo yang tampil sudah dikurangi nota ini (bila sumbernya sama) — kembalikan dulu supaya perbandingan adil.
  const walletAvail =
    access.walletBalance == null ? null : access.walletBalance + (editing?.moneySource === "pengadaan" ? editing.total : 0);
  const shopeeAvail =
    access.shopeeBalance == null ? null : access.shopeeBalance + (editing?.moneySource === "shopee" ? editing.total : 0);

  // Peringatan duplikat: baris dengan nominal yang sama dengan pengeluaran 36 jam terakhir (nota, pengeluaran shift,
  // catatan manual) — penyebab umum pencatatan ganda yang membuat saldo pengadaan minus. Nota yang baru disimpan di
  // halaman ini ikut dihitung, karena `data` tidak dimuat ulang.
  const [sessionExpenses, setSessionExpenses] = useState<RecentExpense[]>([]);
  const dups = useMemo(() => {
    if (editing) return []; // nota yang sedang diedit sudah ada di daftar pengeluaran terbaru: bukan duplikat
    const pool = [...data.recentExpenses, ...sessionExpenses];
    const out: { amount: number; label: string; at: string }[] = [];
    for (const l of lines) {
      const hit = pool.find((e) => Math.abs(e.amount - l.total) < 0.5 && likelyDuplicate(l, e));
      if (hit && !out.some((o) => o.amount === hit.amount)) out.push(hit);
    }
    return out;
  }, [lines, data.recentExpenses, sessionExpenses, editing]);
  const dupText = (d: { amount: number; label: string; at: string }) =>
    `${formatRp(d.amount)}${d.label ? ` (“${d.label.slice(0, 40)}”)` : ""}, tercatat ${new Date(d.at).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

  const missing = !source
    ? "Pilih sumber uang dulu"
    : !receiptPath && !keepReceipt
    ? "Tambahkan foto nota dulu"
    : lines.length === 0
      ? "Tambahkan minimal satu baris"
      : uploading
        ? "Foto sedang diunggah…"
        : null;

  /** Ganti sumber uang. Foto yang diambil dari galeri hanya berlaku untuk Saldo Shopee/Seabank, jadi dibuang bila sumbernya pindah. */
  function chooseSource(next: MoneySource) {
    if (fromGallery && next !== "shopee") {
      if (receiptPath) void discardPurchaseReceipt({ businessUnit, path: receiptPath });
      if (receiptPreview?.startsWith("blob:")) URL.revokeObjectURL(receiptPreview);
      setReceiptPath(null);
      setReceiptPreview(null);
      setFromGallery(false);
      toast.error(`Foto dari galeri hanya untuk ${walletLabel(businessUnit)}. Ambil foto nota langsung dengan kamera.`);
    }
    setSource(next);
  }

  async function onPickFile(file: File | null, viaGallery = false) {
    if (!file) return;
    if (viaGallery && source !== "shopee") return void toast.error(`Galeri hanya untuk belanja lewat ${walletLabel(businessUnit)}. Ambil foto langsung.`);
    setUploading(true);
    try {
      const small = await compressImageStrict(file, { maxDim: 1600 });
      const form = new FormData();
      form.set("businessUnit", businessUnit);
      form.set("file", small);
      const res = await uploadPurchaseReceipt(form);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal mengunggah foto" : res.error);
        return;
      }
      if (receiptPath) void discardPurchaseReceipt({ businessUnit, path: receiptPath });
      if (receiptPreview?.startsWith("blob:")) URL.revokeObjectURL(receiptPreview);
      setKeepReceipt(false);
      setReceiptPath(res.data.path);
      setFromGallery(viaGallery);
      setReceiptPreview(URL.createObjectURL(small));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memproses foto");
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  function save() {
    if (missing || (!receiptPath && !keepReceipt) || !source) return;
    if (
      dups.length > 0 &&
      !confirm(
        `Nominal ini sudah pernah tercatat:\n${dups.map((d) => `• ${dupText(d)}`).join("\n")}\n\nBila ini belanja yang sama, JANGAN disimpan lagi (saldo jadi minus). Tetap simpan sebagai nota baru?`
      )
    )
      return;
    const payload: PurchaseLineInput[] = lines.map((l) =>
      l.kind === "bahan"
        ? { kind: "bahan", materialId: l.material.id, qty: l.qty, unit: l.unit, total: l.total, brandId: l.brandId, newBrandName: l.newBrandName }
        : { kind: "lain", category: l.category, description: l.description, total: l.total }
    );
    startSaving(async () => {
      const res = await createPurchase({
        businessUnit,
        clientId: editing ? undefined : clientIdRef.current,
        replaceId: editing?.id,
        keepReceipt: editing ? keepReceipt : undefined,
        moneySource: source,
        receiptPath: receiptPath ?? "",
        purchaseDate: date,
        vendor: vendor.trim() || null,
        lines: payload,
      });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal menyimpan nota" : res.error);
        return;
      }
      if (editing) {
        toast.success("Nota diperbarui");
        onSaved?.();
        return;
      }
      if (receiptPreview?.startsWith("blob:")) URL.revokeObjectURL(receiptPreview);
      clientIdRef.current = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      setSessionExpenses((s) => [
        ...s,
        ...lines.map((l) => ({
          amount: l.total,
          at: nowIso,
          label: l.kind === "lain" ? l.description : l.material.name,
        })),
      ]);
      // Daftar merek di form ikut diperbarui: merek baru dari nota ini bisa langsung dipilih, dan merek yang baru dipakai
      // menjadi bawaan pembelian berikutnya.
      const newBrands = res.data.newBrands ?? [];
      setMaterials((prev) =>
        prev.map((m) => {
          const mine = lines.filter((l) => l.kind === "bahan" && l.material.id === m.id);
          if (mine.length === 0) return m;
          const brands = [...m.brands, ...newBrands.filter((b) => b.materialId === m.id && !m.brands.some((x) => x.id === b.id)).map((b) => ({ id: b.id, name: b.name }))];
          let def = m.defaultBrandId;
          for (const l of mine) {
            if (l.kind !== "bahan") continue;
            const id = l.brandId ?? newBrands.find((b) => b.materialId === m.id && b.name.toLowerCase() === (l.newBrandName ?? "").toLowerCase())?.id ?? null;
            if (id) def = id;
          }
          return { ...m, brands, defaultBrandId: def };
        })
      );
      setDone({ total: res.data.total, lines: lines.length, flagged: res.data.flagged, source });
      setLines([]);
      setReceiptPath(null);
      setReceiptPreview(null);
      setFromGallery(false);
      setVendor("");
      setDate(today);
      setComposer(null);
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-2xl border-2 border-foreground bg-card p-6 text-center shadow-hard-sm">
        <CheckCircle2 size={44} className="mx-auto text-success" />
        <div>
          <h2 className="font-display text-lg font-bold">Nota tersimpan</h2>
          <p className="text-sm text-muted-foreground">
            {formatRp(done.total)} · {done.lines} baris —{" "}
            {done.source === "shopee"
              ? `mengurangi ${walletLabel(businessUnit)} dan (untuk bahan) menambah stok.`
              : done.source === "laci"
                ? "sudah masuk buku kas dan mengurangi kas laci shift ini."
                : "sudah masuk buku kas dan (untuk bahan) stok."}
          </p>
        </div>
        {done.flagged > 0 && (
          <p className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-foreground">
            {done.flagged} harga bahan jauh dari biasanya — owner akan meninjau. Harga acuan belum diubah.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => setDone(null)}>
            <Plus size={14} className="mr-1.5" /> Catat nota lagi
          </Button>
          {onSaved && (
            <Button type="button" variant="outline" onClick={onSaved}>
              Lihat riwayat
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h2 className="font-display text-sm font-bold">Uang belanjanya dari mana?</h2>
        <SourceCard
          icon={<Wallet size={20} />}
          title="Uang pengadaan"
          desc={`Uang yang kamu bawa untuk belanja. Tidak mengubah kas laci kasir.${
            access.walletBalance != null ? ` Saldo ${formatRp(access.walletBalance)}.` : ""
          }`}
          disabled={!access.pengadaan}
          disabledReason="Hanya untuk petugas pengadaan"
          onClick={() => chooseSource("pengadaan")}
        />
        <SourceCard
          icon={<Landmark size={20} />}
          title="Uang laci kasir"
          desc={
            access.shiftCashier
              ? `Dibayar dari laci shift ${access.shiftCashier}. Mengurangi kas laci — ikut dihitung saat tutup shift.`
              : access.drawerState === "closed"
                ? "Dibayar dari laci kasir. Tidak ada shift berjalan sekarang, tapi tetap mengurangi isi laci sejak tutup shift terakhir."
                : "Dibayar dari laci kasir. Mengurangi kas laci."
          }
          disabled={!access.laci}
          disabledReason={access.laciReason ?? undefined}
          onClick={() => {
            chooseSource("laci");
            // Uang laci selalu hari ini — kecuali mengedit nota laci lama (tanggalnya dipertahankan).
            if (editing?.moneySource !== "laci") {
              setDate(today);
              setEditDate(false);
            }
          }}
        />
        <SourceCard
          icon={<ShoppingBag size={20} />}
          title={walletLabel(businessUnit)}
          desc={`${walletName(businessUnit) === "Seabank" ? "Belanja memakai saldo Seabank dari transferan owner." : "Belanja lewat Shopee memakai saldo ShopeePay dari transferan owner."}${
            access.shopeeBalance != null ? ` Saldo ${formatRp(access.shopeeBalance)}.` : ""
          }`}
          disabled={!access.shopee}
          disabledReason="Hanya untuk petugas pengadaan"
          onClick={() => chooseSource("shopee")}
        />
        <p className="text-[11px] text-muted-foreground">
          Salah memilih membuat kas laci tidak cocok. Ragu? Tanyakan: apakah uangnya diambil dari laci kasir?
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-48 md:pb-28">
      {editing && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs leading-snug">
          <b>Edit nota</b> — ubah apa saja (sumber uang, foto, toko, tanggal, baris), lalu simpan. Nota lama diganti, buku kas
          dan stok ikut disesuaikan.
          {initialDraft.skipped > 0 && (
            <span className="mt-1 block font-semibold text-destructive">
              {initialDraft.skipped} baris bahan tidak bisa dimuat (bahannya sudah tidak aktif) dan akan hilang bila disimpan.
              Tambahkan lagi bila perlu.
            </span>
          )}
        </div>
      )}
      {source === "pengadaan" && !access.laci && walletAvail != null && walletAvail <= 0 && (
        <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-snug text-destructive">
          Uang laci kasir belum tersedia ({(access.laciReason ?? "tidak ada shift terbuka").toLowerCase()}) dan saldo uang
          pengadaan habis: minta kasir membuka shift, atau catat setelah uang diambil dari laci.
        </div>
      )}
      {access.pengadaan && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
          <span>
            Sumber uang: <b>{source === "laci" ? "Uang laci kasir" : source === "shopee" ? walletLabel(businessUnit) : "Uang pengadaan"}</b>
            {source === "pengadaan" && walletAvail != null && <> (saldo {formatRp(walletAvail)})</>}
            {source === "shopee" && shopeeAvail != null && <> (saldo {formatRp(shopeeAvail)})</>}
          </span>
          <button
            type="button"
            disabled={lines.length > 0 && !editing}
            onClick={() => setSource(null)}
            className="font-semibold text-primary hover:underline disabled:opacity-40"
            title={lines.length > 0 ? "Kosongkan baris dulu untuk mengganti sumber" : undefined}
          >
            Ganti
          </button>
        </div>
      )}
      {/* 1. Foto nota */}
      <section className="space-y-2">
        <StepTitle n={1} title="Foto nota" done={!!receiptPath} />
        {/* Dua input: kamera langsung, dan galeri (screenshot nota Shopee/Seabank) tanpa `capture` — galeri hanya untuk Saldo Shopee/Seabank. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null, true)}
        />
        {receiptPreview ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receiptPreview} alt="Nota" className="size-16 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Foto nota siap</p>
              <p className="text-xs text-muted-foreground">Pastikan total dan tanggal di nota terbaca jelas.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={uploading || saving}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                {uploading ? "Mengunggah…" : "Foto ulang"}
              </button>
              {source === "shopee" && (
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={uploading || saving}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Dari galeri
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border-2 border-dashed border-foreground/40 bg-card p-3">
            <div className={cn("grid gap-2", source === "shopee" ? "grid-cols-2" : "grid-cols-1")}>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={uploading || saving}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border px-3 py-4 text-foreground transition hover:bg-muted/50 disabled:opacity-60"
              >
                {uploading ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
                <span className="text-sm font-semibold">{uploading ? "Mengunggah…" : "Ambil foto"}</span>
              </button>
              {source === "shopee" && (
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={uploading || saving}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border px-3 py-4 text-foreground transition hover:bg-muted/50 disabled:opacity-60"
                >
                  <ImageIcon size={24} />
                  <span className="text-sm font-semibold">Pilih dari galeri</span>
                </button>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {source === "shopee"
                ? `Wajib untuk setiap pengeluaran. Nota ${walletName(businessUnit)}/online: pilih screenshot dari galeri.`
                : `Wajib untuk setiap pengeluaran, difoto langsung dengan kamera. Galeri hanya untuk belanja lewat ${walletLabel(businessUnit)}.`}{" "}
              Tanpa struk? Foto layar aplikasi/ojek.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="min-w-[10rem] flex-1">
            <span className="sr-only">Toko atau supplier</span>
            <Input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Toko / supplier (opsional)"
              maxLength={80}
            />
          </label>
          {source === "laci" ? (
            <span className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Hari ini</span>
          ) : editDate ? (
            <input
              type="date"
              value={date}
              min={oldest}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditDate(true)}
              className="rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              {date === today ? "Hari ini" : date} · ubah
            </button>
          )}
        </div>
        {data.vendors.length > 0 && !vendor && (
          <div className="flex flex-wrap gap-1.5">
            {data.vendors.slice(0, 6).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVendor(v)}
                className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2. Isi nota */}
      <section className="space-y-2">
        <StepTitle n={2} title="Isi nota" done={lines.length > 0} />
        {lines.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {lines.map((l) => (
              <li key={l.key} className="flex items-start gap-3 px-3 py-2.5">
                <span
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                    l.kind === "bahan" ? "bg-quaternary/60" : "bg-tertiary/60"
                  )}
                >
                  {l.kind === "bahan" ? <PackagePlus size={15} /> : <Wallet size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  {l.kind === "bahan" ? (
                    <>
                      <p className="truncate text-sm font-semibold">
                        {l.material.name}
                        {(l.brandName || l.newBrandName) && <span className="font-normal text-muted-foreground"> · {l.brandName ?? l.newBrandName}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {nf(l.qty)} {l.unit} · Rp {nf(l.perUsage, 2)}/{l.material.usageUnit}
                        {l.deviation != null && Math.abs(l.deviation) >= 0.05 && (
                          <span className={cn("ml-1.5 font-semibold", needsPriceReview(l.deviation) ? "text-destructive" : "text-warning")}>
                            {l.deviation > 0 ? "+" : ""}
                            {Math.round(l.deviation * 100)}% vs biasa
                          </span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="truncate text-sm font-semibold">{l.description}</p>
                      <p className="text-xs text-muted-foreground">{categoryLabelFull(l.category)}</p>
                    </>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatRp(l.total)}</p>
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                    className="mt-0.5 text-muted-foreground hover:text-destructive"
                    aria-label="Hapus baris"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {composer === "bahan" && (
          <BahanComposer
            initialPicked={preselected}
            businessUnit={businessUnit}
            materials={materials}
            usageUnits={data.usageUnits}
            onAddMaterial={(m) => setMaterials((p) => [...p, m].sort((a, b) => a.name.localeCompare(b.name, "id")))}
            onCancel={() => setComposer(null)}
            onAdd={(line) => {
              setLines((p) => [...p, line]);
              setComposer(null);
            }}
          />
        )}
        {composer === "lain" && (
          <LainComposer
            onCancel={() => setComposer(null)}
            onAdd={(line) => {
              setLines((p) => [...p, line]);
              setComposer(null);
            }}
          />
        )}

        {composer === null && (
          <div className={cn("grid gap-2", access.lainOnly ? "grid-cols-1" : "grid-cols-2")}>
            {!access.lainOnly && (
            <button
              type="button"
              onClick={() => setComposer("bahan")}
              className="flex flex-col items-center gap-1 rounded-2xl border-2 border-foreground bg-quaternary/40 px-3 py-3.5 text-sm font-semibold shadow-hard-sm transition hover:-translate-y-0.5"
            >
              <PackagePlus size={20} /> Bahan baku
              <span className="text-[11px] font-normal text-muted-foreground">tepung, telur, kemasan…</span>
            </button>
            )}
            <button
              type="button"
              onClick={() => setComposer("lain")}
              className="flex flex-col items-center gap-1 rounded-2xl border-2 border-foreground bg-tertiary/40 px-3 py-3.5 text-sm font-semibold shadow-hard-sm transition hover:-translate-y-0.5"
            >
              <Wallet size={20} /> Pengeluaran lain
              <span className="text-[11px] font-normal text-muted-foreground">ongkir, galon, servis…</span>
            </button>
          </div>
        )}
      </section>

      {/* Bilah simpan */}
      <div className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.25)] backdrop-blur md:bottom-auto md:shadow-none md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              {lines.length} baris{missing ? ` · ${missing}` : ""}
            </p>
            <p className="font-display text-lg font-extrabold tabular-nums leading-tight">{formatRp(total)}</p>
            {source === "pengadaan" && walletAvail != null && total > walletAvail && (
              <p className="text-[11px] font-semibold text-destructive">
                Melebihi saldo uang pengadaan ({formatRp(walletAvail)}): saldo jadi −{formatRp(total - walletAvail)}
              </p>
            )}
            {dups.length > 0 && (
              <p className="text-[11px] font-semibold text-destructive">
                Mungkin dobel: {dups.map(dupText).join(" · ")}. Cek dulu sebelum menyimpan.
              </p>
            )}
            {source === "shopee" && shopeeAvail != null && total > shopeeAvail && (
              <p className="text-[11px] font-semibold text-destructive">
                Melebihi {walletLabel(businessUnit)} ({formatRp(shopeeAvail)}): saldo jadi −{formatRp(total - shopeeAvail)}. Sudah tambah
                saldo dari transferan owner?
              </p>
            )}
          </div>
          <Button type="button" onClick={save} disabled={!!missing || saving} loading={saving} className="px-6">
            <ReceiptText size={15} className="mr-1.5" /> {editing ? "Simpan perubahan" : "Simpan nota"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Input nominal: menyimpan TEKS yang diketik (bukan hanya digit) dan menampilkan hasil bacaannya di bawahnya, jadi
 * "45.500,00" atau "45500.00" dari struk tidak berubah jadi 4.550.000 dan salah ketik langsung terlihat.
 */
function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const n = parseMoneyId(value);
  return (
    <div className="space-y-0.5">
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(moneyText(e.target.value))} placeholder={placeholder} className={className} />
      <NumberHint value={value} />
      {n > 0 && (
        <p className="text-right text-[11px] tabular-nums text-muted-foreground">
          = Rp {n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
        </p>
      )}
    </div>
  );
}

function SourceCard({
  icon,
  title,
  desc,
  disabled,
  disabledReason,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-3 rounded-2xl border-2 border-foreground bg-card p-4 text-left shadow-hard-sm transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-border disabled:opacity-55 disabled:shadow-none"
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground">{disabled && disabledReason ? disabledReason : desc}</span>
      </span>
      <ChevronRight size={16} className="mt-2 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Harga acuan yang mudah dibaca: per satuan beli, plus per satuan pakai (menolong data master yang satuan belinya ambigu). */
function refPriceLabel(m: PurchaseMaterialOption): string {
  const perUsage = m.contentPerPurchase > 0 ? m.purchasePrice / m.contentPerPurchase : 0;
  if (m.purchaseUnit.toLowerCase() === m.usageUnit.toLowerCase()) {
    return `acuan ${formatRp(m.purchasePrice)} per ${nf(m.contentPerPurchase, 0)} ${m.usageUnit} · ≈ Rp ${nf(perUsage, 2)}/${m.usageUnit}`;
  }
  return `1 ${m.purchaseUnit} = ${nf(m.contentPerPurchase, 2)} ${m.usageUnit} · acuan ${formatRp(m.purchasePrice)}/${m.purchaseUnit} (≈ Rp ${nf(perUsage, 2)}/${m.usageUnit})`;
}

/** Ringkasan bahan di form nota: satuan beli, isi per satuan beli, dan harga acuannya — supaya petugas tak perlu membuka halaman Bahan. */
function MaterialRefCard({ m, onChange }: { m: PurchaseMaterialOption; onChange?: () => void }) {
  const perUsage = m.contentPerPurchase > 0 ? m.purchasePrice / m.contentPerPurchase : 0;
  const same = m.purchaseUnit.toLowerCase() === m.usageUnit.toLowerCase();
  return (
    <div className="space-y-2 rounded-xl bg-muted/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{m.name}</p>
        {onChange && (
          <button type="button" onClick={onChange} className="shrink-0 text-xs font-semibold text-primary hover:underline">
            Ganti
          </button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
        <dt className="text-muted-foreground">Satuan beli</dt>
        <dd className="font-semibold">{m.purchaseUnit}</dd>
        {!same && (
          <>
            <dt className="text-muted-foreground">Isi 1 {m.purchaseUnit}</dt>
            <dd className="font-semibold">
              {nf(m.contentPerPurchase, 2)} {m.usageUnit}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Harga acuan</dt>
        <dd className="font-semibold tabular-nums">
          {formatRp(m.purchasePrice)} {same ? `per ${nf(m.contentPerPurchase, 0)} ${m.usageUnit}` : `per ${m.purchaseUnit}`}
        </dd>
        <dt className="text-muted-foreground">Per {m.usageUnit}</dt>
        <dd className="font-semibold tabular-nums">≈ Rp {nf(perUsage, 2)}</dd>
      </dl>
    </div>
  );
}

function StepTitle({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <h2 className="flex items-center gap-2 font-display text-sm font-bold">
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full border-2 border-foreground text-[11px]",
          done ? "bg-success text-white" : "bg-card"
        )}
      >
        {done ? "✓" : n}
      </span>
      {title}
    </h2>
  );
}

/* ───────────────────────── Bahan baku ───────────────────────── */

function BahanComposer({
  initialPicked = null,
  businessUnit,
  materials,
  usageUnits,
  onAddMaterial,
  onAdd,
  onCancel,
}: {
  initialPicked?: PurchaseMaterialOption | null;
  businessUnit: string;
  materials: PurchaseMaterialOption[];
  usageUnits: { code: string; label: string }[];
  onAddMaterial: (m: PurchaseMaterialOption) => void;
  onAdd: (line: DraftLine) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PurchaseMaterialOption | null>(initialPicked);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(initialPicked?.unitChoices[0] ?? initialPicked?.purchaseUnit ?? "");
  const [total, setTotal] = useState("");
  const [proposing, setProposing] = useState(false);
  // Merek (opsional): bawaan = yang sedang dipakai/terakhir dibeli, jadi membeli merek yang sama tidak perlu mengetik apa pun.
  const [brandId, setBrandId] = useState<string | null>(initialPicked?.defaultBrandId ?? null);
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrand, setNewBrand] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? materials.filter((m) => m.name.toLowerCase().includes(q)) : materials;
    return list.slice(0, 30);
  }, [materials, query]);

  function pick(m: PurchaseMaterialOption) {
    setPicked(m);
    setUnit(m.unitChoices[0] ?? m.purchaseUnit);
    setQty("");
    setTotal("");
    setBrandId(m.defaultBrandId);
    setAddingBrand(false);
    setNewBrand("");
  }

  // Pratinjau langsung: konversi, harga per satuan pakai, selisih vs acuan.
  const calc = useMemo(() => {
    if (!picked) return null;
    const q = parseDecimalId(qty) ?? 0;
    const t = num(total);
    if (!(q > 0) || !(t > 0)) return null;
    const u = unit.trim().toLowerCase();
    let usage: number | null = null;
    // Urutan sama dengan server (convertQty): satuan pakai dulu — data lama bisa punya satuan beli = satuan pakai.
    if (u === picked.usageUnit.toLowerCase()) usage = q;
    else if (u === picked.purchaseUnit.toLowerCase()) usage = q * picked.contentPerPurchase;
    else usage = convertViaChoices(q, u, picked);
    if (usage == null || !(usage > 0)) return null;
    const perUsage = t / usage;
    const ref = picked.contentPerPurchase > 0 ? picked.purchasePrice / picked.contentPerPurchase : 0;
    const dev = picked.pending ? null : priceDeviation(perUsage, ref);
    return { q, t, usage, perUsage, ref, dev };
  }, [picked, qty, unit, total]);

  if (proposing) {
    return (
      <ProposeMaterial
        businessUnit={businessUnit}
        usageUnits={usageUnits}
        initialName={query}
        materials={materials}
        onUseExisting={(m) => {
          setProposing(false);
          pick(m);
        }}
        onCancel={() => setProposing(false)}
        onCreated={(m) => {
          onAddMaterial(m);
          setProposing(false);
          pick(m);
        }}
      />
    );
  }

  return (
    <div className="space-y-3 fixed inset-0 z-[60] overflow-y-auto bg-background p-4 pb-10 md:static md:z-auto md:overflow-visible md:rounded-2xl md:border-2 md:border-foreground md:bg-card md:p-3.5 md:pb-3.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Tambah bahan baku</h3>
        <button type="button" onClick={onCancel} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      {!picked ? (
        <>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari bahan (mis. tepung, telur, butter)"
              className="pl-8"
            />
          </div>
          <button
            type="button"
            onClick={() => setProposing(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <PackagePlus size={13} /> Bahan belum ada? Ajukan bahan baru
          </button>
          <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-xl border border-border md:max-h-64">
            {results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => pick(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {refPriceLabel(m)}
                    </span>
                  </span>
                  {m.pending && (
                    <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold">baru</span>
                  )}
                  <ChevronRight size={14} className="text-muted-foreground" />
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">Bahan &ldquo;{query}&rdquo; belum ada.</li>
            )}
          </ul>
        </>
      ) : (
        <>
          <MaterialRefCard m={picked} onChange={() => setPicked(null)} />

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Merek (opsional)</span>
            <div className="flex flex-wrap gap-1.5">
              {picked.brands.map((b) => {
                const on = !addingBrand && brandId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setAddingBrand(false);
                      setBrandId(b.id);
                    }}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      on ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {b.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setAddingBrand(false);
                  setBrandId(null);
                }}
                aria-pressed={!addingBrand && brandId === null}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  !addingBrand && brandId === null ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                Tanpa merek
              </button>
              <button
                type="button"
                onClick={() => setAddingBrand(true)}
                aria-pressed={addingBrand}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs font-semibold transition",
                  addingBrand ? "border-foreground bg-primary text-primary-foreground" : "border-border text-primary hover:bg-muted"
                )}
              >
                <Plus size={12} /> Merek baru
              </button>
            </div>
            {addingBrand && (
              <>
                <Input
                  autoFocus
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  placeholder="Nama merek (mis. Segitiga Biru)"
                  maxLength={80}
                />
                {!newBrand.trim() && <p className="text-[11px] text-muted-foreground">Ketik nama merek, atau pilih &ldquo;Tanpa merek&rdquo; di atas.</p>}
              </>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Jumlah dibeli (pilih satuan sesuai nota)
            </span>
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="0"
                className="w-28 text-right tabular-nums"
              />
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {picked.unitChoices.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      unit.toLowerCase() === u.toLowerCase()
                        ? "border-foreground bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <NumberHint value={qty} />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Total harga (sesuai nota)</span>
            <MoneyInput
              value={total}
              onChange={setTotal}
              placeholder="Rp 0"
              className="text-right text-base font-semibold tabular-nums"
            />
          </div>

          {calc && (
            <div
              className={cn(
                "rounded-xl px-3 py-2 text-xs",
                needsPriceReview(calc.dev) ? "bg-destructive/10 text-foreground" : "bg-muted/60 text-muted-foreground"
              )}
            >
              <p>
                Dibeli {nf(calc.q, 2)} {unit}
                {unit.toLowerCase() !== picked.usageUnit.toLowerCase() && <> = {nf(calc.usage, 2)} {picked.usageUnit}</>}
                {unit.toLowerCase() === picked.usageUnit.toLowerCase() &&
                  picked.purchaseUnit.toLowerCase() !== picked.usageUnit.toLowerCase() &&
                  picked.contentPerPurchase > 0 && (
                    <> = {nf(calc.usage / picked.contentPerPurchase, 2)} {picked.purchaseUnit}</>
                  )}
              </p>
              <p>
                ≈ <b className="text-foreground">Rp {nf(calc.perUsage, 2)}</b> per {picked.usageUnit} · masuk stok{" "}
                {nf(calc.usage, 1)} {picked.usageUnit}
              </p>
              {calc.ref > 0 && (
                <p>
                  Menurut harga acuan, jumlah ini ≈ <b className="text-foreground">{formatRp(Math.round(calc.ref * calc.usage))}</b>
                </p>
              )}
              {calc.dev != null && (
                <p className="mt-0.5">
                  {needsPriceReview(calc.dev) ? (
                    <span className="inline-flex items-start gap-1">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-destructive" />
                      Harga {calc.dev > 0 ? "lebih mahal" : "lebih murah"} {Math.round(Math.abs(calc.dev) * 100)}% dari biasanya (
                      {Math.round(PRICE_REVIEW_THRESHOLD * 100)}% batas wajar). Periksa nominal &amp; satuan. Tetap bisa
                      disimpan — owner akan meninjau.
                    </span>
                  ) : Math.abs(calc.dev) >= 0.05 ? (
                    <>
                      {calc.dev > 0 ? "+" : ""}
                      {Math.round(calc.dev * 100)}% dari harga biasa
                    </>
                  ) : (
                    "Harga sesuai biasanya ✓"
                  )}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Batal
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!calc || (addingBrand && !newBrand.trim())}
              onClick={() =>
                calc &&
                onAdd({
                  key: crypto.randomUUID(),
                  kind: "bahan",
                  material: picked,
                  qty: calc.q,
                  unit,
                  total: calc.t,
                  perUsage: calc.perUsage,
                  deviation: calc.dev,
                  ...(addingBrand && newBrand.trim()
                    ? { brandId: null, brandName: null, newBrandName: newBrand.trim().replace(/\s+/g, " ") }
                    : { brandId, brandName: picked.brands.find((b) => b.id === brandId)?.name ?? null, newBrandName: null }),
                })
              }
            >
              Tambah ke nota
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Konversi satuan lain (mis. kg ↔ gram) memakai pilihan satuan yang sudah dihitung server. */
function convertViaChoices(q: number, unit: string, m: PurchaseMaterialOption): number | null {
  const factor: Record<string, number> = { kg: 1000, gram: 1, liter: 1000, ml: 1, pcs: 1, lusin: 12, kodi: 20, meter: 1, cm: 0.01 };
  const from = factor[unit];
  const to = factor[m.usageUnit.toLowerCase()];
  if (!from || !to) return null;
  return (q * from) / to;
}

function ProposeMaterial({
  businessUnit,
  usageUnits,
  initialName,
  materials,
  onUseExisting,
  onCancel,
  onCreated,
}: {
  businessUnit: string;
  usageUnits: { code: string; label: string }[];
  initialName: string;
  materials: PurchaseMaterialOption[];
  onUseExisting: (m: PurchaseMaterialOption) => void;
  onCancel: () => void;
  onCreated: (m: PurchaseMaterialOption) => void;
}) {
  const [name, setName] = useState(initialName);
  const similar = useMemo(() => findSimilarMaterials(name, materials), [name, materials]);
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [content, setContent] = useState("");
  const [usageUnit, setUsageUnit] = useState(usageUnits[0]?.code ?? "gram");
  const [price, setPrice] = useState("");
  const [pending, start] = useTransition();

  const contentNum = parseDecimalId(content) ?? 0;
  const priceNum = num(price);
  const ok = name.trim().length >= 2 && purchaseUnit.trim() && contentNum > 0 && priceNum > 0;

  function submit() {
    start(async () => {
      const res = await proposeMaterial({
        businessUnit,
        name,
        purchaseUnit,
        contentPerPurchase: contentNum,
        usageUnit,
        purchasePrice: priceNum,
      });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal" : res.error);
        return;
      }
      toast.success(res.data.existed ? "Bahan itu sudah ada — dipilih" : "Bahan diajukan — owner akan meninjau");
      onCreated({
        id: res.data.id,
        name: name.trim(),
        category: null,
        purchaseUnit: purchaseUnit.trim(),
        purchasePrice: priceNum,
        contentPerPurchase: contentNum,
        usageUnit,
        pending: true,
        unitChoices: [purchaseUnit.trim(), usageUnit],
        brands: [],
        defaultBrandId: null,
      });
    });
  }

  return (
    <div className="space-y-3 fixed inset-0 z-[60] overflow-y-auto bg-background p-4 pb-10 md:static md:z-auto md:overflow-visible md:rounded-2xl md:border-2 md:border-foreground md:bg-card md:p-3.5 md:pb-3.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Ajukan bahan baru</h3>
        <button type="button" onClick={onCancel} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Langsung bisa dipakai di nota ini. Owner akan merapikan nama &amp; satuannya sebelum dipakai di resep.
      </p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama bahan (mis. Tepung Segitiga Biru)" maxLength={80} />
      {similar.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-warning/60 bg-warning/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <AlertTriangle size={13} className="shrink-0" /> Mungkin bahan ini sudah ada — cek dulu:
          </p>
          <ul className="divide-y divide-border/60">
            {similar.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onUseExisting(m)}
                  className="flex w-full items-center gap-2 py-1.5 text-left hover:opacity-80"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{refPriceLabel(m)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary">Pakai ini</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Satuan beli</span>
          <select
            value={purchaseUnit}
            onChange={(e) => setPurchaseUnit(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-base md:text-sm"
          >
            <option value="">Pilih…</option>
            {PURCHASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Harga per satuan beli</span>
          <MoneyInput value={price} onChange={setPrice} placeholder="Rp 0" className="text-right tabular-nums" />
        </label>
      </div>
      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Isi tiap {purchaseUnit.trim() || "satuan beli"} (dalam satuan pakai)
        </span>
        <NumberHint value={content} />
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            value={content}
            onChange={(e) => setContent(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="mis. 25.000"
            className="flex-1 text-right tabular-nums"
          />
          <div className="flex gap-1.5">
            {usageUnits.map((u) => (
              <button
                key={u.code}
                type="button"
                onClick={() => setUsageUnit(u.code)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  usageUnit === u.code ? "border-foreground bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                )}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Contoh: 1 sak tepung = 25.000 gram.</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Batal
        </Button>
        <Button type="button" className="flex-1" disabled={!ok || pending} loading={pending} onClick={submit}>
          Ajukan &amp; pilih
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Pengeluaran lain ───────────────────────── */

function LainComposer({ onAdd, onCancel }: { onAdd: (line: DraftLine) => void; onCancel: () => void }) {
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [wizard, setWizard] = useState(false);

  const suggestions = useMemo(() => {
    const s = description.trim() ? searchCategories(description) : [];
    return s.slice(0, 3);
  }, [description]);
  const picked = category ? expenseCategory(category) : null;
  const ok = description.trim().length >= 2 && num(total) > 0 && !!category;

  return (
    <div className="space-y-3 fixed inset-0 z-[60] overflow-y-auto bg-background p-4 pb-10 md:static md:z-auto md:overflow-visible md:rounded-2xl md:border-2 md:border-foreground md:bg-card md:p-3.5 md:pb-3.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Tambah pengeluaran lain</h3>
        <button type="button" onClick={onCancel} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      <Input
        autoFocus
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beli apa? (mis. ongkir pak joko, galon isi ulang)"
        maxLength={120}
      />
      <MoneyInput value={total} onChange={setTotal} placeholder="Nominal (Rp)" className="text-right text-base font-semibold tabular-nums" />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Masuk kategori apa?</span>
          <button
            type="button"
            onClick={() => setWizard(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <HelpCircle size={12} /> Bingung? Bantu pilih
          </button>
        </div>

        {wizard && (
          <CategoryWizard
            onPick={(c) => {
              setCategory(c);
              setWizard(false);
            }}
            onClose={() => setWizard(false)}
          />
        )}

        {!wizard && (
          <>
            {suggestions.length > 0 && !category && (
              <div className="flex flex-wrap gap-1.5">
                <span className="self-center text-[11px] text-muted-foreground">Sepertinya:</span>
                {suggestions.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className="rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-foreground hover:bg-primary/20"
                  >
                    {c.label} <span className="font-normal text-muted-foreground">({c.value})</span>
                  </button>
                ))}
              </div>
            )}

            {picked && (
              <div className="rounded-xl border border-success/50 bg-success/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {picked.label} <span className="font-normal text-muted-foreground">({picked.value})</span>
                  </p>
                  <button type="button" onClick={() => setCategory(null)} className="text-xs font-semibold text-primary hover:underline">
                    Ganti
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">{picked.examples}</p>
              </div>
            )}

            {!picked && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  {showAll ? "Sembunyikan daftar" : "Lihat semua kategori"}
                </button>
                {showAll && (
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <li key={c.value}>
                        <button
                          type="button"
                          onClick={() => setCategory(c.value)}
                          className="w-full px-3 py-2 text-left hover:bg-muted"
                        >
                          <span className="block text-sm font-semibold">
                            {c.label} <span className="font-normal text-muted-foreground">({c.value})</span>
                          </span>
                          <span className="block text-[11px] text-muted-foreground">{c.examples}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Batal
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!ok}
          onClick={() =>
            category &&
            onAdd({ key: crypto.randomUUID(), kind: "lain", category, description: description.trim(), total: num(total) })
          }
        >
          Tambah ke nota
        </Button>
      </div>
    </div>
  );
}

/** "Bantu pilih": pohon pertanyaan (WIZARD_ROOT) — mencakup SEMUA kategori, termasuk gaji, dividen, refund, dan sewa. */
function CategoryWizard({ onPick, onClose }: { onPick: (category: string) => void; onClose: () => void }) {
  // Jejak jawaban: tiap elemen = indeks opsi yang dipilih; node saat ini = hasil menelusuri jejak dari akar.
  const [trail, setTrail] = useState<number[]>([]);
  let node: WizardNode = WIZARD_ROOT;
  for (const idx of trail) {
    if (!("options" in node)) break;
    node = node.options[idx].next;
  }
  const result = "category" in node ? expenseCategory(node.category) : null;

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Bantu pilih kategori</span>
        <button type="button" onClick={onClose} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>
      {"options" in node ? (
        <>
          <p className="text-sm font-medium">{node.question}</p>
          <div className="grid gap-1.5">
            {node.options.map((o, i) => (
              <button
                key={o.text}
                type="button"
                onClick={() => setTrail((t) => [...t, i])}
                className="rounded-xl border-2 border-foreground bg-card px-3 py-2 text-left hover:bg-muted"
              >
                <span className="block text-sm font-semibold">{o.text}</span>
                {o.hint && <span className="block text-[11px] text-muted-foreground">{o.hint}</span>}
              </button>
            ))}
          </div>
          {trail.length > 0 && (
            <button type="button" onClick={() => setTrail((t) => t.slice(0, -1))} className="text-xs font-semibold text-primary hover:underline">
              Kembali
            </button>
          )}
        </>
      ) : result ? (
        <>
          <p className="text-sm">
            Masukkan ke <b>{result.label}</b> <span className="text-muted-foreground">({result.value})</span>
          </p>
          <p className="text-[11px] text-muted-foreground">{result.examples}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1" onClick={() => onPick(result.value)}>
              Pakai kategori ini
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setTrail([])}>
              Ulangi
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Belum ketemu. Tutup ini dan pilih dari &ldquo;Lihat semua kategori&rdquo;, atau tanya admin.
        </p>
      )}
    </div>
  );
}
