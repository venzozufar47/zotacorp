"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Copy,
  Trash2,
  Package,
  FlaskConical,
  BarChart3,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  createProduct,
  duplicateProduct,
  deleteProduct,
  type CostingProductWithHpp,
} from "@/lib/actions/costing.actions";
import { downloadHppExcel } from "@/lib/costing/exportHppExcel";
import { downloadQuotePdf } from "@/lib/costing/downloadQuotePdf";
import { fmtPercent } from "./format";
import { parseDecimalId } from "./fields";

/** Daftar produk + HPP. Brand picker via ?bu=. */
export function CostingProductList({
  brands,
  activeBrand,
  rows,
}: {
  brands: string[];
  activeBrand: string | null;
  rows: CostingProductWithHpp[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newYield, setNewYield] = useState("1");

  function selectBrand(bu: string) {
    router.push(`/admin/costing?bu=${encodeURIComponent(bu)}`);
  }

  function submitCreate() {
    if (!activeBrand) {
      toast.error("Pilih brand dulu");
      return;
    }
    const name = newName.trim();
    if (!name) {
      toast.error("Nama produk wajib diisi");
      return;
    }
    const yieldQty = parseDecimalId(newYield);
    if (yieldQty == null || !(yieldQty > 0)) {
      toast.error("Yield harus > 0");
      return;
    }
    startTransition(async () => {
      const res = await createProduct({
        business_unit: activeBrand,
        name,
        yield_qty: yieldQty,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/admin/costing/${res.data!.id}`);
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  if (brands.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada brand (business unit). Tambahkan dulu di{" "}
        <Link href="/admin/settings" className="underline">
          Settings
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: brand picker + link bahan + buat produk */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeBrand ?? ""}
          onChange={(e) => selectBrand(e.target.value)}
          className="h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold"
        >
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <Link
          href={`/admin/costing/bahan${activeBrand ? `?bu=${encodeURIComponent(activeBrand)}` : ""}`}
          className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold hover:bg-muted transition"
        >
          <Package size={15} /> Master Bahan
        </Link>
        <Link
          href={`/admin/costing/dashboard${activeBrand ? `?bu=${encodeURIComponent(activeBrand)}` : ""}`}
          className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold hover:bg-muted transition"
        >
          <BarChart3 size={15} /> Dashboard
        </Link>
        {rows.length > 0 && activeBrand && (
          <button
            type="button"
            onClick={async () => {
              try {
                await downloadHppExcel({ brand: activeBrand, rows });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Gagal export");
              }
            }}
            className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold hover:bg-muted transition"
          >
            <FileSpreadsheet size={15} /> Export XLSX
          </button>
        )}
        <div className="ml-auto">
          {creating ? null : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-primary px-3 text-sm font-bold text-foreground shadow-hard-sm hover:-translate-y-0.5 transition"
            >
              <Plus size={15} /> Buat Produk
            </button>
          )}
        </div>
      </div>

      {creating && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nama produk
            </span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCreate()}
              placeholder="mis. Red Velvet"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 w-24">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Yield
            </span>
            <input
              value={newYield}
              onChange={(e) => setNewYield(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCreate()}
              inputMode="decimal"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={submitCreate}
            className="h-9 rounded-lg bg-primary border-2 border-foreground px-3 text-sm font-bold disabled:opacity-60"
          >
            Buat &amp; susun resep
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground"
          >
            Batal
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          <FlaskConical size={28} className="mx-auto mb-2 opacity-60" />
          Belum ada produk untuk {activeBrand}. Klik “Buat Produk” untuk mulai.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-foreground bg-card shadow-hard-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Produk</th>
                <th className="px-3 py-2 font-semibold text-right">HPP / unit</th>
                <th className="px-3 py-2 font-semibold text-right">Harga jual</th>
                <th className="px-3 py-2 font-semibold text-right">Margin</th>
                <th className="px-3 py-2 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { product, breakdown: b } = row;
                const marginPct = b.marginPercent;
                const tone =
                  b.error || marginPct == null || marginPct <= 0
                    ? "text-destructive"
                    : marginPct < 0.2
                      ? "text-warning"
                      : "text-success";
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/admin/costing/${product.id}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {product.name}
                      </Link>
                      {product.category && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {product.category}
                        </span>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        yield {product.yield_qty}
                        {product.yield_unit ? ` ${product.yield_unit}` : ""} ·{" "}
                        {product.overhead_method === "persen"
                          ? `oh ${fmtPercent(product.overhead_percent)}`
                          : `oh ${formatRp(product.overhead_nominal)}`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatRp(b.hppUnit)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {b.finalPrice != null ? formatRp(b.finalPrice) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${tone}`}>
                      {b.error === "margin_too_high"
                        ? "target >100%"
                        : b.error === "yield_invalid"
                          ? "yield 0"
                          : marginPct != null
                            ? fmtPercent(marginPct)
                            : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Duplikat"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => duplicateProduct(product.id),
                              "Produk diduplikat"
                            )
                          }
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          title="Kutipan PDF"
                          onClick={async () => {
                            try {
                              await downloadQuotePdf({
                                brand: product.business_unit,
                                row,
                              });
                            } catch (e) {
                              toast.error(
                                e instanceof Error ? e.message : "Gagal PDF"
                              );
                            }
                          }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <FileText size={15} />
                        </button>
                        <button
                          type="button"
                          title="Hapus"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm(`Hapus produk "${product.name}"?`)) return;
                            run(() => deleteProduct(product.id), "Produk dihapus");
                          }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
