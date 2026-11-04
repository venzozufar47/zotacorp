"use client";

/**
 * Papan pantau pengadaan satu brand.
 *
 * CATATAN: aksi di sini memakai `ActionResult` dari `_gates.ts`
 * (`{ok:false,error}`). JANGAN pakai `useRunAction` — hook itu menunggu
 * bentuk lama `{error}` dan akan menganggap kegagalan sebagai sukses.
 * Semua pemanggilan memeriksa `res.ok` sendiri.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  X,
  ExternalLink,
  PackagePlus,
  ClipboardList,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import { fmtRpPrecise } from "@/components/admin/costing/format";
import { NumField, TextField } from "@/components/admin/costing/fields";
import { rememberBrand } from "@/lib/costing/brands";
import type { ProcurementRow } from "@/lib/procurement/rows";
import type { ProcurementStatus } from "@/lib/procurement/calc";
import {
  upsertMaterialParams,
  updateMaterialPurchaseLink,
  type GoodsInRow,
} from "@/lib/actions/procurement.actions";
import {
  STATUS_LABEL,
  STATUS_CLASS,
  STATUS_FILTERS,
  FRESHNESS_LABEL,
  FRESHNESS_CLASS,
  ssBasisNote,
  eoqErrorNote,
} from "./status";
import { GoodsInDialog } from "./GoodsInDialog";
import { BrandPanel, type BrandPanelMaterial } from "./BrandPanel";
import type { BrandSummary } from "@/lib/actions/procurement-brands.actions";

/** Angka kuantitas — satuan pakai bisa pecahan (gram/ml). */
function fmtQty(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

export function ProcurementBoard({
  brands,
  activeBrand,
  rows,
  goodsIn,
  basePath = "/pengadaan",
  brandInfo,
}: {
  brands: string[];
  activeBrand: string | null;
  rows: ProcurementRow[];
  goodsIn: GoodsInRow[];
  /** Merek per bahan (hanya halaman staf); tanpa ini bagian merek tidak ditampilkan. */
  brandInfo?: Record<string, BrandSummary>;
  /** Rute papan ini — beda untuk staf (/pengadaan) vs admin
   *  (/admin/costing/pengadaan) supaya ganti brand tidak melempar admin
   *  keluar dari shell-nya. */
  basePath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProcurementStatus | "">("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [goodsInFor, setGoodsInFor] = useState<ProcurementRow | null>(null);
  const [brandFor, setBrandFor] = useState<BrandPanelMaterial | null>(null);

  function selectBrand(bu: string) {
    rememberBrand(bu);
    router.push(`${basePath}${basePath.includes("?") ? "&" : "?"}bu=${encodeURIComponent(bu)}`);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.metrics.status] = (c[r.metrics.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const summary = useMemo(() => {
    let needBuy = 0;
    let value = 0;
    let estCost = 0;
    let oldest: number | null = null;
    for (const r of rows) {
      const s = r.metrics.status;
      if (s === "habis" || s === "kritis" || s === "menipis") {
        needBuy++;
        estCost += r.metrics.suggestion?.estCost ?? 0;
      }
      value += r.metrics.stockValue ?? 0;
      const d = r.metrics.elapsedDays;
      if (d != null && (oldest == null || d > oldest)) oldest = d;
    }
    return { needBuy, value, estCost, oldest };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      // Pencarian menembus filter status — kalau tidak, bahan yang dicari
      // "hilang" hanya karena chip lain sedang aktif.
      if (q)
        return (
          r.material.name.toLowerCase().includes(q) ||
          (r.material.category ?? "").toLowerCase().includes(q)
        );
      if (!statusFilter) return true;
      return r.metrics.status === statusFilter;
    });
  }, [rows, query, statusFilter]);

  function saveParams(row: ProcurementRow, patch: Record<string, unknown>) {
    startTransition(async () => {
      const res = await upsertMaterialParams({
        materialId: row.material.id,
        ...patch,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function saveLink(row: ProcurementRow, url: string) {
    startTransition(async () => {
      const res = await updateMaterialPurchaseLink({
        materialId: row.material.id,
        url: url || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Link pembelian disimpan");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — disembunyikan di halaman petugas: pemilih cabang & tab Opname sudah ada di bilah tab. */}
      <div className={`flex flex-wrap items-center gap-2 ${basePath.startsWith("/pengadaan") ? "hidden" : ""}`}>
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
          href={`/pengadaan/opname${activeBrand ? `?bu=${encodeURIComponent(activeBrand)}` : ""}`}
          className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold hover:bg-muted transition"
        >
          <ClipboardList size={15} /> Opname bahan
        </Link>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile
          label="Perlu dibeli"
          value={String(summary.needBuy)}
          hint={summary.estCost > 0 ? `≈ ${formatRp(summary.estCost)}` : undefined}
          tone={summary.needBuy > 0 ? "warning" : "ok"}
        />
        <Tile
          label="Habis / kritis"
          value={String((counts.habis ?? 0) + (counts.kritis ?? 0))}
          tone={(counts.habis ?? 0) + (counts.kritis ?? 0) > 0 ? "bad" : "ok"}
        />
        <Tile label="Nilai stok (est.)" value={formatRp(summary.value)} />
        <Tile
          label="Opname terakhir"
          value={
            summary.oldest == null
              ? "—"
              : `${Math.floor(summary.oldest)} hari lalu`
          }
          hint={summary.oldest == null ? "belum pernah" : undefined}
          tone={summary.oldest != null && summary.oldest > 14 ? "warning" : "ok"}
        />
      </div>

      {/* Cari + filter status */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari bahan atau kategori…"
          className="h-10 w-full rounded-xl border-2 border-foreground bg-card pl-8 pr-8 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {!query && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            label={`Semua (${rows.length})`}
            active={statusFilter === ""}
            onClick={() => setStatusFilter("")}
          />
          {STATUS_FILTERS.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
            <Chip
              key={s}
              label={`${STATUS_LABEL[s]} (${counts[s]})`}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </div>
      )}

      {/* Daftar bahan */}
      {rows.length === 0 ? (
        <Empty>Belum ada bahan untuk {activeBrand}.</Empty>
      ) : visible.length === 0 ? (
        <Empty>Tidak ada bahan cocok.</Empty>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-foreground bg-card">
          {visible.map((r) => {
            const m = r.metrics;
            const open = expanded === r.material.id;
            const note = ssBasisNote(m.ssBasis, 25);
            const eoqNote = eoqErrorNote(m.eoqError);
            const buy = m.suggestion && m.suggestion.qtyPurchaseUnits > 0 ? m.suggestion : null;
            const leadLabel =
              r.lead.source === "nyata"
                ? `nyata, ${r.lead.samples} pesanan`
                : r.lead.source === "manual"
                  ? "diisi manual"
                  : "bawaan";
            return (
              <div key={r.material.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded((e) => (e === r.material.id ? null : r.material.id))}
                  className="flex min-h-14 w-full items-center gap-2.5 px-3 py-2 text-left active:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{r.material.name}</span>
                      <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-bold ${STATUS_CLASS[m.status]}`}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    <div className="truncate text-[11px] tabular-nums text-muted-foreground">
                      {m.onHand == null
                        ? "belum ada hitungan"
                        : `${fmtQty(m.onHand)} ${r.material.usage_unit}${m.daysOfCover != null ? ` · cukup ${Math.floor(m.daysOfCover)} hari` : ""}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    {buy ? (
                      <>
                        <div className="text-[13px] font-bold">
                          Beli {fmtQty(buy.qtyPurchaseUnits, 2)} {r.material.purchase_unit}
                        </div>
                        <div className="text-[10px] text-muted-foreground">≈ {formatRp(buy.estCost)}</div>
                      </>
                    ) : m.onHand == null ? (
                      <span className="text-[11px] font-semibold text-muted-foreground">Opname dulu</span>
                    ) : m.suggestion?.reason === "dipesan" ? (
                      <span className="text-[11px] font-semibold">Sudah dipesan</span>
                    ) : null}
                  </div>
                  <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} aria-hidden />
                </button>

                {open && (
                  <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3">
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`/pengadaan?tab=catat&bu=${encodeURIComponent(activeBrand ?? "")}&bahan=${r.material.id}`}
                        className="col-span-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-primary text-sm font-bold text-primary-foreground"
                      >
                        <PackagePlus size={16} aria-hidden /> Catat belanja
                      </a>
                      <button
                        type="button"
                        onClick={() => setGoodsInFor(r)}
                        className="h-10 rounded-xl border border-border bg-card text-xs font-semibold"
                      >
                        Barang masuk tanpa nota
                      </button>
                      {brandInfo?.[r.material.id] ? (
                        <button
                          type="button"
                          onClick={() =>
                            setBrandFor({
                              id: r.material.id,
                              name: r.material.name,
                              category: r.material.category,
                              halalKind: brandInfo[r.material.id].halalKind,
                              inHalalList: brandInfo[r.material.id].inHalalList,
                            })
                          }
                          className="h-10 rounded-xl border border-border bg-card text-xs font-semibold"
                        >
                          {brandInfo[r.material.id].brandCount > 0 ? "Ganti merek" : "Merek"}
                        </button>
                      ) : (
                        <span />
                      )}
                      {r.material.shopee_url && (
                        <a
                          href={r.material.shopee_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-semibold"
                        >
                          <ExternalLink size={13} aria-hidden /> Buka link beli
                        </a>
                      )}
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                      <div className="flex justify-between gap-2">
                        <dt>Harga</dt>
                        <dd className="font-semibold text-foreground">
                          {fmtRpPrecise(m.unitCost)}/{r.material.usage_unit}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Data stok</dt>
                        <dd className={`font-semibold ${m.freshness ? FRESHNESS_CLASS[m.freshness] : ""}`}>
                          {m.freshness ? FRESHNESS_LABEL[m.freshness] : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Titik pesan</dt>
                        <dd className="font-semibold text-foreground">
                          {fmtQty(m.reorderPoint)} {r.material.usage_unit}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Lead time</dt>
                        <dd className="font-semibold text-foreground">
                          {fmtQty(r.lead.days)} hari <span className="font-normal opacity-70">({leadLabel})</span>
                        </dd>
                      </div>
                      {r.inTransit.count > 0 && (
                        <div className="col-span-2 flex justify-between gap-2">
                          <dt>Di jalan</dt>
                          <dd className="font-semibold text-foreground">
                            {fmtQty(r.inTransit.qtyUsage)} {r.material.usage_unit}
                            {r.inTransit.expectedAt ? ` · tiba ${r.inTransit.expectedAt}` : ""}
                          </dd>
                        </div>
                      )}
                      {brandInfo?.[r.material.id]?.currentBrand && (
                        <div className="col-span-2 flex justify-between gap-2">
                          <dt>Dipakai</dt>
                          <dd className="font-semibold text-foreground">{brandInfo[r.material.id].currentBrand}</dd>
                        </div>
                      )}
                    </dl>

                    <details className="rounded-xl border border-border bg-card">
                      <summary className="flex min-h-10 cursor-pointer select-none items-center px-3 text-xs font-semibold text-primary">
                        Atur parameter &amp; rincian hitungan
                      </summary>
                      <div className="space-y-3 border-t border-border p-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                          <NumField
                            label={`Pakai / hari (${r.material.usage_unit})`}
                            value={r.params.avgDailyUsage}
                            decimal
                            onCommit={(v) => saveParams(r, { avgDailyUsage: v })}
                          />
                          <NumField
                            label="Lead time (hari kerja)"
                            value={r.params.leadTimeDays}
                            decimal
                            onCommit={(v) => saveParams(r, { leadTimeDays: v })}
                          />
                          <NumField
                            label="Variasi pakai (±)"
                            value={r.params.usageSigmaDaily ?? 0}
                            decimal
                            onCommit={(v) => saveParams(r, { usageSigmaDaily: v > 0 ? v : null })}
                          />
                          <NumField
                            label="Variasi lead time"
                            value={r.params.leadTimeSigmaDays ?? 0}
                            decimal
                            onCommit={(v) => saveParams(r, { leadTimeSigmaDays: v > 0 ? v : null })}
                          />
                          <NumField
                            label={`MOQ (${r.material.purchase_unit})`}
                            value={r.params.moqPurchaseUnits}
                            decimal
                            onCommit={(v) => saveParams(r, { moqPurchaseUnits: v })}
                          />
                          <NumField
                            label="Kelipatan pesan"
                            value={r.params.orderMultipleUnits}
                            decimal
                            onCommit={(v) => v > 0 && saveParams(r, { orderMultipleUnits: v })}
                          />
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Link pembelian</span>
                            <TextField
                              value={r.material.shopee_url ?? ""}
                              placeholder="https://shopee.co.id/…"
                              onCommit={(v) => saveLink(r, v)}
                              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-[12px]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Supplier</span>
                            <TextField
                              value={r.params.supplier ?? ""}
                              placeholder="nama toko"
                              onCommit={(v) => saveParams(r, { supplier: v })}
                              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-[12px]"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                          <span>
                            Safety stock{" "}
                            <b className="text-foreground">
                              {fmtQty(m.safetyStock)} {r.material.usage_unit}
                            </b>
                          </span>
                          <span>
                            EOQ <b className="text-foreground">{m.eoq == null ? "—" : `${fmtQty(m.eoq)} ${r.material.usage_unit}`}</b>
                          </span>
                          <span>
                            Service level{" "}
                            <b className="text-foreground">
                              {Math.round((r.params.serviceLevelOverride ?? 0) * 100) || "global"}
                              {r.params.serviceLevelOverride ? "%" : ""}
                            </b>{" "}
                            <span className="opacity-70">(z {m.z.toFixed(3)})</span>
                          </span>
                          {m.daysUntilReorder != null && (
                            <span>
                              Waktu ke titik pesan <b className="text-foreground">{Math.floor(m.daysUntilReorder)} hari</b>
                            </span>
                          )}
                        </div>

                        {(note || eoqNote) && (
                          <div className="space-y-1">
                            {note && (
                              <p className="flex items-start gap-1.5 text-[11px] text-warning-foreground">
                                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                {note}
                              </p>
                            )}
                            {eoqNote && <p className="pl-[18px] text-[11px] text-muted-foreground">{eoqNote}</p>}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Barang masuk terakhir */}
      {goodsIn.length > 0 && (
        <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm p-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Barang masuk terakhir
          </h2>
          <ul className="divide-y divide-border text-sm">
            {goodsIn.slice(0, 10).map((g) => (
              <li key={g.id} className="py-1.5 flex items-center gap-2">
                <span className="flex-1 truncate">{g.materialName}</span>
                <span className="tabular-nums text-muted-foreground text-[12px]">
                  {fmtQty(g.qtyPurchaseUnits, 2)} × ·{" "}
                  {g.totalPaid != null ? formatRp(g.totalPaid) : "—"}
                </span>
                <span className="text-[11px] text-muted-foreground w-20 text-right">
                  {g.receiptDate}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brandFor && <BrandPanel material={brandFor} onClose={() => setBrandFor(null)} />}

      {goodsInFor && (
        <GoodsInDialog
          row={goodsInFor}
          pending={pending}
          onClose={() => setGoodsInFor(null)}
          onDone={() => {
            setGoodsInFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone = "ok",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warning" | "bad";
}) {
  const cls =
    tone === "bad"
      ? "bg-destructive/15"
      : tone === "warning"
        ? "bg-warning/30"
        : "bg-card";
  return (
    <div className={`rounded-2xl border-2 border-foreground p-3 shadow-hard-sm ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-extrabold tabular-nums leading-tight">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-muted-foreground tabular-nums">{hint}</div>
      )}
    </div>
  );
}

function Chip({
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
