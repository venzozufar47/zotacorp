"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createPosProduct,
  deletePosProduct,
  updatePosProduct,
  type PosProduct,
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
  // blur via updateField.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

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
      const maxOrder = products.reduce(
        (m, p) => Math.max(m, p.sortOrder),
        -1
      );
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
    // Optimistic update — rollback kalau server reject.
    const prev = products;
    setProducts((ps) =>
      ps.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
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
        {products.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border border-border p-3 flex items-center gap-2 ${
              p.active ? "bg-card" : "bg-muted/30 opacity-70"
            }`}
          >
            <input
              value={p.name}
              onChange={(e) =>
                setProducts((ps) =>
                  ps.map((x) =>
                    x.id === p.id ? { ...x, name: e.target.value } : x
                  )
                )
              }
              onBlur={(e) => {
                const n = e.target.value.trim();
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
        ))}
      </div>
    </div>
  );
}
