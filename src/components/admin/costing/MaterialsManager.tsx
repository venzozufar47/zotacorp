"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRunAction } from "@/components/admin/cleaning/useRunAction";
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertTriangle,
  History,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  updateMaterial,
  deleteMaterial,
  listProductsUsingMaterial,
  listMaterialPriceHistory,
  type CostingMaterial,
  type CostingProductWithHpp,
  type CostingUnit,
  type MaterialPriceHistoryRow,
} from "@/lib/actions/costing.actions";
import { rememberBrand } from "@/lib/costing/brands";
import { fmtPercent, fmtRpPrecise } from "./format";
import { NumField, TextField } from "./fields";
import { MaterialWizard } from "./MaterialWizard";
import { MaterialMatrix } from "./MaterialMatrix";

const STALE_DAYS = 60;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
/** Kunci semu untuk bahan yang belum diberi kategori. */
const NO_CATEGORY = "__none__";

export function MaterialsManager({
  brands,
  activeBrand,
  rows,
  products,
  units,
}: {
  brands: string[];
  activeBrand: string | null;
  rows: CostingMaterial[];
  products: CostingProductWithHpp[];
  units: CostingUnit[];
}) {
  const { run, pending, startTransition, router } = useRunAction();
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Filter kategori; "" = semua, NO_CATEGORY = bahan tanpa kategori. */
  const [catFilter, setCatFilter] = useState("");
  const [query, setQuery] = useState("");

  /** Tampilan: daftar (satu kartu per bahan) atau peta bahan × produk. */
  const [view, setView] = useState<"daftar" | "peta">("daftar");
  /** Panel bertahap: null = tertutup; material null = bahan baru. */
  const [wizard, setWizard] = useState<{ material: CostingMaterial | null } | null>(null);

  // Kategori unik (untuk filter + datalist form), urut alfabetis.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of rows) if (m.category?.trim()) set.add(m.category.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
  }, [rows]);

  const hasUncategorized = useMemo(
    () => rows.some((m) => !m.category?.trim()),
    [rows]
  );

  // Bahan sesuai filter, dikelompokkan per kategori (urut; tanpa kategori
  // di akhir) supaya daftar panjang tetap mudah dipindai.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = rows.filter((m) => {
      const cat = m.category?.trim() || "";
      // Pencarian menembus filter kategori: saat mencari, cari di semua
      // kategori — kalau tidak, bahan yang dicari "hilang" hanya karena
      // chip lain sedang aktif.
      if (q) return m.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
      if (!catFilter) return true;
      return catFilter === NO_CATEGORY ? !cat : cat === catFilter;
    });
    const byCat = new Map<string, CostingMaterial[]>();
    for (const m of visible) {
      const key = m.category?.trim() || NO_CATEGORY;
      const arr = byCat.get(key) ?? [];
      arr.push(m);
      byCat.set(key, arr);
    }
    return Array.from(byCat.entries()).sort(([a], [b]) =>
      a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b, "id")
    );
  }, [rows, catFilter, query]);

  const shownCount = useMemo(
    () => groups.reduce((s, [, list]) => s + list.length, 0),
    [groups]
  );

  function selectBrand(bu: string) {
    rememberBrand(bu);
    router.push(`/admin/costing/bahan?bu=${encodeURIComponent(bu)}`);
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

      {/* Tampilan + tambah bahan */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border-2 border-foreground bg-card p-0.5">
          {(["daftar", "peta"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`h-8 rounded-lg px-3 text-sm font-semibold transition ${
                view === v ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "daftar" ? "Daftar" : "Peta bahan × produk"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setWizard({ material: null })}
          disabled={!activeBrand}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-3 text-sm font-bold disabled:opacity-60"
        >
          <Plus size={15} /> Bahan baru
        </button>
      </div>

      {view === "peta" && activeBrand && (
        <MaterialMatrix
          materials={rows}
          products={products}
          units={units}
          categories={categories}
          onOpenMaterial={(m) => setWizard({ material: m })}
          onNewMaterial={() => setWizard({ material: null })}
        />
      )}
      {wizard && activeBrand && (
        <MaterialWizard
          key={wizard.material?.id ?? "new"}
          brand={activeBrand}
          material={wizard.material}
          materials={rows}
          products={products}
          units={units}
          categories={categories}
          onClose={() => setWizard(null)}
        />
      )}

      {/* Cari + filter kategori */}
      {view === "daftar" && rows.length > 0 && (
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari bahan atau kategori…"
            className="h-9 w-full rounded-xl border-2 border-foreground bg-card pl-8 pr-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              title="Bersihkan pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      {view === "daftar" && rows.length > 0 && !query && (categories.length > 0 || hasUncategorized) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label={`Semua (${rows.length})`}
            active={catFilter === ""}
            onClick={() => setCatFilter("")}
          />
          {categories.map((c) => (
            <FilterChip
              key={c}
              label={`${c} (${
                rows.filter((m) => m.category?.trim() === c).length
              })`}
              active={catFilter === c}
              onClick={() => setCatFilter(c)}
            />
          ))}
          {hasUncategorized && (
            <FilterChip
              label={`Tanpa kategori (${
                rows.filter((m) => !m.category?.trim()).length
              })`}
              active={catFilter === NO_CATEGORY}
              onClick={() => setCatFilter(NO_CATEGORY)}
            />
          )}
        </div>
      )}

      {/* Daftar bahan — dikelompokkan per kategori */}
      {view !== "daftar" ? null : rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Belum ada bahan untuk {activeBrand}.
        </div>
      ) : shownCount === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Tidak ada bahan cocok “{query}”.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([cat, list]) => (
            <div key={cat} className="space-y-2">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {cat === NO_CATEGORY ? "Tanpa kategori" : cat}
                <span className="font-normal normal-case">({list.length})</span>
                <span className="flex-1 h-px bg-border" />
              </h3>
              {list.map((m) => (
                <MaterialRow
                  key={m.id}
                  m={m}
                  pending={pending}
                  categories={categories}
                  expanded={expanded === m.id}
                  onToggle={() => setExpanded((e) => (e === m.id ? null : m.id))}
                  onWizard={() => setWizard({ material: m })}
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
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-full border-2 px-2.5 text-[11px] font-semibold transition ${
        active
          ? "border-foreground bg-primary text-foreground"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MaterialRow({
  m,
  pending,
  categories,
  expanded,
  onToggle,
  onWizard,
  onField,
  onDelete,
}: {
  m: CostingMaterial;
  categories: string[];
  pending: boolean;
  expanded: boolean;
  onToggle: () => void;
  onWizard: () => void;
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
      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
        <TextField label="Nama" value={m.name} onCommit={(v) => v && onField({ name: v })} />
        <TextField
          label="Kategori"
          value={m.category ?? ""}
          list={`cats-${m.id}`}
          onCommit={(v) => onField({ category: v || null })}
        />
        <datalist id={`cats-${m.id}`}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
        <NumField
          label="Susut"
          value={m.shrink_factor * 100}
          decimal
          suffix="%"
          onCommit={(v) => onField({ shrink_factor: Math.max(0, v) / 100 })}
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
      {/* Link beli — full-width supaya URL panjang tetap terbaca. */}
      <div className="px-3 pb-2 flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0"
          title="Link yang sama dipakai & bisa diperbarui tim pengadaan"
        >
          Link beli
        </span>
        <TextField
          value={m.shopee_url ?? ""}
          placeholder="https://shopee.co.id/…"
          onCommit={(v) => onField({ shopee_url: v || null })}
          className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px]"
        />
        {m.shopee_url && (
          <a
            href={m.shopee_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Buka link pembelian"
            className="shrink-0 inline-flex items-center gap-1 h-8 rounded-lg border border-border px-2 text-[11px] font-semibold text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            <ExternalLink size={13} /> Buka
          </a>
        )}
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
          onClick={onWizard}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
        >
          Simulasi & tautan produk
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
                    ? ` · Margin ${fmtPercent(breakdown.marginPercent)}`
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
