"use client";

import { PosNavLink } from "./PosNavLink";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { OpnameFormSku } from "@/lib/actions/pos-stock.actions";
import { createStockOpname } from "@/lib/actions/pos-stock.actions";
import { PosPinAuthDialog } from "./PosPinAuthDialog";

interface Props {
  bankAccountId: string;
  accountName: string;
  skus: OpnameFormSku[];
  /** Designated PIN authorizer for opname. Null = no PIN gate. */
  authorizer: { userId: string; fullName: string } | null;
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
  skus,
  authorizer,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [counts, setCounts] = useState<Record<string, string>>({});
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

  function submitWithPin(pin: string | undefined) {
    startTransition(async () => {
      const res = await createStockOpname({
        bankAccountId,
        notes: notes.trim() || undefined,
        items,
        pin,
      });
      if (!res.ok) {
        if (pin !== undefined) setPinError(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success("Opname tersimpan");
      setPinOpen(false);
      router.push(`/pos/stok/opname/${res.data!.opnameId}`);
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (includedSkus.length === 0)
      return toast.error("Minimal satu SKU harus disertakan");
    if (authorizer) {
      setPinError(null);
      setPinOpen(true);
      return;
    }
    submitWithPin(undefined);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <header>
        <PosNavLink
          href="/pos/stok"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={12} /> Kembali ke Stok
        </PosNavLink>
        <h1 className="font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck size={16} /> Opname Baru
        </h1>
        <p className="text-xs text-muted-foreground">{accountName}</p>
      </header>

      <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
        <p className="font-medium mb-0.5">Blind count</p>
        <p className="text-muted-foreground">
          Masukkan jumlah fisik apa adanya — sistem akan menghitung selisih
          terhadap stok seharusnya setelah submit. SKU yang dikeluarkan tidak
          akan mempengaruhi baseline opname berikutnya.
        </p>
      </div>

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
              includedSkus.map((s) => {
                const key = skuKey(s);
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
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
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={counts[key] ?? ""}
                      onChange={(e) => setCount(key, e.target.value)}
                      placeholder="0"
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm tabular-nums"
                    />
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
            disabled={pending || includedSkus.length === 0}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? "Menyimpan..."
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
        authorizerName={authorizer?.fullName ?? null}
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
    </div>
  );
}
