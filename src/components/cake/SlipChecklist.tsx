"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { toast } from "sonner";
import { setOrderProductionStatus } from "@/lib/actions/cake-orders.actions";
import { getCakeAttachmentSignedUrl } from "@/lib/actions/cake-orders.actions";
import { createClient } from "@/lib/supabase/client";
import { makeLabelFor } from "@/lib/cake-orders/helpers";
import { ImagePopup } from "./ImagePopup";
import type {
  CakeOrder,
  CakeProductionSlip,
  CakeProductionSlipItem,
  CakeProductionStatus,
  CakeOptionsByKind,
} from "@/lib/cake-orders/types";

interface Props {
  slip: CakeProductionSlip;
  items: Array<{ item: CakeProductionSlipItem; order: CakeOrder }>;
  optionsByKind: CakeOptionsByKind | null;
}

/**
 * Production team's view of a slip. Each cake is a card with its full
 * spec (read-only — no pricing) and a status pill that cycles
 * pending → in_progress → done. Realtime: subscribes to cake_orders
 * row updates so multiple production members see status changes live.
 */
export function SlipChecklist({ slip, items, optionsByKind }: Props) {
  const router = useRouter();
  const [orderMap, setOrderMap] = useState(() => {
    const m = new Map<string, CakeOrder>();
    for (const { order } of items) m.set(order.id, order);
    return m;
  });

  // Fetch all reference attachments for the slip in ONE call, then
  // sign every URL in parallel — beats per-card N+1 (was: 10–20 cakes
  // × 2 round-trips each).
  const orderIds = items.map((i) => i.order.id);
  const [imagesByOrder, setImagesByOrder] = useState<
    Record<string, Array<{ id: string; url: string }>>
  >({});
  useEffect(() => {
    if (orderIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("cake_order_attachments" as never)
        .select("id, cake_order_id, field, storage_path")
        .in("cake_order_id", orderIds)
        .neq("field", "payment_proof");
      if (cancelled) return;
      type Row = {
        id: string;
        cake_order_id: string;
        storage_path: string;
      };
      const rows = (data ?? []) as unknown as Row[];
      const signed = await Promise.all(
        rows.map(async (r) => {
          const sig = await getCakeAttachmentSignedUrl(r.id);
          return sig.ok
            ? { id: r.id, cake_order_id: r.cake_order_id, url: sig.data!.url }
            : null;
        })
      );
      if (cancelled) return;
      const map: Record<string, Array<{ id: string; url: string }>> = {};
      for (const s of signed) {
        if (!s) continue;
        (map[s.cake_order_id] ??= []).push({ id: s.id, url: s.url });
      }
      setImagesByOrder(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slip.id]);

  // Realtime: any update on cake_orders that's in our slip → patch.
  // Skip the setState when production_status hasn't changed to avoid
  // re-rendering every card on unrelated column updates.
  useEffect(() => {
    const supabase = createClient();
    if (orderIds.length === 0) return;
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
          const updated = payload.new as unknown as CakeOrder;
          setOrderMap((prev) => {
            const existing = prev.get(updated.id);
            if (
              existing &&
              existing.production_status === updated.production_status &&
              existing.production_started_at === updated.production_started_at &&
              existing.production_done_at === updated.production_done_at
            ) {
              return prev;
            }
            const next = new Map(prev);
            next.set(updated.id, updated);
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

  const labelFor = makeLabelFor(optionsByKind);

  const total = items.length;
  const done = items.filter(
    ({ order }) =>
      (orderMap.get(order.id)?.production_status ?? order.production_status) ===
      "done"
  ).length;

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center gap-2">
        <Link
          href="/cake-production"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight">
            Slip{" "}
            {format(
              new Date(`${slip.target_date}T00:00:00`),
              "EEEE, d MMM yyyy",
              { locale: idLocale }
            )}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {done} dari {total} cake selesai
          </p>
        </div>
      </div>

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
          {items.map(({ item, order }) => {
            const live = orderMap.get(order.id) ?? order;
            return (
              <ProductionCard
                key={order.id}
                order={live}
                slipNotes={item.override_notes ?? null}
                images={imagesByOrder[order.id] ?? []}
                labelFor={labelFor}
                onChange={() => router.refresh()}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProductionCard({
  order,
  slipNotes,
  images,
  labelFor,
  onChange,
}: {
  order: CakeOrder;
  slipNotes: string | null;
  images: Array<{ id: string; url: string }>;
  labelFor: (kind: keyof CakeOptionsByKind, id: string | null) => string;
  onChange: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const setStatus = (next: CakeProductionStatus) => {
    startTransition(async () => {
      const res = await setOrderProductionStatus(order.id, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const labels: Record<CakeProductionStatus, string> = {
        pending: "Direset ke pending",
        in_progress: "Mulai diproduksi",
        done: "Selesai diproduksi",
        cancelled: "Dibatalkan",
      };
      toast.success(labels[next]);
      onChange();
    });
  };

  const status = order.production_status;
  const isDone = status === "done";

  // Compact one-line meta: base · shape · filling · jam · delivery
  const metaBits = [
    `${labelFor("base_cake", order.base_cake_option_id)} · ${labelFor(
      "shape",
      order.shape_option_id
    )}${order.shape_custom ? ` (${order.shape_custom})` : ""}${
      order.filling_option_id
        ? ` · ${labelFor("filling", order.filling_option_id)}`
        : ""
    }`,
  ];

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
              {order.customer_name}
            </span>
            <ProductionStatusPill status={status} />
          </div>
          {order.customer_phone && (
            <div className="text-[10px] text-muted-foreground truncate">
              📱 {order.customer_phone}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <Cake
              size={10}
              className="inline-block mr-1 -translate-y-px"
            />
            {metaBits[0]}
          </div>
          <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0">
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={10} className="shrink-0" />
              {format(new Date(order.scheduled_at), "HH:mm", {
                locale: idLocale,
              })}
            </span>
            <span className="inline-flex items-center gap-1 truncate">
              <Truck size={10} className="shrink-0" />
              {labelFor("delivery", order.delivery_option_id)}
            </span>
          </div>
        </div>
      </div>

      {(order.color_notes ||
        order.texture_notes ||
        order.decoration_notes ||
        order.accessories_notes ||
        order.greeting_card) && (
        <div className="text-[11px] text-foreground space-y-0">
          {order.color_notes && (
            <Detail label="Warna">{order.color_notes}</Detail>
          )}
          {order.texture_notes && (
            <Detail label="Tekstur">{order.texture_notes}</Detail>
          )}
          {order.decoration_notes && (
            <Detail label="Detail">{order.decoration_notes}</Detail>
          )}
          {order.accessories_notes && (
            <Detail label="Acc.">{order.accessories_notes}</Detail>
          )}
          {order.greeting_card && (
            <Detail label="Greeting Card">&ldquo;{order.greeting_card}&rdquo;</Detail>
          )}
        </div>
      )}

      <SlipReferenceImages images={images} />

      {slipNotes && (
        <div className="rounded-md bg-tertiary/20 border border-foreground px-1.5 py-0.5 text-[10px] text-foreground">
          <strong>Catatan:</strong> {slipNotes}
        </div>
      )}

      <div className="mt-auto pt-1">
        <ProductionAction
          status={status}
          pending={pending}
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

/**
 * Single-button progression instead of a 3-state stepper. The current
 * status is communicated by the pill at the top of the card; the
 * action button shows ONLY the next legal step. Undo link covers the
 * "I clicked the wrong card" case.
 */
function ProductionAction({
  status,
  pending,
  onAdvance,
}: {
  status: CakeProductionStatus;
  pending: boolean;
  onAdvance: (next: CakeProductionStatus) => void;
}) {
  if (status === "pending") {
    return (
      <button
        type="button"
        onClick={() => onAdvance("in_progress")}
        disabled={pending}
        className="w-full flex items-center justify-center gap-1 rounded-lg bg-tertiary text-foreground border border-foreground px-2 py-1.5 text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
      >
        Mulai produksi
        <ChevronRight size={12} strokeWidth={2.5} />
      </button>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAdvance("done")}
          disabled={pending}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-pop-emerald text-foreground border border-foreground px-2 py-1.5 text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
        >
          <CheckCircle2 size={12} strokeWidth={2.5} />
          Tandai selesai
        </button>
        <button
          type="button"
          onClick={() => onAdvance("pending")}
          disabled={pending}
          className="size-7 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-50 shrink-0"
          aria-label="Reset ke pending"
        >
          <Undo2 size={11} strokeWidth={2.5} />
        </button>
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
        <button
          type="button"
          onClick={() => onAdvance("in_progress")}
          disabled={pending}
          className="flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-50"
        >
          <Undo2 size={9} strokeWidth={2.5} />
          Buka kembali
        </button>
      </div>
    );
  }
  return null;
}

function SlipReferenceImages({
  images,
}: {
  images: Array<{ id: string; url: string }>;
}) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  if (images.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <ImageIcon size={10} />
        Foto
      </div>
      <div className="flex flex-wrap gap-1">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpenUrl(img.url)}
            className="block size-10 rounded-md overflow-hidden border border-foreground bg-muted hover:opacity-90 active:scale-95 transition-transform"
            aria-label="Lihat foto"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {openUrl && (
        <ImagePopup url={openUrl} onClose={() => setOpenUrl(null)} />
      )}
    </div>
  );
}
