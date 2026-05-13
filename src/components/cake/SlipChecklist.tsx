"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BranchBadge } from "./BranchBadge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowLeft,
  Cake,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Truck,
  Undo2,
  Image as ImageIcon,
  AlertTriangle,
  Plus,
  Minus,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  setOrderProductionStatus,
  getCakeAttachmentSignedUrl,
} from "@/lib/actions/cake-orders.actions";
import { acknowledgeSlipDiff } from "@/lib/actions/cake-slips.actions";
import { createClient } from "@/lib/supabase/client";
import { ImagePopup } from "./ImagePopup";
import type {
  CakeOrder,
  CakeProductionSlip,
  CakeProductionStatus,
  CakeSlipDiff,
  CakeSlipSnapshotItem,
} from "@/lib/cake-orders/types";

interface ProductionItem {
  snapshot: CakeSlipSnapshotItem;
  productionStatus: CakeProductionStatus;
  /** Admin sudah pindahkan card past "siap" / arsipkan — production
   *  team tidak boleh edit lagi. */
  adminLocked: boolean;
}

interface Props {
  slip: CakeProductionSlip;
  items: ProductionItem[];
  /** Sub-role caller (null = boleh kedua / scope orders). UI hide
   *  tombol yang tidak match role. Server-side gate jadi backstop. */
  myProductionRole: "baker" | "decorator" | null;
}

/**
 * Production team's view of a slip. Items render from the frozen
 * snapshot, NOT live cake_orders, so admin's mid-day edits are
 * invisible until next send. Production_status is the only field
 * mutated live and looked up at server-fetch time.
 *
 * `pending_diff` drives a big warning banner with field-level
 * before/after; production team taps "Saya sudah lihat" to ack.
 */
export function SlipChecklist({ slip, items, myProductionRole }: Props) {
  const router = useRouter();

  // Optimistic per-item production_status so toggles feel instant.
  const [statusById, setStatusById] = useState(() => {
    const m = new Map<string, CakeProductionStatus>();
    for (const it of items) m.set(it.snapshot.orderId, it.productionStatus);
    return m;
  });

  // Realtime: pick up updates other production members make on the
  // same slip (e.g. team A clicks "Selesai" on cake X, team B sees
  // green pill update without refresh).
  useEffect(() => {
    const orderIds = items.map((i) => i.snapshot.orderId);
    if (orderIds.length === 0) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`slip-${slip.id}-orders`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cake_orders",
          filter: `id=in.(${orderIds.join(",")})`,
        },
        (payload) => {
          const row = payload.new as unknown as CakeOrder;
          setStatusById((prev) => {
            if (prev.get(row.id) === row.production_status) return prev;
            const next = new Map(prev);
            next.set(row.id, row.production_status);
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slip.id]);

  const total = items.length;
  const done = items.filter(
    (it) =>
      (statusById.get(it.snapshot.orderId) ?? it.productionStatus) === "done"
  ).length;

  return (
    <div className="space-y-3 pb-12">
      <div className="flex items-center gap-2">
        <Link
          href="/cake-production"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight flex items-center gap-2 flex-wrap">
            Slip{" "}
            {format(
              new Date(`${slip.target_date}T00:00:00`),
              "EEEE, d MMM yyyy",
              { locale: idLocale }
            )}
            <BranchBadge branch={slip.branch} size="sm" prefix />
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {done} dari {total} cake selesai
          </p>
        </div>
      </div>

      {slip.pending_diff && (
        <DiffBanner
          slipId={slip.id}
          diff={slip.pending_diff}
          onAcknowledged={() => router.refresh()}
        />
      )}

      {/* Rekap baking khusus baker — decorator (cake artist) fokus
          ke per-customer card dengan detail filling/dekorasi. */}
      {myProductionRole !== "decorator" && (
        <BakingSummary items={items} diff={slip.pending_diff ?? null} />
      )}

      {slip.notes && (
        <div className="rounded-2xl border-2 border-foreground bg-pop-pink/15 p-3 text-sm text-foreground whitespace-pre-wrap">
          {slip.notes}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-muted-foreground text-sm">
          Slip ini kosong.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {items.map((it) => (
            <ProductionCard
              key={it.snapshot.orderId}
              snapshot={it.snapshot}
              productionStatus={
                statusById.get(it.snapshot.orderId) ?? it.productionStatus
              }
              myProductionRole={myProductionRole}
              adminLocked={it.adminLocked}
              onChange={(next) => {
                setStatusById((prev) => {
                  const map = new Map(prev);
                  map.set(it.snapshot.orderId, next);
                  return map;
                });
                router.refresh();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Diff banner ----------------------------------------------

function DiffBanner({
  slipId,
  diff,
  onAcknowledged,
}: {
  slipId: string;
  diff: CakeSlipDiff;
  onAcknowledged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const onAck = () =>
    startTransition(async () => {
      const res = await acknowledgeSlipDiff(slipId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onAcknowledged();
    });
  const totalChanges =
    diff.added.length + diff.removed.length + diff.modified.length;
  return (
    <div className="rounded-2xl border-2 border-foreground bg-pop-pink/30 p-3 sm:p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={20}
          strokeWidth={2.5}
          className="text-foreground shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground">
            Slip diperbarui admin · {totalChanges} perubahan
          </div>
          <div className="text-[11px] text-muted-foreground">
            Versi sebelumnya berbeda dengan slip yang ada di sini sekarang.
            Cek perubahan di bawah sebelum lanjut produksi.
          </div>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        {diff.added.length > 0 && (
          <div>
            <div className="font-semibold text-foreground flex items-center gap-1 mb-0.5">
              <Plus size={12} strokeWidth={2.5} />
              Ditambahkan ({diff.added.length})
            </div>
            <ul className="space-y-0.5 pl-4">
              {diff.added.map((a) => (
                <li key={a.orderId} className="text-foreground">
                  • {a.customerName}
                </li>
              ))}
            </ul>
          </div>
        )}
        {diff.modified.length > 0 && (
          <div>
            <div className="font-semibold text-foreground flex items-center gap-1 mb-0.5">
              <Pencil size={12} strokeWidth={2.5} />
              Diubah ({diff.modified.length})
            </div>
            <ul className="space-y-1 pl-4">
              {diff.modified.map((m) => (
                <li key={m.orderId} className="text-foreground">
                  • <span className="font-medium">{m.customerName}</span>
                  <ul className="pl-3 mt-0.5 space-y-0">
                    {m.fields.map((f, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">
                        {f.label}:{" "}
                        <span className="line-through">{f.before ?? "—"}</span>{" "}
                        →{" "}
                        <span className="text-foreground font-medium">
                          {f.after ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
        {diff.removed.length > 0 && (
          <div>
            <div className="font-semibold text-foreground flex items-center gap-1 mb-0.5">
              <Minus size={12} strokeWidth={2.5} />
              Dihapus ({diff.removed.length})
            </div>
            <ul className="space-y-0.5 pl-4">
              {diff.removed.map((r) => (
                <li key={r.orderId} className="text-foreground">
                  • {r.customerName}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onAck}
        disabled={pending}
        className="w-full rounded-xl bg-foreground text-background border-2 border-foreground px-3 py-2 text-sm font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
      >
        {pending ? "Menyimpan…" : "Saya sudah lihat"}
      </button>
    </div>
  );
}

// ---------- Per-cake card --------------------------------------------

function ProductionCard({
  snapshot,
  productionStatus,
  myProductionRole,
  adminLocked,
  onChange,
}: {
  snapshot: CakeSlipSnapshotItem;
  productionStatus: CakeProductionStatus;
  myProductionRole: "baker" | "decorator" | null;
  adminLocked: boolean;
  onChange: (next: CakeProductionStatus) => void;
}) {
  const [pending, startTransition] = useTransition();
  const setStatus = (next: CakeProductionStatus) => {
    startTransition(async () => {
      const res = await setOrderProductionStatus(snapshot.orderId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const labels: Record<CakeProductionStatus, string> = {
        pending: "Direset ke pending",
        in_progress: "Mulai diproduksi",
        decorating: "Mulai menghias",
        done: "Selesai diproduksi",
        cancelled: "Dibatalkan",
      };
      toast.success(labels[next]);
      onChange(next);
    });
  };

  const isDone = productionStatus === "done";

  return (
    <li
      className={`rounded-xl border-2 ${
        isDone ? "border-border bg-muted/30" : "border-foreground bg-card"
      } p-2.5 space-y-1.5 flex flex-col`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-foreground truncate">
              {snapshot.customerName}
            </span>
            <ProductionStatusPill status={productionStatus} />
          </div>
          {snapshot.customerPhone && (
            <div className="text-[10px] text-muted-foreground truncate">
              📱 {snapshot.customerPhone}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <Cake size={10} className="inline-block mr-1 -translate-y-px" />
            {snapshot.baseLabel} · {snapshot.shapeLabel}
            {snapshot.shapeCustom ? ` (${snapshot.shapeCustom})` : ""}
            {snapshot.dimensionCm != null ? (
              <span className="ml-1 rounded-full border border-foreground bg-card px-1 py-0 text-[10px] font-semibold tabular-nums text-foreground">
                {snapshot.dimensionCm} cm
              </span>
            ) : null}
            {snapshot.fillingLabel ? ` · ${snapshot.fillingLabel}` : ""}
          </div>
          <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0">
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={10} className="shrink-0" />
              {format(new Date(snapshot.scheduledAt), "EEE, d MMM · HH:mm", {
                locale: idLocale,
              })}
            </span>
            <span className="inline-flex items-center gap-1 truncate">
              <Truck size={10} className="shrink-0" />
              {snapshot.deliveryLabel}
            </span>
          </div>
        </div>
      </div>

      {(snapshot.colorNotes ||
        snapshot.textureNotes ||
        snapshot.decorationNotes ||
        snapshot.accessoriesNotes ||
        snapshot.greetingCard) && (
        <div className="text-[11px] text-foreground space-y-0">
          {snapshot.colorNotes && <Detail label="Warna">{snapshot.colorNotes}</Detail>}
          {snapshot.textureNotes && <Detail label="Tekstur">{snapshot.textureNotes}</Detail>}
          {snapshot.decorationNotes && <Detail label="Detail">{snapshot.decorationNotes}</Detail>}
          {snapshot.accessoriesNotes && <Detail label="Acc.">{snapshot.accessoriesNotes}</Detail>}
          {snapshot.greetingCard && (
            <Detail label="Greeting Card">&ldquo;{snapshot.greetingCard}&rdquo;</Detail>
          )}
        </div>
      )}

      <SlipReferenceImages orderId={snapshot.orderId} />

      <div className="mt-auto pt-1">
        <ProductionAction
          status={productionStatus}
          pending={pending}
          myProductionRole={myProductionRole}
          adminLocked={adminLocked}
          onAdvance={setStatus}
        />
      </div>
    </li>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[60px_1fr] gap-1 text-[11px] leading-tight">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="break-words">{children}</span>
    </div>
  );
}

function ProductionStatusPill({ status }: { status: CakeProductionStatus }) {
  const map: Record<CakeProductionStatus, { label: string; cls: string }> = {
    pending: {
      label: "Pending",
      cls: "bg-muted text-muted-foreground border-border",
    },
    in_progress: {
      label: "Diproduksi",
      cls: "bg-tertiary text-foreground border-foreground",
    },
    decorating: {
      label: "Digambar",
      cls: "bg-pop-pink text-foreground border-foreground",
    },
    done: {
      label: "Selesai",
      cls: "bg-pop-emerald text-foreground border-foreground",
    },
    cancelled: {
      label: "Batal",
      cls: "bg-muted text-muted-foreground border-border",
    },
  };
  const m = map[status];
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-wide shrink-0 ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function ProductionAction({
  status,
  pending,
  myProductionRole,
  adminLocked,
  onAdvance,
}: {
  status: CakeProductionStatus;
  pending: boolean;
  myProductionRole: "baker" | "decorator" | null;
  adminLocked: boolean;
  onAdvance: (next: CakeProductionStatus) => void;
}) {
  // Admin lock: kalau admin sudah pindahkan card ke kanban
  // pengiriman/selesai atau arsipkan, semua tombol di sisi produksi
  // hilang — pekerjaan dianggap diserahkan.
  if (adminLocked) {
    return (
      <p className="text-center text-[11px] italic text-muted-foreground">
        Sudah ditangani admin
      </p>
    );
  }
  // Role gate: hanya role yang melakukan forward yang boleh meng-undo
  // langkahnya. Mencegah baker membatalkan pekerjaan decorator dan
  // sebaliknya.
  const canBake = myProductionRole === null || myProductionRole === "baker";
  const canDecorate =
    myProductionRole === null || myProductionRole === "decorator";

  if (status === "pending") {
    if (!canBake) {
      return (
        <p className="text-center text-[11px] italic text-muted-foreground">
          Menunggu baker memulai produksi
        </p>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onAdvance("in_progress")}
        disabled={pending}
        className="w-full flex items-center justify-center gap-1 rounded-lg bg-tertiary text-foreground border border-foreground px-3 py-2 text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
      >
        Mulai produksi
        <ChevronRight size={12} strokeWidth={2.5} />
      </button>
    );
  }

  if (status === "in_progress") {
    return (
      <div className="flex items-center gap-1.5">
        {canDecorate ? (
          <button
            type="button"
            onClick={() => onAdvance("decorating")}
            disabled={pending}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-pop-pink text-foreground border border-foreground px-3 py-2 text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
          >
            Mulai gambar
            <ChevronRight size={12} strokeWidth={2.5} />
          </button>
        ) : (
          <p className="flex-1 text-center text-[11px] italic text-muted-foreground">
            Menunggu decorator menghias
          </p>
        )}
        {canBake ? (
          <button
            type="button"
            onClick={() => onAdvance("pending")}
            disabled={pending}
            className="size-9 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-50 shrink-0"
            aria-label="Reset ke pending"
          >
            <Undo2 size={14} strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    );
  }

  if (status === "decorating") {
    return (
      <div className="flex items-center gap-1.5">
        {canDecorate ? (
          <button
            type="button"
            onClick={() => onAdvance("done")}
            disabled={pending}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-pop-emerald text-foreground border border-foreground px-3 py-2 text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
          >
            <CheckCircle2 size={12} strokeWidth={2.5} />
            Tandai selesai
          </button>
        ) : (
          <p className="flex-1 text-center text-[11px] italic text-muted-foreground">
            Sedang dihias
          </p>
        )}
        {canDecorate ? (
          <button
            type="button"
            onClick={() => onAdvance("in_progress")}
            disabled={pending}
            className="size-9 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-50 shrink-0"
            aria-label="Kembali ke produksi"
          >
            <Undo2 size={14} strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-pop-emerald">
          <CheckCircle2 size={11} strokeWidth={2.5} />
          Sudah selesai
        </span>
        {canDecorate ? (
          <button
            type="button"
            onClick={() => onAdvance("decorating")}
            disabled={pending}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-50"
          >
            <Undo2 size={9} strokeWidth={2.5} />
            Buka kembali
          </button>
        ) : null}
      </div>
    );
  }
  return null;
}

// ---------- Reference photos (lazy-loaded per card) ------------------

/**
 * Foto referensi yang di-attach customer/admin per kategori. Dikelompok-
 * kan supaya tim produksi jelas: foto ini untuk WARNA, ini untuk
 * TULISAN/DEKORASI, dll. Tap thumbnail → ImagePopup zoomable.
 */
type RefField = "color" | "texture" | "decoration" | "accessories";
const REF_FIELD_LABELS: Array<{ key: RefField; emoji: string; label: string }> = [
  { key: "color", emoji: "🎨", label: "Warna" },
  { key: "texture", emoji: "✨", label: "Tekstur" },
  { key: "decoration", emoji: "✍️", label: "Tulisan / Dekorasi" },
  { key: "accessories", emoji: "🎁", label: "Aksesoris" },
];

function SlipReferenceImages({ orderId }: { orderId: string }) {
  const [images, setImages] = useState<
    Array<{ id: string; url: string; field: RefField }>
  >([]);
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("cake_order_attachments" as never)
        .select("id, storage_path, field")
        .eq("cake_order_id", orderId)
        .neq("field", "payment_proof");
      type Row = { id: string; storage_path: string; field: string };
      const rows = (data ?? []) as unknown as Row[];
      const signed = await Promise.all(
        rows.map(async (r) => {
          const sig = await getCakeAttachmentSignedUrl(r.id);
          return sig.ok
            ? {
                id: r.id,
                url: sig.data!.url,
                field: r.field as RefField,
              }
            : null;
        })
      );
      if (cancelled) return;
      setImages(
        signed.filter(
          (s): s is { id: string; url: string; field: RefField } => !!s
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (images.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <ImageIcon size={10} />
        Foto Referensi
      </div>
      <div className="space-y-1">
        {REF_FIELD_LABELS.map(({ key, emoji, label }) => {
          const group = images.filter((im) => im.field === key);
          if (group.length === 0) return null;
          return (
            <div
              key={key}
              className="flex items-start gap-1.5 rounded-md border border-border bg-muted/30 px-1.5 py-1"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground whitespace-nowrap pt-1">
                {emoji} {label}
              </span>
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                {group.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setOpenUrl(img.url)}
                    className="block size-10 rounded-md overflow-hidden border border-foreground bg-muted hover:opacity-90 active:scale-95 transition-transform"
                    aria-label={`Lihat foto ${label}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {openUrl && (
        <ImagePopup url={openUrl} onClose={() => setOpenUrl(null)} />
      )}
    </div>
  );
}

// ---------- Baking summary (rekap baking) ----------------------------

/**
 * Rekap baking yang dilihat tim produksi sebelum eksekusi: agregasi
 * jumlah cake per kombinasi base + bentuk (tanpa filling). Filling
 * berurusan dengan customer per customer; baking dijalankan dalam
 * batch berdasarkan base & shape saja.
 *
 * Kalau ada `pending_diff`, group yang ber-overlap dengan order
 * added/modified-base/modified-shape mendapat badge "Berubah"
 * supaya tim produksi tahu rekap ini sudah ter-update. Removed
 * orders tidak terkait group spesifik (karena tidak ada lagi di
 * snapshot), jadi cuma di-show sebagai notice section-level.
 */
function BakingSummary({
  items,
  diff,
}: {
  items: ProductionItem[];
  diff: import("@/lib/cake-orders/types").CakeSlipDiff | null;
}) {
  interface BakingGroup {
    key: string;
    baseLabel: string;
    shapeLabel: string;
    shapeCustom: string | null;
    dimensionCm: number | null;
    qty: number;
    orderIds: string[];
  }

  // Build set of orderIds yang punya perubahan baking-relevant
  // (added atau modified base/shape).
  const bakingChangedIds = new Set<string>();
  if (diff) {
    for (const a of diff.added) bakingChangedIds.add(a.orderId);
    for (const m of diff.modified) {
      const hasBakingField = m.fields.some(
        (f) =>
          f.label === "Base" ||
          f.label === "Bentuk" ||
          f.label === "Bentuk custom" ||
          f.label === "Diameter"
      );
      if (hasBakingField) bakingChangedIds.add(m.orderId);
    }
  }
  const removedCount = diff?.removed.length ?? 0;

  // Group by base + shape + diameter (+ shapeCustom). Ukuran yang
  // berbeda butuh loyang berbeda → baking batch terpisah.
  const groups = new Map<string, BakingGroup>();
  for (const it of items) {
    const s = it.snapshot;
    const dim = s.dimensionCm ?? null;
    const key = `${s.baseLabel}|${s.shapeLabel}|${s.shapeCustom ?? ""}|${dim ?? "?"}`;
    const g = groups.get(key) ?? {
      key,
      baseLabel: s.baseLabel,
      shapeLabel: s.shapeLabel,
      shapeCustom: s.shapeCustom,
      dimensionCm: dim,
      qty: 0,
      orderIds: [],
    };
    g.qty += 1;
    g.orderIds.push(s.orderId);
    groups.set(key, g);
  }

  // Sort: ukuran terisi duluan (NULL ke bawah), lalu qty desc.
  const sortedGroups = [...groups.values()].sort((a, b) => {
    const aHas = a.dimensionCm != null ? 0 : 1;
    const bHas = b.dimensionCm != null ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return b.qty - a.qty;
  });
  if (sortedGroups.length === 0) return null;

  const totalCakes = items.length;

  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <span aria-hidden>🥖</span>
          Rekap baking
        </h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {totalCakes} cake · {sortedGroups.length} jenis baking
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Group base + bentuk untuk dipanggang dalam satu batch. Filling
        di-handle per customer di kartu bawah.
      </p>
      <ul className="space-y-1">
        {sortedGroups.map((g) => {
          const changed = g.orderIds.some((id) => bakingChangedIds.has(id));
          return (
            <li
              key={g.key}
              className={
                "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 " +
                (changed
                  ? "border-pop-pink bg-pop-pink/15"
                  : "border-border bg-muted/30")
              }
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                  <span>
                    {g.baseLabel} · {g.shapeLabel}
                    {g.shapeCustom ? ` (${g.shapeCustom})` : ""}
                  </span>
                  {g.dimensionCm != null ? (
                    <span className="rounded-full border border-foreground bg-card px-1.5 py-0 text-[10px] font-semibold tabular-nums shrink-0">
                      {g.dimensionCm} cm
                    </span>
                  ) : (
                    <span
                      className="rounded-full border border-dashed border-foreground/40 bg-card px-1.5 py-0 text-[10px] font-medium text-muted-foreground shrink-0"
                      title="Diameter tidak diisi"
                    >
                      ukuran ?
                    </span>
                  )}
                </p>
              </div>
              {changed && (
                <span className="rounded-full border border-foreground bg-pop-pink/30 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide shrink-0">
                  Berubah
                </span>
              )}
              <span className="text-base font-bold tabular-nums shrink-0">
                {g.qty}×
              </span>
            </li>
          );
        })}
      </ul>
      {removedCount > 0 && (
        <p className="rounded-lg border border-foreground bg-pop-pink/30 px-2 py-1 text-[11px] font-medium text-foreground">
          ⚠️ {removedCount} cake dihapus dari slip ini — rekap sudah
          dikurangi sesuai.
        </p>
      )}
    </div>
  );
}
