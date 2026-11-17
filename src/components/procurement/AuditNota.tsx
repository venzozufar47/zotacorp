"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp } from "@/lib/cashflow/format";
import { categoryLabelFull } from "@/lib/procurement/categories";
import { auditFlags, lineNeedsLook } from "@/lib/procurement/audit-flags";
import { setPurchaseAudited, type PurchaseView } from "@/lib/actions/procurement-purchases.actions";
import { PurchaseEditDialog } from "./PurchaseEditDialog";

export type AuditStatus = "belum" | "masalah" | "sesuai" | "semua";

const sortNotes = (list: PurchaseView[]) =>
  [...list].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.createdAt.localeCompare(b.createdAt));
const nf = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const addDays = (ymd: string, n: number) =>
  new Date(new Date(ymd + "T00:00:00Z").getTime() + n * 86_400_000).toISOString().slice(0, 10);
const dayShort = (ymd: string) =>
  new Date(ymd + "T00:00:00Z").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayMid = (ymd: string) =>
  new Date(ymd + "T00:00:00Z").toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

const STATUS_LABEL: Record<AuditStatus, string> = {
  belum: "Belum dicek",
  masalah: "Bermasalah",
  sesuai: "Sesuai",
  semua: "Semua",
};
const SOURCE_LABEL = { pengadaan: "Uang pengadaan", laci: "Uang laci", shopee: "Saldo Shopee" } as const;

/**
 * Audit nota untuk petugas pengadaan: satu nota per layar (foto + semua baris + total), geser untuk berpindah,
 * "Ringkas" untuk melihat semua nota rentang ini sekaligus. Status "Sesuai" disimpan; edit membuka form nota yang sama
 * dan mengembalikan nota ke "Belum dicek".
 */
export function AuditNota({
  purchases,
  today,
  brand,
  from,
  to,
  initialStatus,
  truncated,
}: {
  purchases: PurchaseView[];
  today: string;
  brand: string;
  from: string;
  to: string;
  initialStatus: AuditStatus;
  truncated: boolean;
}) {
  const router = useRouter();
  // Urut lama -> baru: antrean tertua dibereskan lebih dulu.
  const [items, setItems] = useState(() => sortNotes(purchases));
  // Data baru dari server (mis. setelah edit + refresh): ganti daftar saat render, bukan lewat effect.
  const [seen, setSeen] = useState(purchases);
  if (seen !== purchases) {
    setSeen(purchases);
    setItems(sortNotes(purchases));
  }
  const [status, setStatus] = useState<AuditStatus>(initialStatus);
  const [view, setView] = useState<"satu" | "ringkas">("satu");
  const [idx, setIdx] = useState(0);
  const [panel, setPanel] = useState(false);
  const [editing, setEditing] = useState<PurchaseView | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const flagged = useMemo(() => new Map(items.map((p) => [p.id, auditFlags(p)])), [items]);
  const counts = useMemo(() => {
    const c = { belum: 0, masalah: 0, sesuai: 0, semua: items.length };
    for (const p of items) {
      if (p.auditedAt) c.sesuai++;
      else {
        c.belum++;
        if ((flagged.get(p.id) ?? []).length > 0) c.masalah++;
      }
    }
    return c;
  }, [items, flagged]);
  const visible = useMemo(
    () =>
      items.filter((p) => {
        if (status === "semua") return true;
        if (status === "sesuai") return !!p.auditedAt;
        if (p.auditedAt) return false;
        return status === "belum" || (flagged.get(p.id) ?? []).length > 0;
      }),
    [items, status, flagged]
  );

  // Menjaga posisi: nota yang baru disahkan keluar dari daftar "Belum", jadi indeks yang sama menunjuk nota berikutnya.
  // focusId (setelah batal/unmark) memaksa kartu kembali ke nota itu sampai pengguna berpindah sendiri.
  const focusIdx = focusId ? visible.findIndex((p) => p.id === focusId) : -1;
  const safeIdx = focusIdx >= 0 ? focusIdx : Math.min(idx, Math.max(visible.length - 1, 0));
  const cur = visible[safeIdx] as PurchaseView | undefined;
  const pick = (i: number) => {
    setIdx(i);
    setFocusId(null);
  };

  const ranges = [
    { label: "Hari ini", from: today, to: today },
    { label: "Kemarin", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "7 hari", from: addDays(today, -6), to: today },
    { label: "Bulan ini", from: `${today.slice(0, 7)}-01`, to: today },
  ];
  const href = (f: string, t: string, st: AuditStatus = status) =>
    `/pengadaan?tab=audit&bu=${encodeURIComponent(brand)}&dari=${f}&sampai=${t}&st=${st}`;
  const activeRange = ranges.find((r) => r.from === from && r.to === to);
  const rangeLabel = activeRange?.label ?? (from === to ? dayMid(from) : `${dayMid(from)} – ${dayMid(to)}`);

  function patch(id: string, auditedAt: string | null, auditedByName: string | null) {
    setItems((list) => list.map((p) => (p.id === id ? { ...p, auditedAt, auditedByName } : p)));
  }

  function markOk(p: PurchaseView) {
    start(async () => {
      const res = await setPurchaseAudited(p.id, true);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal menyimpan" : res.error);
        return;
      }
      patch(p.id, res.data.auditedAt, "Kamu");
      // Pada tampilan yang tetap memuat nota ini (Semua), pindah sendiri ke nota berikutnya.
      if (status === "semua") pick(Math.min(visible.length - 1, safeIdx + 1));
      toast.success("Nota ditandai sesuai", {
        action: {
          label: "Batal",
          onClick: () => {
            void setPurchaseAudited(p.id, false).then((r) => {
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              patch(p.id, null, null);
              setFocusId(p.id);
            });
          },
        },
      });
    });
  }

  function unmark(p: PurchaseView) {
    start(async () => {
      const res = await setPurchaseAudited(p.id, false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      patch(p.id, null, null);
      setFocusId(p.id);
    });
  }

  // Geser kiri/kanan di kartu = nota berikutnya/sebelumnya.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const go = (d: number) => pick(Math.max(0, Math.min(visible.length - 1, safeIdx + d)));

  return (
    <div className="mx-auto max-w-xl space-y-2.5 pb-2">
      {/* Bilah filter ringkas: satu ketukan membuka rentang tanggal + status */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPanel((o) => !o)}
          aria-expanded={panel}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 text-left active:bg-muted"
        >
          <span className="truncate text-sm font-semibold">{rangeLabel}</span>
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
            {STATUS_LABEL[status]} {counts[status]}
          </span>
          <ChevronRight size={14} className={cn("ml-auto shrink-0 transition-transform", panel && "rotate-90")} aria-hidden />
        </button>
        <div role="group" aria-label="Tampilan" className="inline-flex shrink-0 rounded-xl bg-muted p-0.5">
          {(
            [
              { k: "satu", icon: Square, label: "Satu nota" },
              { k: "ringkas", icon: LayoutGrid, label: "Ringkas" },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              aria-label={o.label}
              aria-pressed={view === o.k}
              onClick={() => setView(o.k)}
              className={cn(
                "grid size-10 place-items-center rounded-[10px]",
                view === o.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              <o.icon size={17} />
            </button>
          ))}
        </div>
      </div>

      {panel && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-2.5">
          <div>
            <div className="grid grid-cols-4 gap-1">
              {ranges.map((r) => (
                <Link
                  key={r.label}
                  href={href(r.from, r.to)}
                  prefetch={false}
                  aria-current={activeRange?.label === r.label ? "true" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center justify-center rounded-lg border px-1 text-xs font-semibold",
                    activeRange?.label === r.label
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {r.label}
                </Link>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                max={today}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="Dari tanggal"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-1 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="date"
                value={customTo}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="Sampai tanggal"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-1 text-xs"
              />
              <button
                type="button"
                disabled={!customFrom || !customTo}
                onClick={() => {
                  const [f, t] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
                  router.push(href(f, t));
                }}
                className="h-9 shrink-0 rounded-lg bg-foreground px-2.5 text-xs font-semibold text-background disabled:opacity-40"
              >
                Terapkan
              </button>
            </div>
          </div>
          <div>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
              {(["belum", "masalah", "sesuai", "semua"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatus(s);
                    pick(0);
                    setPanel(false);
                  }}
                  aria-pressed={status === s}
                  className={cn(
                    "flex min-h-9 items-center justify-center gap-1 rounded-lg text-xs font-semibold",
                    status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {STATUS_LABEL[s].replace(" dicek", "")}
                  <span className="tabular-nums opacity-60">{counts[s]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {truncated && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Rentang ini berisi lebih dari 200 nota; hanya 200 terbaru yang dimuat. Persempit tanggal untuk melihat sisanya.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? "Tidak ada nota pada rentang ini."
            : status === "belum" || status === "masalah"
              ? "Semua nota di rentang ini sudah sesuai."
              : "Tidak ada nota dengan status ini."}
        </p>
      ) : view === "ringkas" ? (
        <Overview
          visible={visible}
          flagged={flagged}
          onPick={(i) => {
            pick(i);
            setView("satu");
          }}
        />
      ) : (
        cur && (
          <>
            <article
              key={cur.id}
              onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
              onTouchEnd={(e) => {
                const t = touch.current;
                touch.current = null;
                if (!t) return;
                const dx = e.changedTouches[0].clientX - t.x;
                const dy = e.changedTouches[0].clientY - t.y;
                if (Math.abs(dx) > 70 && Math.abs(dy) < 45) go(dx < 0 ? 1 : -1);
              }}
              className={cn(
                "overflow-hidden rounded-xl border bg-card",
                cur.auditedAt ? "border-success/50" : (flagged.get(cur.id) ?? []).length ? "border-destructive/50" : "border-border"
              )}
            >
              <NoteCard p={cur} flags={flagged.get(cur.id) ?? []} onZoom={() => cur.receiptUrl && setZoom(cur.receiptUrl)} />
            </article>

            {/* Aksi selalu terjangkau ibu jari */}
            <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-20 flex items-center gap-1.5 rounded-xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur md:bottom-0">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={safeIdx === 0}
                aria-label="Nota sebelumnya"
                className="grid size-12 shrink-0 place-items-center rounded-lg border border-border disabled:opacity-30"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                disabled={!cur.canAuditEdit}
                onClick={() => setEditing(cur)}
                title={cur.canAuditEdit ? undefined : "Nota uang laci: koreksi lewat owner"}
                className="grid size-12 shrink-0 place-items-center rounded-lg border border-border disabled:opacity-40"
              >
                <Pencil size={16} aria-label="Edit" />
              </button>
              {cur.auditedAt ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => unmark(cur)}
                  className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground disabled:opacity-50"
                >
                  <Undo2 size={16} /> Batalkan
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => markOk(cur)}
                  className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-success text-sm font-bold text-white disabled:opacity-50"
                >
                  <Check size={18} /> Sesuai
                </button>
              )}
              <span className="w-11 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                {safeIdx + 1}/{visible.length}
              </span>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={safeIdx >= visible.length - 1}
                aria-label="Nota berikutnya"
                className="grid size-12 shrink-0 place-items-center rounded-lg border border-border disabled:opacity-30"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </>
        )
      )}

      {editing && (
        <PurchaseEditDialog
          purchase={editing}
          viaAudit
          onClose={() => setEditing(null)}
        />
      )}
      {zoom && <ReceiptZoom src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function NoteCard({ p, flags, onZoom }: { p: PurchaseView; flags: ReturnType<typeof auditFlags>; onZoom: () => void }) {
  const sum = p.lines.reduce((s, l) => s + l.total, 0);
  return (
    <>
      <button
        type="button"
        onClick={onZoom}
        disabled={!p.receiptUrl}
        aria-label="Perbesar foto nota"
        className="relative block h-36 w-full bg-muted"
      >
        {p.receiptUrl ? (
          // Foto bertanda tangan sementara dari penyimpanan privat: <img> biasa, bukan next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.receiptUrl} alt="Foto nota" loading="lazy" className="size-full object-contain" />
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">Foto nota tidak ada</span>
        )}
      </button>

      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">{p.vendor || "Tanpa nama toko"}</p>
            <p className="text-[11.5px] text-muted-foreground">
              {dayShort(p.purchaseDate)}
              {p.purchaseTime ? ` · ${p.purchaseTime}` : ""} · {SOURCE_LABEL[p.moneySource]} · {p.createdByName ?? "—"}
            </p>
          </div>
          <p className="shrink-0 font-display text-base font-bold tabular-nums leading-tight">{formatRp(p.total)}</p>
        </div>

        {(flags.length > 0 || p.auditedAt) && (
          <div className="flex flex-wrap gap-1">
            {p.auditedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                <Check size={11} /> Sesuai{p.auditedByName ? ` · ${p.auditedByName}` : ""}
              </span>
            )}
            {flags.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
              >
                <AlertTriangle size={11} /> {f.label}
              </span>
            ))}
          </div>
        )}

        <ul className="divide-y divide-border/60">
          {p.lines.map((l) => (
            <li key={l.id} className={cn("flex items-start justify-between gap-3 py-1 text-[13px]", lineNeedsLook(l) && "-mx-1.5 bg-destructive/10 px-1.5")}>
              <div className="min-w-0">
                <p className="font-medium leading-snug">
                  {l.materialName ?? (l.description || "—")}
                  {l.brandName && <span className="font-normal text-muted-foreground"> · {l.brandName}</span>}
                </p>
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  {l.category ? categoryLabelFull(l.category) : "Kategori kosong"}
                  {l.qtyLabel ? ` · ${l.qtyLabel}` : l.kind === "bahan" ? " · jumlah kosong" : ""}
                  {l.unitPriceUsage != null && l.usageUnit ? ` · Rp ${nf(l.unitPriceUsage)}/${l.usageUnit}` : ""}
                  {l.deviation != null && Math.abs(l.deviation) >= 0.05
                    ? ` · ${l.deviation > 0 ? "+" : ""}${Math.round(l.deviation * 100)}% vs biasa`
                    : ""}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{formatRp(l.total)}</span>
            </li>
          ))}
        </ul>
        {Math.abs(sum - p.total) > 1 && (
          <p className="text-right text-xs font-semibold text-destructive">Selisih {formatRp(p.total - sum)}</p>
        )}
        {p.notes && <p className="text-xs text-muted-foreground">Catatan: {p.notes}</p>}
      </div>
    </>
  );
}

function Overview({
  visible,
  flagged,
  onPick,
}: {
  visible: PurchaseView[];
  flagged: Map<string, ReturnType<typeof auditFlags>>;
  onPick: (i: number) => void;
}) {
  const days = [...new Set(visible.map((p) => p.purchaseDate))];
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const list = visible.map((p, i) => ({ p, i })).filter((x) => x.p.purchaseDate === d);
        return (
          <section key={d} className="space-y-1">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-sm font-semibold">{dayShort(d)}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {list.length} nota · {formatRp(list.reduce((s, x) => s + x.p.total, 0))}
              </span>
            </div>
            {list.map(({ p, i }) => {
              const fl = flagged.get(p.id) ?? [];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(i)}
                  className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-1.5 text-left active:bg-muted"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full",
                      p.auditedAt ? "bg-success/15 text-success" : fl.length ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                    )}
                    aria-label={p.auditedAt ? "Sesuai" : fl.length ? "Bermasalah" : "Belum dicek"}
                  >
                    {p.auditedAt ? <Check size={13} /> : fl.length ? <AlertTriangle size={12} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{p.vendor || "Tanpa nama toko"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {p.purchaseTime ? `${p.purchaseTime} · ` : ""}
                      {p.lines.length} baris{fl.length ? ` · ${fl.map((f) => f.label).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatRp(p.total)}</span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function ReceiptZoom({ src, onClose }: { src: string; onClose: () => void }) {
  const [big, setBig] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/90">
      <div className="flex items-center justify-between px-4 py-2 text-white">
        <button type="button" onClick={() => setBig((b) => !b)} className="text-sm font-semibold">
          {big ? "Muat layar" : "Perbesar"}
        </button>
        <button type="button" onClick={onClose} aria-label="Tutup" className="grid size-10 place-items-center">
          <X size={22} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Foto nota diperbesar" className={cn("mx-auto", big ? "w-[250%] max-w-none" : "max-h-full max-w-full object-contain")} />
      </div>
    </div>
  );
}
