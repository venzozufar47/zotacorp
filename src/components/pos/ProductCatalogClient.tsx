"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPosProduct,
  createPosProductVariant,
  deletePosProduct,
  deletePosProductVariant,
  updatePosProduct,
  updatePosProductVariant,
  type PosProduct,
  type PosProductVariant,
} from "@/lib/actions/pos.actions";
import { formatIDR } from "@/lib/cashflow/format";

interface Props {
  bankAccountId: string;
  accountName: string;
  initialProducts: PosProduct[];
}

const formatRp = (n: number) => formatIDR(n, { withRp: true });

export function ProductCatalogClient({
  bankAccountId,
  accountName,
  initialProducts,
}: Props) {
  const [products, setProducts] = useState<PosProduct[]>(initialProducts);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  // Per-row price drafts so typing intermediate characters ("12", "12.",
  // empty) doesn't prematurely snap the numeric price to 0. Committed on
  // blur via updateField / updateVariantField.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function addProduct() {
    const name = newName.trim();
    const price = Number(newPrice);
    if (!name) {
      toast.error("Nama wajib diisi");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Harga tidak valid");
      return;
    }
    startTransition(async () => {
      const maxOrder = products.reduce((m, p) => Math.max(m, p.sortOrder), -1);
      const res = await createPosProduct({
        bankAccountId,
        name,
        price,
        sortOrder: maxOrder + 1,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      setProducts((ps) => [
        ...ps,
        {
          id: res.data!.id,
          bankAccountId,
          name,
          price,
          active: true,
          sortOrder: maxOrder + 1,
          variants: [],
        },
      ]);
      setNewName("");
      setNewPrice("");
      toast.success("Produk ditambahkan");
    });
  }

  function updateField(
    id: string,
    patch: Partial<Pick<PosProduct, "name" | "price" | "active">>
  ) {
    const prev = products;
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    startTransition(async () => {
      const res = await updatePosProduct({ id, ...patch });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal update");
        setProducts(prev);
      }
    });
  }

  function removeProduct(id: string) {
    if (!confirm("Hapus produk ini?")) return;
    const prev = products;
    setProducts((ps) => ps.filter((p) => p.id !== id));
    startTransition(async () => {
      const res = await deletePosProduct(id);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal hapus");
        setProducts(prev);
      } else {
        toast.success("Produk dihapus");
      }
    });
  }

  function addVariant(productId: string, name: string, price: number) {
    startTransition(async () => {
      const maxOrder =
        products
          .find((p) => p.id === productId)
          ?.variants.reduce((m, v) => Math.max(m, v.sortOrder), -1) ?? -1;
      const res = await createPosProductVariant({
        productId,
        name,
        price,
        sortOrder: maxOrder + 1,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      const newVar: PosProductVariant = {
        id: res.data!.id,
        productId,
        name,
        price,
        active: true,
        sortOrder: maxOrder + 1,
      };
      setProducts((ps) =>
        ps.map((p) =>
          p.id === productId ? { ...p, variants: [...p.variants, newVar] } : p
        )
      );
      toast.success("Varian ditambahkan");
    });
  }

  function updateVariantField(
    productId: string,
    variantId: string,
    patch: Partial<Pick<PosProductVariant, "name" | "price" | "active">>
  ) {
    const prev = products;
    setProducts((ps) =>
      ps.map((p) =>
        p.id !== productId
          ? p
          : {
              ...p,
              variants: p.variants.map((v) =>
                v.id === variantId ? { ...v, ...patch } : v
              ),
            }
      )
    );
    startTransition(async () => {
      const res = await updatePosProductVariant({ id: variantId, ...patch });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal update");
        setProducts(prev);
      }
    });
  }

  function removeVariant(productId: string, variantId: string) {
    if (!confirm("Hapus varian ini?")) return;
    const prev = products;
    setProducts((ps) =>
      ps.map((p) =>
        p.id !== productId
          ? p
          : { ...p, variants: p.variants.filter((v) => v.id !== variantId) }
      )
    );
    startTransition(async () => {
      const res = await deletePosProductVariant(variantId);
      if (!res.ok) {
        toast.error(res.error ?? "Gagal hapus");
        setProducts(prev);
      } else {
        toast.success("Varian dihapus");
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/pos"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft size={12} /> Kembali ke POS
          </Link>
          <h1 className="font-semibold text-foreground">Katalog Produk</h1>
          <p className="text-xs text-muted-foreground">{accountName}</p>
        </div>
        {pending && (
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        )}
      </header>

      {/* Form tambah produk */}
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Tambah produk
        </p>
        <div className="grid grid-cols-[1fr_120px_auto] gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama produk"
            className="h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <input
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="Harga"
            inputMode="numeric"
            className="h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
          />
          <button
            type="button"
            disabled={pending}
            onClick={addProduct}
            className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Plus size={14} /> Tambah
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Produk yang punya banyak harga (mis. ukuran Regular/Large) bisa
          ditambahkan varian setelah dibuat — expand baris produk.
        </p>
      </div>

      {/* List produk */}
      <div className="space-y-2">
        {products.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Belum ada produk. Tambah yang pertama di atas.
            </p>
          </div>
        )}
        {products.map((p) => {
          const isExpanded = expanded.has(p.id);
          const variantCount = p.variants.length;
          return (
            <div
              key={p.id}
              className={`rounded-xl border border-border ${
                p.active ? "bg-card" : "bg-muted/30 opacity-70"
              }`}
            >
              <div className="p-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(p.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isExpanded ? "Tutup varian" : "Buka varian"}
                >
                  {isExpanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
                <input
                  value={nameDrafts[p.id] ?? p.name}
                  onChange={(e) =>
                    setNameDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                  }
                  onBlur={(e) => {
                    const n = e.target.value.trim();
                    setNameDrafts((d) => {
                      const next = { ...d };
                      delete next[p.id];
                      return next;
                    });
                    if (n && n !== p.name) updateField(p.id, { name: n });
                  }}
                  className="flex-1 h-9 px-2 rounded-lg border border-transparent hover:border-border focus:border-primary bg-transparent text-sm font-medium"
                />
                <input
                  value={priceDrafts[p.id] ?? String(p.price)}
                  inputMode="numeric"
                  onChange={(e) =>
                    setPriceDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                  }
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    setPriceDrafts((d) => {
                      const next = { ...d };
                      delete next[p.id];
                      return next;
                    });
                    if (Number.isFinite(v) && v >= 0 && v !== p.price)
                      updateField(p.id, { price: v });
                  }}
                  className="w-28 h-9 px-2 rounded-lg border border-transparent hover:border-border focus:border-primary bg-transparent text-sm tabular-nums text-right"
                  title={
                    variantCount > 0
                      ? "Harga base diabaikan saat produk punya varian"
                      : undefined
                  }
                />
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatRp(p.price)}
                </span>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={(e) =>
                      updateField(p.id, { active: e.target.checked })
                    }
                  />
                  aktif
                </label>
                <button
                  type="button"
                  onClick={() => removeProduct(p.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  aria-label="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {isExpanded && (
                <VariantSection
                  product={p}
                  priceDrafts={priceDrafts}
                  setPriceDrafts={setPriceDrafts}
                  nameDrafts={nameDrafts}
                  setNameDrafts={setNameDrafts}
                  onAdd={(name, price) => addVariant(p.id, name, price)}
                  onUpdate={(variantId, patch) =>
                    updateVariantField(p.id, variantId, patch)
                  }
                  onDelete={(variantId) => removeVariant(p.id, variantId)}
                  pending={pending}
                />
              )}

              {!isExpanded && variantCount > 0 && (
                <p className="px-3 pb-2 text-[11px] text-muted-foreground">
                  {variantCount} varian — expand untuk kelola.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VariantSection({
  product,
  priceDrafts,
  setPriceDrafts,
  nameDrafts,
  setNameDrafts,
  onAdd,
  onUpdate,
  onDelete,
  pending,
}: {
  product: PosProduct;
  priceDrafts: Record<string, string>;
  setPriceDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  nameDrafts: Record<string, string>;
  setNameDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onAdd: (name: string, price: number) => void;
  onUpdate: (
    variantId: string,
    patch: Partial<Pick<PosProductVariant, "name" | "price" | "active">>
  ) => void;
  onDelete: (variantId: string) => void;
  pending: boolean;
}) {
  const [vName, setVName] = useState("");
  const [vPrice, setVPrice] = useState("");

  function submit() {
    const n = vName.trim();
    const p = Number(vPrice);
    if (!n) {
      toast.error("Nama varian wajib diisi");
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      toast.error("Harga tidak valid");
      return;
    }
    onAdd(n, p);
    setVName("");
    setVPrice("");
  }

  return (
    <div className="border-t border-border px-3 py-3 space-y-2 bg-muted/20 rounded-b-xl">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        Varian
      </p>
      {product.variants.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Belum ada varian. Tambah di bawah kalau produk ini punya beberapa
          ukuran / harga.
        </p>
      )}
      {product.variants.map((v) => {
        const draftKey = `v:${v.id}`;
        return (
          <div
            key={v.id}
            className={`flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 ${
              v.active ? "" : "opacity-60"
            }`}
          >
            <input
              value={nameDrafts[v.id] ?? v.name}
              onChange={(e) =>
                setNameDrafts((d) => ({ ...d, [v.id]: e.target.value }))
              }
              onBlur={(e) => {
                const n = e.target.value.trim();
                setNameDrafts((d) => {
                  const next = { ...d };
                  delete next[v.id];
                  return next;
                });
                if (n && n !== v.name) onUpdate(v.id, { name: n });
              }}
              className="flex-1 h-8 px-2 rounded-md border border-transparent hover:border-border focus:border-primary bg-transparent text-sm"
            />
            <input
              value={priceDrafts[draftKey] ?? String(v.price)}
              inputMode="numeric"
              onChange={(e) =>
                setPriceDrafts((d) => ({ ...d, [draftKey]: e.target.value }))
              }
              onBlur={(e) => {
                const n = Number(e.target.value);
                setPriceDrafts((d) => {
                  const next = { ...d };
                  delete next[draftKey];
                  return next;
                });
                if (Number.isFinite(n) && n >= 0 && n !== v.price)
                  onUpdate(v.id, { price: n });
              }}
              className="w-24 h-8 px-2 rounded-md border border-transparent hover:border-border focus:border-primary bg-transparent text-sm tabular-nums text-right"
            />
            <label className="inline-flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                checked={v.active}
                onChange={(e) => onUpdate(v.id, { active: e.target.checked })}
              />
              aktif
            </label>
            <button
              type="button"
              onClick={() => onDelete(v.id)}
              className="text-muted-foreground hover:text-destructive p-1"
              aria-label="Hapus varian"
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
      <div className="grid grid-cols-[1fr_100px_auto] gap-2 pt-1">
        <input
          value={vName}
          onChange={(e) => setVName(e.target.value)}
          placeholder="Nama varian (mis. Regular)"
          className="h-9 px-2 rounded-md border border-border bg-background text-sm"
        />
        <input
          value={vPrice}
          onChange={(e) => setVPrice(e.target.value)}
          placeholder="Harga"
          inputMode="numeric"
          className="h-9 px-2 rounded-md border border-border bg-background text-sm tabular-nums"
        />
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="h-9 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Plus size={13} /> Tambah
        </button>
      </div>
    </div>
  );
}
