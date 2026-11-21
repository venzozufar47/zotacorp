"use client";

import { PosNavLink } from "./PosNavLink";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ClipboardCheck, Plus, X } from "lucide-react";
import { stockGroupLabel, stockGroupRank } from "@/lib/pos/stock-groups";
import { toast } from "sonner";
import type {
  OpnameDiscrepancyResult,
  OpnameFormSku,
  OpnameResolutionInput,
} from "@/lib/actions/pos-stock.actions";
import {
  OPNAME_REASON_LABEL,
  OPNAME_REASONS_BY_DIRECTION,
  type OpnameDiffReason,
} from "@/lib/pos/opname-reasons";
import { createStockOpname } from "@/lib/actions/pos-stock.actions";
import {
  authorizerNames,
  type PosAuthorizerRef,
} from "@/lib/pos-pin-format";
import { PosPinAuthDialog } from "./PosPinAuthDialog";

interface Props {
  bankAccountId: string;
  accountName: string;
  basePath: string;
  skus: OpnameFormSku[];
  /** Siapa saja yang PIN-nya diterima untuk opname. Kosong = tanpa PIN. */
  authorizers: PosAuthorizerRef[];
  /**
   * Dipakai di dalam buka/tutup shift: kasir shift (PIN-nya sudah diverifikasi) mengopname, tanpa dialog PIN
   * authorizer dan tanpa pindah halaman — hasilnya dikembalikan lewat `onDone`.
   */
  shift?: {
    cashierId: string;
    pin: string;
    title: string;
    onDone: (opnameId: string) => void;
    /**
     * Opname BUKA shift: angka terisi dari hitungan terakhir (`lastCount`) dan kasir mengonfirmasi tiap produk
     * dengan ✓ (atau mengubah angkanya dulu). Tutup shift = false: blind count penuh.
     */
    confirm?: boolean;
  };
}

function skuKey(s: OpnameFormSku) {
  return `p:${s.productId}|v:${s.variantId ?? "-"}`;
}

function skuLabel(s: OpnameFormSku) {
  return s.variantName ? `${s.productName} · ${s.variantName}` : s.productName;
}

export function StockOpnameForm({
  bankAccountId,
  accountName,
  basePath,
  skus,
  authorizers,
  shift,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const confirmMode = shift?.confirm === true;
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    if (!confirmMode) return {};
    const init: Record<string, string> = {};
    for (const s of skus) if (s.lastCount !== null) init[skuKey(s)] = String(s.lastCount);
    return init;
  });
  // Mode konfirmasi: SKU yang sudah dicentang kasir. Mengubah angka mencabut centang (angka baru wajib dikonfirmasi ulang).
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState("");
  // Curasi katalog: default semua SKU aktif disertakan; user bisa keluarkan
  // atau tambahkan lagi via picker.
  const [includedKeys, setIncludedKeys] = useState<Set<string>>(
    () => new Set(skus.map(skuKey))
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const skuByKey = useMemo(() => {
    const map = new Map<string, OpnameFormSku>();
    for (const s of skus) map.set(skuKey(s), s);
    return map;
  }, [skus]);

  const includedSkus = useMemo(
    () => skus.filter((s) => includedKeys.has(skuKey(s))),
    [skus, includedKeys]
  );
  const excludedSkus = useMemo(
    () => skus.filter((s) => !includedKeys.has(skuKey(s))),
    [skus, includedKeys]
  );

  const setCount = (key: string, v: string) => {
    const clean = v.replace(/[^0-9]/g, "");
    setCounts((prev) => ({ ...prev, [key]: clean }));
    setConfirmed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggleConfirmed = (key: string) => {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Enter = lompat ke kolom angka berikutnya (hitung cepat tanpa mengetuk kolom satu per satu).
  const focusNext = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(
      e.currentTarget.form?.querySelectorAll<HTMLInputElement>("input[data-count]") ?? []
    );
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    if (next) {
      next.focus();
      next.select();
    } else e.currentTarget.blur();
  };

  const removeSku = (key: string) => {
    setIncludedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    // Buang juga count-nya supaya tidak salah submit kalau user add balik.
    setCounts((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const addSku = (key: string) => {
    setIncludedKeys((prev) => new Set(prev).add(key));
    setPickerOpen(false);
  };

  const items = includedSkus.map((s) => {
    const raw = counts[skuKey(s)] ?? "";
    const n = raw === "" ? 0 : parseInt(raw, 10);
    return {
      productId: s.productId,
      variantId: s.variantId,
      physicalCount: Number.isFinite(n) ? n : 0,
    };
  });

  // Discrepancy modal state — muncul kalau opname mendeteksi selisih
  // (shortfall = bayar selisih, surplus = paksa hitung ulang). PIN
  // sudah lulus saat modal muncul, jadi follow-up call (Bayar
  // selisih) tidak butuh PIN lagi.
  const [discrepancy, setDiscrepancy] = useState<OpnameDiscrepancyResult | null>(null);
  const [resolvedPin, setResolvedPin] = useState<string | undefined>(undefined);

  function submitWithPin(
    pin: string | undefined,
    opts?: { allowDiscrepancy?: boolean; resolutions?: OpnameResolutionInput[] }
  ) {
    startTransition(async () => {
      const res = await createStockOpname({
        bankAccountId,
        notes: notes.trim() || undefined,
        items,
        pin,
        shiftCashier: shift ? { userId: shift.cashierId, pin: shift.pin } : undefined,
        allowDiscrepancy: opts?.allowDiscrepancy,
        resolutions: opts?.resolutions,
      });
      if (!res.ok) {
        if (pin !== undefined) setPinError(res.error);
        else toast.error(res.error);
        return;
      }
      // Discrepancy detected → blok submit, render modal.
      if (res.data?.discrepancy) {
        setResolvedPin(pin);
        setPinOpen(false);
        setDiscrepancy(res.data.discrepancy);
        return;
      }
      toast.success("Opname tersimpan");
      setPinOpen(false);
      setDiscrepancy(null);
      if (shift) {
        shift.onDone(res.data!.opnameId!);
        return;
      }
      router.push(`${basePath}/stok/opname/${res.data!.opnameId}`);
    });
  }

  const unconfirmedCount = confirmMode
    ? includedSkus.filter((s) => !confirmed.has(skuKey(s))).length
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (includedSkus.length === 0)
      return toast.error("Minimal satu SKU harus disertakan");
    if (unconfirmedCount > 0)
      return toast.error(`${unconfirmedCount} produk belum dikonfirmasi`);
    if (!shift && authorizers.length > 0) {
      setPinError(null);
      setPinOpen(true);
      return;
    }
    submitWithPin(undefined);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <header>
        {!shift && (
          <PosNavLink
            href={`${basePath}/stok`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft size={12} /> Kembali ke Stok
          </PosNavLink>
        )}
        <h1 className="font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck size={16} /> {shift ? shift.title : "Opname Baru"}
        </h1>
        <p className="text-xs text-muted-foreground">{accountName}</p>
      </header>

      {confirmMode ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
          <p className="font-medium mb-0.5">Cek stok awal</p>
          <p className="text-muted-foreground">
            Angka di bawah adalah hasil hitung shift sebelumnya. Cocokkan dengan fisik, lalu ketuk ✓ tiap produk. Kalau
            beda, ubah angkanya dulu baru ketuk ✓.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
          <p className="font-medium mb-0.5">Blind count</p>
          <p className="text-muted-foreground">
            Masukkan jumlah fisik apa adanya — sistem akan menghitung selisih
            terhadap stok seharusnya setelah submit. SKU yang dikeluarkan tidak
            akan mempengaruhi baseline opname berikutnya.
          </p>
        </div>
      )}

      {skus.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Belum ada produk aktif.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            {includedSkus.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                Tidak ada SKU disertakan. Tambahkan di bawah.
              </div>
            ) : (
              includedSkus.map((s, idx) => {
                const key = skuKey(s);
                const isConfirmed = confirmed.has(key);
                const hasValue = (counts[key] ?? "") !== "";
                const showHeader =
                  idx === 0 || stockGroupRank(includedSkus[idx - 1].stockGroup) !== stockGroupRank(s.stockGroup);
                return (
                  <div key={key} className="space-y-1.5">
                    {showHeader && (
                      <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {stockGroupLabel(s.stockGroup)}
                      </p>
                    )}
                    <div
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                        isConfirmed ? "border-success/50 bg-success/10" : "border-border bg-card"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => removeSku(key)}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label={`Keluarkan ${skuLabel(s)}`}
                      >
                        <X size={14} />
                      </button>
                      <span className="flex-1 text-sm text-foreground truncate">
                        {skuLabel(s)}
                      </span>
                      {!confirmMode && (
                        <button
                          type="button"
                          onClick={() => setCount(key, "0")}
                          className="shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                          aria-label={`${skuLabel(s)} kosong (0)`}
                        >
                          0
                        </button>
                      )}
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        enterKeyHint="next"
                        data-count
                        value={counts[key] ?? ""}
                        onChange={(e) => setCount(key, e.target.value)}
                        onKeyDown={focusNext}
                        placeholder="0"
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm tabular-nums"
                      />
                      {confirmMode && (
                        <button
                          type="button"
                          disabled={!hasValue}
                          onClick={() => toggleConfirmed(key)}
                          aria-pressed={isConfirmed}
                          aria-label={`Konfirmasi ${skuLabel(s)}`}
                          className={`shrink-0 rounded-lg border p-1.5 disabled:opacity-40 ${
                            isConfirmed
                              ? "border-success bg-success text-white"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <Check size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {excludedSkus.length > 0 && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus size={12} /> Tambah SKU ({excludedSkus.length} tersedia)
            </button>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Catatan (opsional)
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={pending || includedSkus.length === 0 || unconfirmedCount > 0}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? "Menyimpan..."
              : unconfirmedCount > 0
                ? `${unconfirmedCount} produk belum dikonfirmasi`
                : `Submit Opname (${includedSkus.length} SKU)`}
          </button>
        </form>
      )}

      {pickerOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 space-y-3 max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Tambah SKU
              </h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
              {excludedSkus.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Semua SKU sudah disertakan.
                </p>
              ) : (
                excludedSkus.map((s) => {
                  const key = skuKey(s);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => addSku(key)}
                      className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-muted"
                    >
                      <span className="text-sm text-foreground truncate">
                        {skuLabel(s)}
                      </span>
                      <Plus size={14} className="shrink-0 text-muted-foreground" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <PosPinAuthDialog
        open={pinOpen}
        authorizerNames={authorizerNames(authorizers)}
        operationLabel="Opname"
        preview={`Opname ${includedSkus.length} SKU`}
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

      {/* Discrepancy modal — muncul kalau opname mendeteksi selisih.
          Shortfall (kurang stok) → opsi Bayar selisih / Hitung ulang.
          Surplus (kelebihan stok) → cuma Hitung ulang. */}
      {discrepancy && (
        <OpnameDiscrepancyDialog
          discrepancy={discrepancy}
          pending={pending}
          onSave={(resolutions) => submitWithPin(resolvedPin, { allowDiscrepancy: true, resolutions })}
          onRecount={() => setDiscrepancy(null)}
        />
      )}
    </div>
  );
}

/**
 * Dialog selisih opname: kasir menjelaskan tiap SKU yang selisih di tempat, tanpa kembali ke POS untuk mencatat
 * penarikan / penjualan susulan. Hanya nama dan arah (kurang/lebih) yang tampil, bukan jumlahnya — hitungan buta
 * tetap utuh; sistem sendiri yang menyimpan selisih persisnya. Alasan dicatat untuk ditinjau superadmin.
 */
function OpnameDiscrepancyDialog({
  discrepancy,
  pending,
  onSave,
  onRecount,
}: {
  discrepancy: OpnameDiscrepancyResult;
  pending: boolean;
  onSave: (resolutions: OpnameResolutionInput[]) => void;
  onRecount: () => void;
}) {
  const keyOf = (s: { productId: string; variantId: string | null }) => `${s.productId}|${s.variantId ?? "-"}`;
  const labelOf = (s: OpnameDiscrepancyResult["skus"][number]) =>
    s.variantName ? `${s.productName} · ${s.variantName}` : s.productName;
  const [picked, setPicked] = useState<Record<string, { reason?: OpnameDiffReason; swap?: string }>>({});

  const byKey = new Map(discrepancy.skus.map((s) => [keyOf(s), s]));

  function setReason(sku: OpnameDiscrepancyResult["skus"][number], reason: OpnameDiffReason | "") {
    setPicked((prev) => ({ ...prev, [keyOf(sku)]: reason ? { reason } : {} }));
  }
  function setSwap(sku: OpnameDiscrepancyResult["skus"][number], partnerKey: string) {
    setPicked((prev) => {
      const next = { ...prev, [keyOf(sku)]: { reason: "tertukar" as const, swap: partnerKey || undefined } };
      // Pasangan ikut ditandai tertukar dengan SKU ini bila belum punya alasan, supaya cukup memilih sekali.
      if (partnerKey && !prev[partnerKey]?.reason) next[partnerKey] = { reason: "tertukar", swap: keyOf(sku) };
      return next;
    });
  }

  const complete = discrepancy.skus.every((s) => {
    const p = picked[keyOf(s)];
    if (!p?.reason) return false;
    if (p.reason !== "tertukar") return true;
    const partner = p.swap ? byKey.get(p.swap) : undefined;
    return !!partner && partner.direction !== s.direction;
  });
  const missing = discrepancy.skus.filter((s) => !picked[keyOf(s)]?.reason).length;

  function save() {
    onSave(
      discrepancy.skus.map((s) => {
        const p = picked[keyOf(s)];
        const partner = p?.swap ? byKey.get(p.swap) : undefined;
        return {
          productId: s.productId,
          variantId: s.variantId,
          reason: p!.reason!,
          swapWith: p?.reason === "tertukar" && partner ? { productId: partner.productId, variantId: partner.variantId } : undefined,
        };
      })
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !pending && onRecount()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jelaskan selisih stok"
        className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--foreground)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Ada selisih stok</p>
          <h2 className="mt-0.5 text-base font-bold text-foreground">Jelaskan tiap produk yang selisih</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pilih penyebabnya di sini; tidak perlu kembali ke POS. Superadmin bisa meninjau alasan ini.
          </p>
        </div>

        <ul className="-mx-1 mt-3 flex-1 space-y-2 overflow-y-auto px-1">
          {discrepancy.skus.map((s) => {
            const k = keyOf(s);
            const p = picked[k];
            const partners = discrepancy.skus.filter((o) => o.direction !== s.direction);
            const reasons = OPNAME_REASONS_BY_DIRECTION[s.direction];
            return (
              <li key={k} className="space-y-1.5 rounded-xl border border-border bg-background/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{labelOf(s)}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.direction === "kurang" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning"
                    }`}
                  >
                    {s.direction === "kurang" ? "Kurang" : "Lebih"}
                  </span>
                </div>
                <select
                  value={p?.reason ?? ""}
                  onChange={(e) => setReason(s, e.target.value as OpnameDiffReason | "")}
                  aria-label={`Penyebab selisih ${labelOf(s)}`}
                  className="h-11 w-full rounded-lg border border-border bg-background px-2 text-sm"
                >
                  <option value="">Pilih penyebab…</option>
                  {reasons
                    .filter((r) => r !== "tertukar" || partners.length > 0)
                    .map((r) => (
                      <option key={r} value={r}>
                        {OPNAME_REASON_LABEL[r]}
                      </option>
                    ))}
                </select>
                {p?.reason === "tertukar" && (
                  <select
                    value={p.swap ?? ""}
                    onChange={(e) => setSwap(s, e.target.value)}
                    aria-label={`Tertukar dengan produk apa (${labelOf(s)})`}
                    className="h-11 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="">{s.direction === "kurang" ? "Yang diberikan malah…" : "Yang seharusnya diberikan…"}</option>
                    {partners.map((o) => (
                      <option key={keyOf(o)} value={keyOf(o)}>
                        {labelOf(o)}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !complete}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
            {complete ? "Simpan opname" : `${missing || "Lengkapi"} ${missing ? "produk belum dijelaskan" : "pasangan tertukar"}`}
          </button>
          <button
            type="button"
            onClick={onRecount}
            disabled={pending}
            className="h-11 w-full rounded-xl border-2 border-foreground bg-card font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Hitung ulang
          </button>
        </div>
      </div>
    </div>
  );
}
