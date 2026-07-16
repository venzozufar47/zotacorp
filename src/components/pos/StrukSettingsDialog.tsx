"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Printer, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  loadReceiptTransport,
  saveReceiptTransport,
  type PrintMethod,
  type ReceiptContent,
  type ReceiptLabels,
  type ReceiptTransport,
} from "@/lib/pos/receipt-settings";
import { savePosReceiptConfig } from "@/lib/actions/pos-receipt-config.actions";
import { buildReceiptBytes, formatReceiptDateTime, type ReceiptData } from "@/lib/pos/receipt";
import { escPosToPreviewText } from "@/lib/pos/escpos";
import { sendToPrinter } from "@/lib/pos/print-transport";

const METHOD_OPTIONS: Array<{ id: PrintMethod; label: string; hint: string }> = [
  { id: "rawbt", label: "RawBT", hint: "Perlu app RawBT. Paling andal (Bluetooth Classic + LE)." },
  { id: "webbluetooth", label: "Web Bluetooth", hint: "Tanpa app, langsung Chrome. Hanya printer Bluetooth LE." },
  { id: "native", label: "Native", hint: "Lewat app native (belum tersedia — menyusul)." },
];

/** Kolom editor label — caption Indonesia untuk tiap teks tetap struk. */
const LABEL_FIELDS: Array<{ key: keyof ReceiptLabels; caption: string }> = [
  { key: "branch", caption: "Label cabang" },
  { key: "cashier", caption: "Label kasir" },
  { key: "customer", caption: "Label nama" },
  { key: "dineIn", caption: "Dine-in" },
  { key: "takeAway", caption: "Take-away" },
  { key: "subtotal", caption: "Subtotal" },
  { key: "discount", caption: "Diskon" },
  { key: "total", caption: "Total" },
  { key: "cash", caption: "Tunai" },
  { key: "change", caption: "Kembalian" },
  { key: "method", caption: "Label metode" },
  { key: "methodCash", caption: "Nama metode Cash" },
  { key: "methodQris", caption: "Nama metode QRIS" },
  { key: "methodPending", caption: "Nama metode Pesanan" },
  { key: "methodAdmin", caption: "Nama metode Admin" },
];

/**
 * Setelan struk. KONTEN (header/alamat/footer/cabang/label) disimpan di
 * SERVER per rekening → sama di semua perangkat. TRANSPORT (metode cetak +
 * auto-cetak) tetap device-local. Menyediakan Pratinjau & Tes cetak.
 */
export function StrukSettingsDialog({
  bankAccountId,
  brand,
  branch,
  initialContent,
  now,
  onClose,
}: {
  bankAccountId: string;
  /** Nama outlet (untuk placeholder). */
  brand: string;
  branch: string | null;
  /** Konten tersimpan di server (dibagikan). */
  initialContent: ReceiptContent;
  /** Waktu untuk contoh struk (dilewatkan supaya komponen tetap murni). */
  now: Date;
  onClose: () => void;
}) {
  const router = useRouter();
  const [c, setC] = useState<ReceiptContent>(initialContent);
  const initialTransport = useMemo(() => loadReceiptTransport(), []);
  const [t, setT] = useState<ReceiptTransport>(initialTransport);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function sampleData(): ReceiptData {
    const effBranch = c.showBranch ? c.branchOverride.trim() || branch : null;
    return {
      header: c.header,
      branch: effBranch,
      address: c.address,
      datetime: formatReceiptDateTime(now),
      cashierName: "Kasir Contoh",
      customerName: "Contoh",
      fulfillment: "dine_in",
      items: [
        { name: "Matcha Latte", qty: 2, subtotal: 30000 },
        { name: "Croissant", qty: 1, subtotal: 18000 },
      ],
      grossTotal: 48000,
      discountAmount: 3000,
      total: 45000,
      method: "cash",
      cashReceived: 50000,
      change: 5000,
      footer: c.footer,
      wifi: c.wifi,
      saleShortId: "contoh12",
      labels: c.labels,
    };
  }

  function setLabel(key: keyof ReceiptLabels, value: string) {
    setC({ ...c, labels: { ...c.labels, [key]: value } });
  }

  function onPreview() {
    setPreview(escPosToPreviewText(buildReceiptBytes(sampleData())));
  }

  async function onTestPrint() {
    try {
      await sendToPrinter(buildReceiptBytes(sampleData()), t.method);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memicu cetak");
    }
  }

  function onSave() {
    // Transport (device-local) langsung; konten (bersama) ke server.
    saveReceiptTransport(t);
    startSave(async () => {
      const res = await savePosReceiptConfig(bankAccountId, c);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menyimpan setelan struk");
        return;
      }
      toast.success("Setelan struk disimpan (berlaku di semua perangkat)");
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-4 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Setelan struk
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-foreground">Printer 58mm</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground -mt-1">
          Header, alamat, footer &amp; label berlaku di <strong>semua perangkat</strong>.
          Metode cetak &amp; auto-cetak hanya untuk perangkat ini.
        </p>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Header (brand)</span>
          <input
            className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
            value={c.header}
            onChange={(e) => setC({ ...c, header: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Alamat (opsional, bisa multi-baris)</span>
          <textarea
            className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
            rows={2}
            value={c.address}
            onChange={(e) => setC({ ...c, address: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Footer</span>
          <input
            className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
            value={c.footer}
            onChange={(e) => setC({ ...c, footer: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">
            WiFi (opsional, bisa multi-baris)
          </span>
          <textarea
            className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
            rows={2}
            placeholder={"WiFi: Haengbocake\nPassword: kopienak"}
            value={c.wifi}
            onChange={(e) => setC({ ...c, wifi: e.target.value })}
          />
        </label>

        {/* Cabang */}
        <div className="rounded-xl border border-border bg-background px-3 py-2.5 space-y-2">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">
              Tampilkan cabang
            </span>
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={c.showBranch}
              onChange={(e) => setC({ ...c, showBranch: e.target.checked })}
            />
          </label>
          {c.showBranch && (
            <input
              className="w-full rounded-lg border-2 border-border bg-card px-3 py-2 text-sm"
              placeholder={branch ? `Default: ${branch}` : "Isi nama cabang"}
              value={c.branchOverride}
              onChange={(e) => setC({ ...c, branchOverride: e.target.value })}
            />
          )}
        </div>

        {/* Editor label — semua teks tetap struk */}
        <details className="rounded-xl border border-border bg-background px-3 py-2.5">
          <summary className="text-sm font-medium text-foreground cursor-pointer">
            Teks &amp; label lanjutan
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {LABEL_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="text-[11px] text-muted-foreground">{f.caption}</span>
                <input
                  className="mt-0.5 w-full rounded-lg border-2 border-border bg-card px-2 py-1.5 text-sm"
                  value={c.labels[f.key]}
                  onChange={(e) => setLabel(f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </details>

        <div>
          <span className="text-xs font-medium text-foreground">
            Metode cetak <span className="text-muted-foreground">(perangkat ini)</span>
          </span>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {METHOD_OPTIONS.map((m) => {
              const active = t.method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setT({ ...t, method: m.id })}
                  className={`h-10 rounded-lg text-xs font-semibold border-2 transition ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {METHOD_OPTIONS.find((m) => m.id === t.method)?.hint}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span className="text-sm">
            <span className="font-medium text-foreground">Auto-cetak</span>
            <span className="block text-[11px] text-muted-foreground">
              Cetak otomatis tiap sale lunas (cash/QRIS) — perangkat ini.
            </span>
          </span>
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={t.autoPrint}
            onChange={(e) => setT({ ...t, autoPrint: e.target.checked })}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPreview}
            className="flex-1 h-10 rounded-xl border-2 border-border text-sm font-medium hover:bg-muted inline-flex items-center justify-center gap-1.5"
          >
            <Eye size={15} /> Pratinjau
          </button>
          <button
            type="button"
            onClick={onTestPrint}
            className="flex-1 h-10 rounded-xl border-2 border-border text-sm font-medium hover:bg-muted inline-flex items-center justify-center gap-1.5"
          >
            <Printer size={15} /> Tes cetak
          </button>
        </div>

        {preview && (
          <pre className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-tight font-mono whitespace-pre overflow-x-auto">
            {preview}
          </pre>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
