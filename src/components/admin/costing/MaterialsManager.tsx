"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, AlertTriangle, History } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  createMaterial,
  updateMaterial,
  deleteMaterial,
  listProductsUsingMaterial,
  listMaterialPriceHistory,
  type CostingMaterial,
  type CostingProductWithHpp,
  type MaterialPriceHistoryRow,
} from "@/lib/actions/costing.actions";
import { fmtPercent, fmtRpPrecise } from "./format";
import { NumField, TextField, parseDecimalId } from "./fields";

const STALE_DAYS = 60;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

export function MaterialsManager({
  brands,
  activeBrand,
  rows,
}: {
  brands: string[];
  activeBrand: string | null;
  rows: CostingMaterial[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form tambah bahan.
  const [nName, setNName] = useState("");
  const [nCategory, setNCategory] = useState("");
  const [nPurchaseUnit, setNPurchaseUnit] = useState("");
  const [nPrice, setNPrice] = useState("");
  const [nContent, setNContent] = useState("");
  const [nUsageUnit, setNUsageUnit] = useState("");

  function selectBrand(bu: string) {
    router.push(`/admin/costing/bahan?bu=${encodeURIComponent(bu)}`);
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  function addMaterial() {
    if (!activeBrand) {
      toast.error("Pilih brand dulu");
      return;
    }
    if (!nName.trim()) {
      toast.error("Nama bahan wajib diisi");
      return;
    }
    const price = Number(nPrice.replace(/[^\d]/g, ""));
    const content = parseDecimalId(nContent);
    if (content == null || !(content > 0)) {
      toast.error("Isi per satuan beli harus > 0");
      return;
    }
    startTransition(async () => {
      const res = await createMaterial({
        business_unit: activeBrand,
        name: nName.trim(),
        category: nCategory.trim() || null,
        purchase_unit: nPurchaseUnit.trim() || "unit",
        purchase_price: price,
        content_per_purchase: content,
        usage_unit: nUsageUnit.trim() || "unit",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setNName("");
      setNCategory("");
      setNPurchaseUnit("");
      setNPrice("");
      setNContent("");
      setNUsageUnit("");
      toast.success("Bahan ditambahkan");
      router.refresh();
    });
  }

  if (brands.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada brand. Tambahkan di{" "}
        <Link href="/admin/settings" className="underline">
          Settings
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/costing?bu=${encodeURIComponent(activeBrand ?? "")}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={13} /> Produk
        </Link>
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
      </div>

      {/* Tambah bahan */}
      <div className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
          <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nama
            </span>
            <input
              value={nName}
              onChange={(e) => setNName(e.target.value)}
              placeholder="Tepung terigu"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Kategori
            </span>
            <input
              value={nCategory}
              onChange={(e) => setNCategory(e.target.value)}
              placeholder="tepung"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Satuan beli
            </span>
            <input
              value={nPurchaseUnit}
              onChange={(e) => setNPurchaseUnit(e.target.value)}
              placeholder="sak"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Harga beli
            </span>
            <input
              value={nPrice}
              onChange={(e) => setNPrice(e.target.value)}
              inputMode="numeric"
              placeholder="300000"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Isi (satuan pakai)
            </span>
            <input
              value={nContent}
              onChange={(e) => setNContent(e.target.value)}
              inputMode="decimal"
              placeholder="25000"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Satuan pakai
            </span>
            <input
              value={nUsageUnit}
              onChange={(e) => setNUsageUnit(e.target.value)}
              placeholder="gram"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={addMaterial}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-primary px-3 text-sm font-bold disabled:opacity-60"
          >
            <Plus size={15} /> Tambah bahan
          </button>
        </div>
      </div>

      {/* Daftar bahan */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Belum ada bahan untuk {activeBrand}.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <MaterialRow
              key={m.id}
              m={m}
              pending={pending}
              expanded={expanded === m.id}
              onToggle={() => setExpanded((e) => (e === m.id ? null : m.id))}
              onField={(patch) =>
                run(() => updateMaterial({ id: m.id, ...patch }))
              }
              onDelete={() => {
                if (!confirm(`Hapus bahan "${m.name}"?`)) return;
                startTransition(async () => {
                  const res = await deleteMaterial(m.id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  // Bahan yang masih dipakai resep hanya dinonaktifkan
                  // (jaga integritas HPP historis), bukan dihapus permanen.
                  toast.success(
                    res.data?.softDeleted
                      ? "Bahan dinonaktifkan (masih dipakai resep)"
                      : "Bahan dihapus"
                  );
                  router.refresh();
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialRow({
  m,
  pending,
  expanded,
  onToggle,
  onField,
  onDelete,
}: {
  m: CostingMaterial;
  pending: boolean;
  expanded: boolean;
  onToggle: () => void;
  onField: (patch: Partial<CostingMaterial>) => void;
  onDelete: () => void;
}) {
  const unitPrice =
    m.content_per_purchase > 0 ? m.purchase_price / m.content_per_purchase : 0;
  const stale = Date.now() - new Date(m.price_updated_at).getTime() > STALE_MS;

  return (
    <div
      className={`rounded-2xl border-2 bg-card shadow-hard-sm ${
        m.is_active ? "border-foreground" : "border-border opacity-70"
      }`}
    >
      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 items-end">
        <TextField label="Nama" value={m.name} onCommit={(v) => v && onField({ name: v })} />
        <TextField
          label="Kategori"
          value={m.category ?? ""}
          onCommit={(v) => onField({ category: v || null })}
        />
        <TextField
          label="Satuan beli"
          value={m.purchase_unit}
          onCommit={(v) => onField({ purchase_unit: v })}
        />
        <NumField
          label="Harga beli"
          value={m.purchase_price}
          money
          onCommit={(v) => onField({ purchase_price: v })}
        />
        <NumField
          label="Isi / beli"
          value={m.content_per_purchase}
          decimal
          min={0.0001}
          onCommit={(v) => v > 0 && onField({ content_per_purchase: v })}
        />
        <TextField
          label="Satuan pakai"
          value={m.usage_unit}
          onCommit={(v) => onField({ usage_unit: v })}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Harga / {m.usage_unit}
          </span>
          <div className="h-9 flex items-center gap-1.5 text-sm font-bold tabular-nums">
            {fmtRpPrecise(unitPrice)}
            {stale && (
              <span
                title={`Harga belum diupdate > ${STALE_DAYS} hari`}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning"
              >
                <AlertTriangle size={12} /> basi
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 pb-2 -mt-1">
        {!m.is_active && (
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            nonaktif
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <History size={13} /> {expanded ? "Tutup" : "Dampak & riwayat"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Trash2 size={13} /> Hapus
        </button>
      </div>
      {expanded && <ImpactPanel material={m} />}
    </div>
  );
}

/** Lazy-load: produk yang terdampak + riwayat harga bahan ini. */
function ImpactPanel({ material }: { material: CostingMaterial }) {
  const [loading, setLoading] = useState(true);
  const [affected, setAffected] = useState<CostingProductWithHpp[]>([]);
  const [history, setHistory] = useState<MaterialPriceHistoryRow[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      listProductsUsingMaterial(material.id),
      listMaterialPriceHistory(material.id),
    ]).then(([a, h]) => {
      if (!alive) return;
      if (a.ok) setAffected(a.data ?? []);
      if (h.ok) setHistory(h.data ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // Refetch saat harga/isi berubah (bukan hanya id) — panel ini justru
    // ada untuk menampilkan dampak repricing terkini.
  }, [material.id, material.purchase_price, material.content_per_purchase]);

  return (
    <div className="border-t-2 border-foreground/20 p-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div>
        <h3 className="font-bold text-[12px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Produk terdampak
        </h3>
        {loading ? (
          <p className="text-muted-foreground text-[13px]">Memuat…</p>
        ) : affected.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            Belum dipakai produk mana pun.
          </p>
        ) : (
          <ul className="space-y-1">
            {affected.map(({ product, breakdown }) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-2"
              >
                <Link
                  href={`/admin/costing/${product.id}`}
                  className="hover:underline truncate"
                >
                  {product.name}
                </Link>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  HPP {formatRp(breakdown.hppUnit)}
                  {breakdown.marginPercent != null
                    ? ` · ${fmtPercent(breakdown.marginPercent)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="font-bold text-[12px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Riwayat harga
        </h3>
        {loading ? (
          <p className="text-muted-foreground text-[13px]">Memuat…</p>
        ) : history.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            Belum ada perubahan harga tercatat.
          </p>
        ) : (
          <ul className="space-y-1">
            {history.map((h) => {
              const up =
                h.content_per_purchase > 0
                  ? h.purchase_price / h.content_per_purchase
                  : 0;
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 text-[13px]"
                >
                  <span className="text-muted-foreground">
                    {new Date(h.effective_from).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="tabular-nums">
                    {formatRp(h.purchase_price)} · {fmtRpPrecise(up)}/
                    {material.usage_unit}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
