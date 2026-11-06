"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, ChevronDown, ChevronRight, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { PurchaseEditDialog } from "./PurchaseEditDialog";
import { cn } from "@/lib/utils";
import { walletLabel } from "@/lib/procurement/wallet-label";
import { formatRp } from "@/lib/cashflow/format";
import { categoryLabelFull } from "@/lib/procurement/categories";
import {
  acceptFlaggedPrice,
  deletePurchase,
  dismissFlaggedPrice,
  updatePurchaseMoneySource,
  type PurchaseSummary,
  type PurchaseView,
} from "@/lib/actions/procurement-purchases.actions";

const nf = (n: number, max = 2) => n.toLocaleString("id-ID", { maximumFractionDigits: max });

function dayLabel(ymd: string, today: string): string {
  if (ymd === today) return "Hari ini";
  const y = new Date(new Date(today + "T00:00:00Z").getTime() - 86_400_000).toISOString().slice(0, 10);
  if (ymd === y) return "Kemarin";
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Ringkasan bulan berjalan: total, jumlah nota, dan sebaran per kategori. */
export function PurchaseSummaryCard({
  summary,
  title,
  compact = false,
}: {
  summary: PurchaseSummary;
  title: string;
  /** Mobile petugas: total dan jumlah nota saja; sebaran per kategori terlipat. */
  compact?: boolean;
}) {
  const max = summary.byCategory[0]?.total ?? 0;
  const categories = (
    <ul className="space-y-1.5">
      {summary.byCategory.slice(0, 5).map((c) => (
        <li key={c.category} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate">{categoryLabelFull(c.category)}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatRp(c.total)}</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${max > 0 ? (c.total / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
  if (compact) {
    return (
      <section className="rounded-xl border border-border bg-card px-3.5 py-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{title}</p>
            <p className="font-display text-xl font-bold tabular-nums leading-tight">{formatRp(summary.total)}</p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <p>
              <b className="text-foreground tabular-nums">{summary.noteCount}</b> nota
            </p>
            {summary.flaggedLines > 0 && (
              <p className="mt-0.5 inline-flex items-center gap-1 font-semibold text-destructive">
                <AlertTriangle size={12} aria-hidden /> {summary.flaggedLines} perlu ditinjau
              </p>
            )}
          </div>
        </div>
        {summary.byCategory.length > 0 && (
          <details className="group mt-2 border-t border-border pt-1">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90" /> Per kategori
            </summary>
            <div className="pt-1">{categories}</div>
          </details>
        )}
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="font-display text-2xl font-extrabold tabular-nums leading-tight">{formatRp(summary.total)}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            <b className="text-foreground">{summary.noteCount}</b> nota
          </p>
          {summary.flaggedLines > 0 && (
            <p className="mt-0.5 inline-flex items-center gap-1 font-semibold text-destructive">
              <AlertTriangle size={12} /> {summary.flaggedLines} harga perlu ditinjau
            </p>
          )}
        </div>
      </div>
      {summary.byCategory.length > 0 && categories}
    </section>
  );
}

/** Riwayat nota dikelompokkan per hari. `admin` menampilkan cabang + tombol tinjau harga. */
export function PurchaseHistory({
  purchases,
  today,
  admin = false,
}: {
  purchases: PurchaseView[];
  today: string;
  admin?: boolean;
}) {
  const days = [...new Set(purchases.map((p) => p.purchaseDate))];
  if (purchases.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {admin ? "Belum ada nota pada rentang ini." : <>Belum ada nota. Catat belanja pertamamu di tab &ldquo;Catat&rdquo;.</>}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {days.map((d) => {
        const list = purchases.filter((p) => p.purchaseDate === d);
        const sum = list.reduce((s, p) => s + p.total, 0);
        return (
          <section key={d} className="space-y-1.5">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="font-display text-sm font-semibold">{dayLabel(d, today)}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {list.length} nota · {formatRp(sum)}
              </span>
            </div>
            {list.map((p) => (
              <PurchaseCard key={p.id} p={p} admin={admin} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function PurchaseCard({ p, admin }: { p: PurchaseView; admin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const flagged = p.lines.filter((l) => l.priceFlag === "tinjau").length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  return (
    <article className={cn("overflow-hidden rounded-xl border bg-card", flagged > 0 ? "border-destructive/50" : "border-border")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left"
      >
        {open ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {p.vendor || "Tanpa nama toko"}
            {flagged > 0 && <AlertTriangle size={13} className="ml-1.5 inline text-destructive" />}
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {admin ? `${p.businessUnit.replace("Haengbocake ", "")} · ` : ""}
            {p.moneySource === "pengadaan" ? "Uang pengadaan · " : p.moneySource === "laci" ? "Uang laci · " : p.moneySource === "shopee" ? `${walletLabel(p.businessUnit)} · ` : ""}
            {p.purchaseTime ? `${p.purchaseTime} · ` : ""}
            {p.createdByName ?? "—"} · {p.lines.length} baris
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatRp(p.total)}</p>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3.5 py-3">
          <ul className="space-y-2">
            {p.lines.map((l) => (
              <li key={l.id} className="text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {l.materialName ?? l.description}
                      {l.brandName && <span className="font-normal text-muted-foreground"> · {l.brandName}</span>}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {categoryLabelFull(l.category)}
                      {l.qtyLabel ? ` · ${l.qtyLabel}` : ""}
                      {l.unitPriceUsage != null && l.usageUnit ? ` · Rp ${nf(l.unitPriceUsage)}/${l.usageUnit}` : ""}
                      {l.deviation != null && Math.abs(l.deviation) >= 0.05
                        ? ` · ${l.deviation > 0 ? "+" : ""}${Math.round(l.deviation * 100)}% vs biasa`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">{formatRp(l.total)}</span>
                </div>
                {l.priceFlag === "tinjau" && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11.5px]">
                    <AlertTriangle size={12} className="text-destructive" />
                    <span className="flex-1">Harga jauh dari biasanya — harga acuan belum diubah.</span>
                    {admin && (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => acceptFlaggedPrice(l.id), "Harga acuan diperbarui")}
                          className="rounded-full border border-foreground bg-card px-2.5 py-0.5 font-semibold hover:bg-muted"
                        >
                          Pakai harga ini
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => dismissFlaggedPrice(l.id), "Tanda dibersihkan")}
                          className="rounded-full border border-border px-2.5 py-0.5 font-semibold text-muted-foreground hover:bg-muted"
                        >
                          Abaikan
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {p.notes && <p className="text-xs text-muted-foreground">Catatan: {p.notes}</p>}
          {!p.canEdit && !p.canDelete && (
            <p className="text-[11px] text-muted-foreground">
              Edit/hapus hanya untuk pencatat nota di hari yang sama, atau owner.
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            {p.receiptUrl ? (
              <a
                href={p.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <ExternalLink size={12} /> Lihat foto nota
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">Foto tidak tersedia</span>
            )}
            <div className="flex items-center gap-3">
              {p.canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary disabled:opacity-50"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
              {p.canChangeSource && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const target = p.moneySource === "laci" ? "pengadaan" : "laci";
                    const label = target === "laci" ? "uang laci kasir" : "uang pengadaan";
                    if (confirm(`Ubah sumber uang nota ini jadi ${label}? Kas laci ikut terkoreksi.`)) {
                      run(() => updatePurchaseMoneySource({ id: p.id, newSource: target }), "Sumber uang diubah");
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary disabled:opacity-50"
                >
                  <ArrowLeftRight size={12} /> Ubah sumber
                </button>
              )}
              {p.canDelete && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Hapus nota ini beserta catatan kas dan stok masuknya? Tidak bisa dibatalkan.")) {
                      run(() => deletePurchase(p.id), "Nota dihapus");
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 size={12} /> Hapus
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {editing && <PurchaseEditDialog purchase={p} onClose={() => setEditing(false)} />}
    </article>
  );
}
