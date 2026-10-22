"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Loader2,
  Landmark,
  PackagePlus,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { compressImageStrict } from "@/lib/images/compress-image";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { parseDecimalId } from "@/components/admin/costing/fields";
import {
  EXPENSE_CATEGORIES,
  expenseCategory,
  searchCategories,
  suggestFromWizard,
  type WizardAnswers,
} from "@/lib/procurement/categories";
import { needsPriceReview, priceDeviation, PRICE_REVIEW_THRESHOLD } from "@/lib/procurement/purchase-math";
import {
  createPurchase,
  discardPurchaseReceipt,
  proposeMaterial,
  uploadPurchaseReceipt,
  type MoneySource,
  type PurchaseFormData,
  type PurchaseLineInput,
  type PurchaseMaterialOption,
} from "@/lib/actions/procurement-purchases.actions";

const digits = (v: string) => v.replace(/[^0-9]/g, "");
const num = (v: string) => Number(digits(v)) || 0;
const nf = (n: number, max = 2) => n.toLocaleString("id-ID", { maximumFractionDigits: max });

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
    }
  | { key: string; kind: "lain"; category: string; description: string; total: number };

export function PurchaseForm({
  data,
  onSaved,
}: {
  data: PurchaseFormData;
  /** Dipanggil setelah nota tersimpan, untuk pindah ke Riwayat bila diminta. */
  onSaved?: () => void;
}) {
  const businessUnit = data.businessUnit;
  const today = jakartaDateString(new Date());
  const oldest = jakartaDateString(new Date(Date.now() - 7 * 86_400_000));

  const [materials, setMaterials] = useState<PurchaseMaterialOption[]>(data.materials);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(today);
  const [editDate, setEditDate] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [composer, setComposer] = useState<"bahan" | "lain" | null>(null);
  const { access } = data;
  // Sumber uang: bila hanya satu yang tersedia dipilih otomatis; bila dua, WAJIB dipilih (tanpa bawaan) —
  // salah sumber membuat kas laci tidak cocok.
  const [source, setSource] = useState<MoneySource | null>(
    access.pengadaan && !access.laci ? "pengadaan" : !access.pengadaan && access.laci ? "laci" : null
  );
  const [saving, startSaving] = useTransition();
  const [done, setDone] = useState<{ total: number; lines: number; flagged: number; source: MoneySource } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const total = lines.reduce((s, l) => s + l.total, 0);
  const missing = !source
    ? "Pilih sumber uang dulu"
    : !receiptPath
    ? "Ambil foto nota dulu"
    : lines.length === 0
      ? "Tambahkan minimal satu baris"
      : uploading
        ? "Foto sedang diunggah…"
        : null;

  async function onPickFile(file: File | null) {
    if (!file) return;
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
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPath(res.data.path);
      setReceiptPreview(URL.createObjectURL(small));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memproses foto");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    if (missing || !receiptPath || !source) return;
    const payload: PurchaseLineInput[] = lines.map((l) =>
      l.kind === "bahan"
        ? { kind: "bahan", materialId: l.material.id, qty: l.qty, unit: l.unit, total: l.total }
        : { kind: "lain", category: l.category, description: l.description, total: l.total }
    );
    startSaving(async () => {
      const res = await createPurchase({
        businessUnit,
        moneySource: source,
        receiptPath,
        purchaseDate: date,
        vendor: vendor.trim() || null,
        lines: payload,
      });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal menyimpan nota" : res.error);
        return;
      }
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setDone({ total: res.data.total, lines: lines.length, flagged: res.data.flagged, source });
      setLines([]);
      setReceiptPath(null);
      setReceiptPreview(null);
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
            {formatRp(done.total)} · {done.lines} baris — sudah masuk buku kas
            {done.source === "laci" ? " dan mengurangi kas laci shift ini." : " dan (untuk bahan) stok."}
          </p>
        </div>
        {done.flagged > 0 && (
          <p className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-foreground">
            {done.flagged} harga bahan jauh dari biasanya — admin akan meninjau. Harga acuan belum diubah.
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
          desc="Uang yang kamu bawa untuk belanja. Tidak mengubah kas laci kasir."
          disabled={!access.pengadaan}
          disabledReason="Hanya untuk petugas pengadaan"
          onClick={() => setSource("pengadaan")}
        />
        <SourceCard
          icon={<Landmark size={20} />}
          title="Uang laci kasir"
          desc={
            access.shiftCashier
              ? `Dibayar dari laci shift ${access.shiftCashier}. Mengurangi kas laci — ikut dihitung saat tutup shift.`
              : "Dibayar dari laci kasir. Mengurangi kas laci saat shift berjalan."
          }
          disabled={!access.laci}
          disabledReason={access.laciReason ?? undefined}
          onClick={() => setSource("laci")}
        />
        <p className="text-[11px] text-muted-foreground">
          Salah memilih membuat kas laci tidak cocok. Ragu? Tanyakan: apakah uangnya diambil dari laci kasir?
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-28">
      {(access.pengadaan && access.laci) && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
          <span>
            Sumber uang: <b>{source === "laci" ? "Uang laci kasir" : "Uang pengadaan"}</b>
          </span>
          <button
            type="button"
            disabled={lines.length > 0}
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
        />
        {receiptPreview ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receiptPreview} alt="Nota" className="size-16 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Foto nota siap</p>
              <p className="text-xs text-muted-foreground">Pastikan total dan tanggal di nota terbaca jelas.</p>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              {uploading ? "Mengunggah…" : "Ganti"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/40 bg-card px-4 py-7 text-muted-foreground transition hover:bg-muted/50 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={26} className="animate-spin" /> : <Camera size={26} />}
            <span className="text-sm font-semibold text-foreground">
              {uploading ? "Mengunggah foto…" : "Ambil foto nota"}
            </span>
            <span className="text-xs">Wajib untuk setiap pengeluaran. Tanpa struk? Foto layar aplikasi/ojek.</span>
          </button>
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
          {editDate ? (
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
                      <p className="truncate text-sm font-semibold">{l.material.name}</p>
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
                      <p className="text-xs text-muted-foreground">{expenseCategory(l.category)?.label ?? l.category}</p>
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              {lines.length} baris{missing ? ` · ${missing}` : ""}
            </p>
            <p className="font-display text-lg font-extrabold tabular-nums leading-tight">{formatRp(total)}</p>
          </div>
          <Button type="button" onClick={save} disabled={!!missing || saving} loading={saving} className="px-6">
            <ReceiptText size={15} className="mr-1.5" /> Simpan nota
          </Button>
        </div>
      </div>
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
  const perBuy =
    m.purchaseUnit.toLowerCase() === m.usageUnit.toLowerCase()
      ? `${formatRp(m.purchasePrice)} per ${nf(m.contentPerPurchase, 0)} ${m.usageUnit}`
      : `${formatRp(m.purchasePrice)} / ${m.purchaseUnit}`;
  return `${perBuy} · ≈ Rp ${nf(perUsage, 2)}/${m.usageUnit}`;
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
  businessUnit,
  materials,
  usageUnits,
  onAddMaterial,
  onAdd,
  onCancel,
}: {
  businessUnit: string;
  materials: PurchaseMaterialOption[];
  usageUnits: { code: string; label: string }[];
  onAddMaterial: (m: PurchaseMaterialOption) => void;
  onAdd: (line: DraftLine) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PurchaseMaterialOption | null>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [total, setTotal] = useState("");
  const [proposing, setProposing] = useState(false);

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
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-3.5">
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
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
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
                      Harga acuan {refPriceLabel(m)}
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
          <button
            type="button"
            onClick={() => setProposing(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <PackagePlus size={13} /> Bahan belum ada? Ajukan bahan baru
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{picked.name}</p>
              <p className="text-[11px] text-muted-foreground">
                Harga acuan {refPriceLabel(picked)}
              </p>
            </div>
            <button type="button" onClick={() => setPicked(null)} className="text-xs font-semibold text-primary hover:underline">
              Ganti
            </button>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Jumlah dibeli</span>
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
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Total harga (sesuai nota)</span>
            <Input
              inputMode="numeric"
              value={total ? num(total).toLocaleString("id-ID") : ""}
              onChange={(e) => setTotal(digits(e.target.value))}
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
                ≈ <b className="text-foreground">Rp {nf(calc.perUsage, 2)}</b> per {picked.usageUnit} · masuk stok{" "}
                {nf(calc.usage, 1)} {picked.usageUnit}
              </p>
              {calc.dev != null && (
                <p className="mt-0.5">
                  {needsPriceReview(calc.dev) ? (
                    <span className="inline-flex items-start gap-1">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-destructive" />
                      Harga {calc.dev > 0 ? "lebih mahal" : "lebih murah"} {Math.round(Math.abs(calc.dev) * 100)}% dari biasanya (
                      {Math.round(PRICE_REVIEW_THRESHOLD * 100)}% batas wajar). Periksa nominal &amp; satuan. Tetap bisa
                      disimpan — admin akan meninjau.
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
              disabled={!calc}
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
  const factor: Record<string, number> = { kg: 1000, gram: 1, liter: 1000, ml: 1, pcs: 1, lusin: 12, kodi: 20 };
  const from = factor[unit];
  const to = factor[m.usageUnit.toLowerCase()];
  if (!from || !to) return null;
  return (q * from) / to;
}

function ProposeMaterial({
  businessUnit,
  usageUnits,
  initialName,
  onCancel,
  onCreated,
}: {
  businessUnit: string;
  usageUnits: { code: string; label: string }[];
  initialName: string;
  onCancel: () => void;
  onCreated: (m: PurchaseMaterialOption) => void;
}) {
  const [name, setName] = useState(initialName);
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
      toast.success(res.data.existed ? "Bahan itu sudah ada — dipilih" : "Bahan diajukan — admin akan meninjau");
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
      });
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-3.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Ajukan bahan baru</h3>
        <button type="button" onClick={onCancel} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Langsung bisa dipakai di nota ini. Admin akan merapikan nama &amp; satuannya sebelum dipakai di resep.
      </p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama bahan (mis. Tepung Segitiga Biru)" maxLength={80} />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Satuan beli</span>
          <Input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} placeholder="sak, dus, pack…" maxLength={20} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Harga per satuan beli</span>
          <Input
            inputMode="numeric"
            value={price ? num(price).toLocaleString("id-ID") : ""}
            onChange={(e) => setPrice(digits(e.target.value))}
            placeholder="Rp 0"
            className="text-right tabular-nums"
          />
        </label>
      </div>
      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Isi tiap {purchaseUnit.trim() || "satuan beli"} (dalam satuan pakai)
        </span>
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            value={content}
            onChange={(e) => setContent(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="mis. 25000"
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
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-3.5">
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
      <Input
        inputMode="numeric"
        value={total ? num(total).toLocaleString("id-ID") : ""}
        onChange={(e) => setTotal(digits(e.target.value))}
        placeholder="Nominal (Rp)"
        className="text-right text-base font-semibold tabular-nums"
      />

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
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {picked && (
              <div className="rounded-xl border border-success/50 bg-success/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{picked.label}</p>
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
                          <span className="block text-sm font-semibold">{c.label}</span>
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

/** "Bantu pilih": tiga pertanyaan ya/tidak → kategori. */
function CategoryWizard({ onPick, onClose }: { onPick: (category: string) => void; onClose: () => void }) {
  const [answers, setAnswers] = useState<WizardAnswers>({ intoProduct: null, isService: null, durable: null });
  const step = answers.intoProduct === null ? 0 : answers.intoProduct ? 3 : answers.isService === null ? 1 : answers.isService ? 3 : answers.durable === null ? 2 : 3;
  const result = step === 3 ? suggestFromWizard(answers) : null;

  const questions = [
    { key: "intoProduct" as const, text: "Barang ini jadi bagian produk yang dijual (atau kemasannya)?" },
    { key: "isService" as const, text: "Ini jasa atau biaya perbaikan, bukan barang?" },
    { key: "durable" as const, text: "Barangnya tahan lama (dipakai bertahun-tahun, seperti oven atau rak)?" },
  ];

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Bantu pilih kategori</span>
        <button type="button" onClick={onClose} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>
      {step < 3 ? (
        <>
          <p className="text-sm font-medium">{questions[step].text}</p>
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [questions[step].key]: v }))}
                className="flex-1 rounded-full border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
              >
                {v ? "Ya" : "Bukan"}
              </button>
            ))}
          </div>
        </>
      ) : result ? (
        <>
          <p className="text-sm">
            Masukkan ke <b>{result.label}</b>
          </p>
          <p className="text-[11px] text-muted-foreground">{result.examples}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1" onClick={() => onPick(result.value)}>
              Pakai kategori ini
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAnswers({ intoProduct: null, isService: null, durable: null })}>
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
