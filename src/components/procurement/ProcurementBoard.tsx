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
}: {
  brands: string[];
  activeBrand: string | null;
  rows: ProcurementRow[];
  goodsIn: GoodsInRow[];
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

  function selectBrand(bu: string) {
    rememberBrand(bu);
    router.push(`${basePath}?bu=${encodeURIComponent(bu)}`);
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
      {/* Toolbar */}
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
          className="h-9 w-full rounded-xl border-2 border-foreground bg-card pl-8 pr-8 text-sm"
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
        <div className="space-y-2">
          {visible.map((r) => {
            const m = r.metrics;
            const open = expanded === r.material.id;
            const note = ssBasisNote(m.ssBasis, 25);
            const eoqNote = eoqErrorNote(m.eoqError);
            return (
              <div
                key={r.material.id}
                className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm"
              >
                <div className="p-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((e) => (e === r.material.id ? null : r.material.id))
                    }
                    className="flex-1 min-w-[180px] text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">
                        {r.material.name}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-muted-foreground transition ${open ? "rotate-180" : ""}`}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.material.category ?? "tanpa kategori"} ·{" "}
                      {fmtRpPrecise(m.unitCost)}/{r.material.usage_unit}
                    </div>
                  </button>

                  <span
                    className={`shrink-0 rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[m.status]}`}
                  >
                    {STATUS_LABEL[m.status]}
                  </span>

                  <div className="w-28 text-right tabular-nums">
                    <div className="text-sm font-bold">
                      {fmtQty(m.onHand)} {r.material.usage_unit}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      estimasi{" "}
                      {m.freshness && (
                        <span className={FRESHNESS_CLASS[m.freshness]}>
                          · {FRESHNESS_LABEL[m.freshness]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-24 text-right tabular-nums">
                    <div className="text-sm font-semibold">
                      {m.daysOfCover == null
                        ? "—"
                        : `${Math.floor(m.daysOfCover)} hari`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">cukup</div>
                  </div>

                  <div className="w-32 text-right">
                    {m.suggestion && m.suggestion.qtyPurchaseUnits > 0 ? (
                      <>
                        <div className="text-sm font-bold text-warning-foreground">
                          beli {fmtQty(m.suggestion.qtyPurchaseUnits, 2)}{" "}
                          {r.material.purchase_unit}
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          ≈ {formatRp(m.suggestion.estCost)}
                        </div>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {r.material.shopee_url && (
                      <a
                        href={r.material.shopee_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Buka link pembelian"
                        className="inline-flex items-center gap-1 h-8 rounded-lg border border-border px-2 text-[11px] font-semibold text-muted-foreground hover:border-foreground hover:text-foreground"
                      >
                        <ExternalLink size={13} /> Beli
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setGoodsInFor(r)}
                      title="Catat barang masuk"
                      className="inline-flex items-center gap-1 h-8 rounded-lg border-2 border-foreground bg-primary px-2 text-[11px] font-bold"
                    >
                      <PackagePlus size={13} /> Masuk
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t-2 border-foreground/20 p-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      <NumField
                        label={`Pakai / hari (${r.material.usage_unit})`}
                        value={r.params.avgDailyUsage}
                        decimal
                        onCommit={(v) => saveParams(r, { avgDailyUsage: v })}
                      />
                      <NumField
                        label="Lead time (hari)"
                        value={r.params.leadTimeDays}
                        decimal
                        onCommit={(v) => saveParams(r, { leadTimeDays: v })}
                      />
                      <NumField
                        label="Variasi pakai (±)"
                        value={r.params.usageSigmaDaily ?? 0}
                        decimal
                        onCommit={(v) =>
                          saveParams(r, { usageSigmaDaily: v > 0 ? v : null })
                        }
                      />
                      <NumField
                        label="Variasi lead time"
                        value={r.params.leadTimeSigmaDays ?? 0}
                        decimal
                        onCommit={(v) =>
                          saveParams(r, { leadTimeSigmaDays: v > 0 ? v : null })
                        }
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
                        onCommit={(v) =>
                          v > 0 && saveParams(r, { orderMultipleUnits: v })
                        }
                      />
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[220px]">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Link pembelian
                        </span>
                        <TextField
                          value={r.material.shopee_url ?? ""}
                          placeholder="https://shopee.co.id/…"
                          onCommit={(v) => saveLink(r, v)}
                          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-[12px]"
                        />
                      </div>
                      <div className="w-40">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Supplier
                        </span>
                        <TextField
                          value={r.params.supplier ?? ""}
                          placeholder="nama toko"
                          onCommit={(v) => saveParams(r, { supplier: v })}
                          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-[12px]"
                        />
                      </div>
                    </div>

                    {/* Angka penyusun — supaya saran belanja bisa ditelusuri,
                        bukan kotak hitam. */}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
                      <span>
                        Safety stock{" "}
                        <b className="text-foreground">
                          {fmtQty(m.safetyStock)} {r.material.usage_unit}
                        </b>
                      </span>
                      <span>
                        Titik pesan{" "}
                        <b className="text-foreground">
                          {fmtQty(m.reorderPoint)} {r.material.usage_unit}
                        </b>
                      </span>
                      <span>
                        EOQ{" "}
                        <b className="text-foreground">
                          {m.eoq == null
                            ? "—"
                            : `${fmtQty(m.eoq)} ${r.material.usage_unit}`}
                        </b>
                      </span>
                      <span>
                        Service level{" "}
                        <b className="text-foreground">
                          {Math.round(
                            (r.params.serviceLevelOverride ?? 0) * 100
                          ) || "global"}
                          {r.params.serviceLevelOverride ? "%" : ""}
                        </b>{" "}
                        <span className="opacity-70">(z {m.z.toFixed(3)})</span>
                      </span>
                      {m.daysUntilReorder != null && (
                        <span>
                          Waktu ke titik pesan{" "}
                          <b className="text-foreground">
                            {Math.floor(m.daysUntilReorder)} hari
                          </b>
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
                        {eoqNote && (
                          <p className="text-[11px] text-muted-foreground pl-[18px]">
                            {eoqNote}
                          </p>
                        )}
                      </div>
                    )}
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
