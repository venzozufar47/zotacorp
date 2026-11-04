"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { PosProduct } from "@/lib/actions/pos.actions";
import { createStockMovements } from "@/lib/actions/pos-stock.actions";
import { listReadyCakeItems, type ReadyCakeItem } from "@/lib/actions/pos-ready-cake.actions";
import { formatRp } from "@/lib/cashflow/format";
import {
  authorizerNames,
  POS_OPERATION_LABEL_ID,
  type PosAuthorizerRef,
} from "@/lib/pos-pin-format";
import { useRouter } from "next/navigation";
import { PosPinAuthDialog } from "./PosPinAuthDialog";
import {
  DEFAULT_WITHDRAWAL_REASON,
  WITHDRAWAL_REASON_GROUPS,
  WITHDRAWAL_REASON_META,
  type WithdrawalReason,
} from "@/lib/pos/withdrawal-reasons";

interface Props {
  bankAccountId: string;
  products: PosProduct[];
  type: "production" | "withdrawal";
  /** Siapa saja yang PIN-nya diterima. Kosong = tanpa gerbang PIN. */
  authorizers: PosAuthorizerRef[];
  onClose: () => void;
}

/** Opsi flat: produk tanpa varian → 1 opsi, produk dengan varian → 1 opsi per varian. */
interface SkuOption {
  key: string;
  label: string;
  productId: string;
  variantId: string | null;
  /** Ready Cake (stok khusus): yang ditarik adalah kue yang dipilih kasir, bukan jumlah ketikan. */
  readyCake: boolean;
  /** Pembatas jenis kue untuk varian Ready Cake: true = DIY, false = Reguler, null = semua. */
  readyCakeDiy: boolean | null;
}

/** Satu baris input di form (SKU + qty + alasan). */
interface Line {
  /** Key React lokal — stabil selama baris hidup. */
  id: number;
  skuKey: string;
  qty: string;
  /** Hanya dipakai saat type="withdrawal"; diabaikan untuk produksi. */
  reason: WithdrawalReason;
  /** Hanya untuk baris Ready Cake: id pesanan kue yang dicentang. */
  cakeIds: string[];
}

function readyCakeAge(readyAt: string | null): string {
  if (!readyAt) return "";
  const days = Math.floor((Date.now() - new Date(readyAt).getTime()) / 86_400_000);
  return days <= 0 ? "hari ini" : `${days} hari`;
}

export function StockMovementDialog({
  bankAccountId,
  products,
  type,
  authorizers,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextId = useRef(1);
  const [lines, setLines] = useState<Line[]>([
    { id: 0, skuKey: "", qty: "", reason: DEFAULT_WITHDRAWAL_REASON, cakeIds: [] },
  ]);
  const [notes, setNotes] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [readyCakes, setReadyCakes] = useState<ReadyCakeItem[] | null>(null);

  const hasReadyCakeProduct = products.some((p) => p.stockOnly);
  useEffect(() => {
    if (type !== "withdrawal" || !hasReadyCakeProduct) return;
    let alive = true;
    void listReadyCakeItems(bankAccountId).then((items) => {
      if (alive) setReadyCakes(items.filter((i) => i.stage === "ready"));
    });
    return () => {
      alive = false;
    };
  }, [type, hasReadyCakeProduct, bankAccountId]);

  const options = useMemo<SkuOption[]>(() => {
    const out: SkuOption[] = [];
    for (const p of products) {
      // Ready Cake masuk stok otomatis dari produksi kue; tidak bisa ditambah manual.
      if (p.stockOnly && type !== "withdrawal") continue;
      if (p.variants.length === 0) {
        out.push({
          key: `p:${p.id}`,
          label: p.name,
          productId: p.id,
          variantId: null,
          readyCake: p.stockOnly,
          readyCakeDiy: null,
        });
      } else {
        for (const v of p.variants) {
          const name = v.name.trim().toLowerCase();
          out.push({
            key: `p:${p.id}|v:${v.id}`,
            label: `${p.name} · ${v.name}`,
            productId: p.id,
            variantId: v.id,
            readyCake: p.stockOnly,
            readyCakeDiy: name === "diy" ? true : name === "reguler" ? false : null,
          });
        }
      }
    }
    return out;
  }, [products, type]);

  const optionByKey = useMemo(
    () => new Map(options.map((o) => [o.key, o])),
    [options]
  );

  const opLabel = POS_OPERATION_LABEL_ID[type];
  const title = `Tambah ${opLabel}`;
  const sign = type === "production" ? "+" : "−";

  // SKU yang sudah dipakai baris lain — disembunyikan dari dropdown baris
  // ini supaya tidak ada duplikat (satu SKU cukup satu baris).
  const usedKeys = useMemo(
    () => new Set(lines.map((l) => l.skuKey).filter(Boolean)),
    [lines]
  );

  function updateLine(id: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: nextId.current++,
        skuKey: "",
        qty: "",
        cakeIds: [],
        // Warisi alasan baris terakhir: penarikan massal hampir selalu
        // satu sebab, jadi kasir cukup mengubah yang menyimpang.
        reason: prev[prev.length - 1]?.reason ?? DEFAULT_WITHDRAWAL_REASON,
      },
    ]);
  }
  function removeLine(id: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  /** Baris yang sudah lengkap & valid — dasar preview + payload submit. */
  const validLines = lines
    .map((l) => {
      const opt = optionByKey.get(l.skuKey);
      return {
        opt,
        // Ready Cake: jumlah = kue yang dicentang, bukan ketikan.
        qty: opt?.readyCake ? l.cakeIds.length : parseInt(l.qty, 10),
        reason: l.reason,
        cakeIds: l.cakeIds,
      };
    })
    .filter(
      (l): l is { opt: SkuOption; qty: number; reason: WithdrawalReason; cakeIds: string[] } =>
        !!l.opt && Number.isInteger(l.qty) && l.qty > 0
    );

  // Catatan bebas naik jadi WAJIB begitu ada baris beralasan "Lainnya" —
  // tanpa itu kategorinya tidak berarti apa-apa saat dibaca ulang.
  const noteRequired =
    type === "withdrawal" &&
    validLines.some((l) => WITHDRAWAL_REASON_META[l.reason].requiresNote);
  const noteMissing = noteRequired && !notes.trim();

  const totalQty = validLines.reduce((a, l) => a + l.qty, 0);
  const previewLabel =
    validLines.length === 0
      ? ""
      : validLines.length === 1
        ? `${validLines[0].opt.label} ${sign}${validLines[0].qty}`
        : `${validLines.length} produk · total ${sign}${totalQty}`;

  function submitWithPin(pin: string | undefined) {
    if (validLines.length === 0) return;
    startTransition(async () => {
      const res = await createStockMovements({
        bankAccountId,
        type,
        lines: validLines.map((l) => ({
          productId: l.opt.productId,
          variantId: l.opt.variantId,
          qty: l.qty,
          reason: type === "withdrawal" ? l.reason : null,
          readyCakeOrderIds: l.opt.readyCake ? l.cakeIds : undefined,
        })),
        notes: notes.trim() || undefined,
        pin,
      });
      if (!res.ok) {
        if (pin !== undefined) {
          // PIN failure → keep modal open with shake + error msg
          setPinError(res.error);
        } else {
          toast.error(res.error);
        }
        return;
      }
      const n = res.data?.count ?? validLines.length;
      toast.success(
        n > 1 ? `${title} tersimpan — ${n} produk` : `${title} tersimpan`
      );
      setPinOpen(false);
      onClose();
      router.refresh();
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Baris kosong (belum dipilih SKU-nya) diabaikan, tapi baris yang
    // separuh terisi harus ditolak supaya tidak diam-diam hilang.
    const halfFilled = lines.some((l) => {
      const hasSku = !!l.skuKey;
      const q = optionByKey.get(l.skuKey)?.readyCake ? l.cakeIds.length : parseInt(l.qty, 10);
      const hasQty = Number.isInteger(q) && q > 0;
      return hasSku !== hasQty;
    });
    if (halfFilled)
      return toast.error("Lengkapi produk & qty di setiap baris");
    if (validLines.length === 0) return toast.error("Pilih produk dulu");
    if (noteMissing)
      return toast.error('Alasan "Lainnya" wajib disertai catatan');
    if (authorizers.length > 0) {
      setPinError(null);
      setPinOpen(true);
      return;
    }
    submitWithPin(undefined);
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        // Only close on direct backdrop clicks. Without this guard,
        // clicks bubbling up from inside (e.g. a child portal — see
        // PosPinAuthDialog) would dismiss the dialog unexpectedly.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Produk & qty
            </span>
            {lines.map((line, idx) => (
              <div key={line.id} className="space-y-1.5">
                <div className="flex items-start gap-2">
                <select
                  value={line.skuKey}
                  onChange={(e) => updateLine(line.id, { skuKey: e.target.value, cakeIds: [] })}
                  aria-label={`Produk baris ${idx + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">-- pilih produk --</option>
                  {options
                    .filter((o) => o.key === line.skuKey || !usedKeys.has(o.key))
                    .map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                </select>
                {optionByKey.get(line.skuKey)?.readyCake ? (
                  <span className="w-20 shrink-0 rounded-lg border border-border bg-muted px-3 py-2 text-center text-sm tabular-nums text-muted-foreground">
                    {line.cakeIds.length}
                  </span>
                ) : (
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={line.qty}
                  onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                  aria-label={`Qty baris ${idx + 1}`}
                  placeholder="Qty"
                  className="w-20 shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
                />
                )}
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  disabled={lines.length === 1}
                  aria-label={`Hapus baris ${idx + 1}`}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                >
                  <Trash2 size={16} />
                </button>
                </div>

                {optionByKey.get(line.skuKey)?.readyCake && (
                  <ReadyCakeChecklist
                    cakes={(readyCakes ?? []).filter((c) => {
                      const diy = optionByKey.get(line.skuKey)?.readyCakeDiy;
                      return diy == null || c.isDiy === diy;
                    })}
                    loading={readyCakes === null}
                    selected={line.cakeIds}
                    onChange={(cakeIds) => updateLine(line.id, { cakeIds })}
                  />
                )}

                {/* Alasan per BARIS, bukan per submit: penarikan beralasan
                    campur itu nyata di data lama (`rusak, exp, tester`), dan
                    kalau dipukul rata ke satu kategori metrik susut ikut
                    melenceng. */}
                {type === "withdrawal" && (
                  <select
                    value={line.reason}
                    onChange={(e) =>
                      updateLine(line.id, {
                        reason: e.target.value as WithdrawalReason,
                      })
                    }
                    aria-label={`Alasan penarikan baris ${idx + 1}`}
                    className="w-full rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    {WITHDRAWAL_REASON_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.label}>
                        {g.reasons.map((r) => (
                          <option key={r} value={r}>
                            {WITHDRAWAL_REASON_META[r].label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus size={14} />
              Tambah produk
            </button>
          </div>

          <label className="block">
            <span
              className={
                noteMissing
                  ? "text-xs font-medium text-destructive"
                  : "text-xs font-medium text-muted-foreground"
              }
            >
              {/* Hint lama ("expired / rusak / testing") sudah jadi dropdown
                  resmi di atas, jadi catatan kembali murni detail bebas. */}
              Catatan {noteRequired ? "(wajib untuk alasan Lainnya)" : "(opsional)"}
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-invalid={noteMissing || undefined}
              className={
                noteMissing
                  ? "mt-1 w-full rounded-lg border border-destructive bg-background px-3 py-2 text-sm"
                  : "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              }
            />
          </label>

          {validLines.length > 1 && (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {validLines.length} produk · total {sign}
              {totalQty}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={pending || noteMissing}
              className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>

      <PosPinAuthDialog
        open={pinOpen}
        authorizerNames={authorizerNames(authorizers)}
        operationLabel={opLabel}
        preview={previewLabel}
        pending={pending}
        error={pinError}
        onSubmit={(pin) => submitWithPin(pin)}
        onClose={() => {
          if (!pending) {
            setPinOpen(false);
            setPinError(null);
          }
        }}
      />
    </div>
  );
}

/** Daftar kue ready yang siap ditarik; kasir mencentang kue yang dibuang. Kue yang ditarik langsung berstatus Buang. */
function ReadyCakeChecklist({
  cakes,
  loading,
  selected,
  onChange,
}: {
  cakes: ReadyCakeItem[];
  loading: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (loading) return <p className="text-[11px] text-muted-foreground">Memuat daftar kue…</p>;
  if (cakes.length === 0)
    return <p className="text-[11px] text-muted-foreground">Tidak ada kue ready yang bisa ditarik.</p>;
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2 space-y-1">
      <p className="text-[11px] text-muted-foreground">Centang kue yang ditarik. Kue ini langsung berstatus Buang.</p>
      {cakes.map((c) => {
        const checked = selected.includes(c.id);
        return (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(checked ? selected.filter((id) => id !== c.id) : [...selected, c.id])}
            />
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c.isDiy ? " (DIY)" : ""}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatRp(c.priceIdr)} · {readyCakeAge(c.readyAt)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
