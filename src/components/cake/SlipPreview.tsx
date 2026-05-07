"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowLeft,
  Cake,
  CalendarClock,
  Truck,
  CheckCircle2,
  Send,
  Edit3,
  StickyNote,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  setSlipItems,
  setSlipNotes,
  verifySlip,
  sendSlip,
  type SlipBundle,
} from "@/lib/actions/cake-slips.actions";
import { isSlipEditable, makeLabelFor } from "@/lib/cake-orders/helpers";
import { SlipStatusBadge } from "@/components/cake/SlipStatusBadge";
import { NewCakeOrderForm } from "@/components/cake/NewCakeOrderForm";
import type {
  CakeOrder,
  CakeOptionsByKind,
} from "@/lib/cake-orders/types";

interface Props {
  targetDate: string;
  bundle: SlipBundle;
  optionsByKind: CakeOptionsByKind | null;
}

interface SlipOrderCardProps {
  order: CakeOrder;
  included: boolean;
  editable: boolean;
  editing: boolean;
  spanFull?: boolean;
  optionsByKind: CakeOptionsByKind | null;
  labelFor: (kind: keyof CakeOptionsByKind, id: string | null) => string;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onSaved: () => void;
}

/**
 * Admin's night-before slip workflow:
 *   1. Tick which orders are on the slip
 *   2. Inline-edit any order's spec details (writes back to cake_orders)
 *   3. Add a slip-level note
 *   4. Verify, then Send → production team can read it via RLS
 */
export function SlipPreview({ targetDate, bundle, optionsByKind }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { slip, items, candidateOrders } = bundle;

  const [notes, setNotes] = useState(slip.notes ?? "");
  const [includedIds, setIncludedIds] = useState<Set<string>>(
    () => new Set(items.map((i) => i.order.id))
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const allOrders = useMemo(() => {
    const map = new Map<string, CakeOrder>();
    for (const { order } of items) map.set(order.id, order);
    for (const o of candidateOrders) map.set(o.id, o);
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() -
        new Date(b.scheduled_at).getTime()
    );
  }, [items, candidateOrders]);

  const labelFor = makeLabelFor(optionsByKind);
  const isEditable = isSlipEditable(slip.status);

  const toggleIncluded = (orderId: string, on: boolean) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  };

  const saveItems = () =>
    startTransition(async () => {
      const res = await setSlipItems(slip.id, [...includedIds]);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Daftar slip diperbarui");
      router.refresh();
    });

  const saveNotes = () =>
    startTransition(async () => {
      const res = await setSlipNotes(slip.id, notes);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Catatan disimpan");
      router.refresh();
    });

  const onVerify = () =>
    startTransition(async () => {
      const res = await verifySlip(slip.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Slip diverifikasi");
      router.refresh();
    });

  const onSend = () =>
    startTransition(async () => {
      const res = await sendSlip(slip.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Slip dikirim ke tim produksi");
      router.refresh();
    });

  const includedCount = includedIds.size;
  const dirty =
    includedIds.size !== items.length ||
    items.some((i) => !includedIds.has(i.order.id));

  const stickyAction =
    isEditable && (slip.status === "draft" || slip.status === "verified");

  return (
    <div className={`space-y-3 animate-fade-up ${stickyAction ? "pb-24" : ""}`}>
      <div className="flex items-center gap-2">
        <Link
          href="/cake-orders/slip"
          className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
            Slip{" "}
            {format(
              new Date(`${targetDate}T00:00:00`),
              "EEEE, d MMM yyyy",
              { locale: idLocale }
            )}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {includedCount} dari {allOrders.length} order pada slip
          </p>
        </div>
        <SlipStatusBadge status={slip.status} />
      </div>

      {/* Single-line notes input collapsed inside one card; save chip
          shows up only when dirty. */}
      <div className="rounded-xl border border-border bg-card p-2.5 flex items-start gap-2">
        <StickyNote
          size={14}
          className="text-muted-foreground shrink-0 mt-1.5"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={1}
          disabled={!isEditable}
          placeholder='Catatan untuk produksi (opsional) — "ada 3 wedding cake, prioritas dulu"'
          className="flex-1 min-w-0 rounded-md bg-transparent px-1 py-1 text-xs focus:outline-none focus:bg-muted/30 disabled:opacity-60 resize-none"
        />
        {isEditable && notes !== (slip.notes ?? "") && (
          <button
            type="button"
            onClick={saveNotes}
            disabled={pending}
            className="shrink-0 rounded-md bg-foreground text-background px-2 py-1 text-[11px] font-medium disabled:opacity-50"
          >
            Simpan
          </button>
        )}
      </div>

      {allOrders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-muted-foreground text-sm">
          Tidak ada order terjadwal untuk hari ini.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cake terjadwal
            </span>
            {isEditable && dirty && (
              <button
                type="button"
                onClick={saveItems}
                disabled={pending}
                className="rounded-md bg-primary text-primary-foreground border border-foreground px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
              >
                Simpan daftar
              </button>
            )}
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {allOrders.map((order) => {
              const isEditingThis = editingId === order.id;
              return (
                <SlipOrderCard
                  key={order.id}
                  order={order}
                  included={includedIds.has(order.id)}
                  editable={isEditable}
                  editing={isEditingThis}
                  // Full form takes more room than a single row —
                  // span the full grid width when open.
                  spanFull={isEditingThis}
                  optionsByKind={optionsByKind}
                  labelFor={labelFor}
                  onToggle={(on) => toggleIncluded(order.id, on)}
                  onEdit={() =>
                    setEditingId(editingId === order.id ? null : order.id)
                  }
                  onSaved={() => {
                    setEditingId(null);
                    router.refresh();
                  }}
                />
              );
            })}
          </ul>
        </>
      )}

      {!isEditable && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          Slip sudah dikirim. Detail order tetap bisa diedit lewat halaman
          pesanan; tim produksi otomatis melihat update via realtime.
        </div>
      )}

      {/* Sticky verify/send footer — single primary action visible
          based on slip status. Stays accessible while admin scrolls
          through 10+ cards. */}
      {stickyAction && (
        <div
          className="fixed left-0 right-0 z-30 bg-card border-t-2 border-foreground px-3 py-2"
          style={{
            bottom: 0,
            paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="max-w-[1700px] mx-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
              {slip.status === "draft"
                ? "Review daftar dulu, lalu verifikasi sebelum dikirim ke produksi."
                : "Slip sudah diverifikasi — kirim ke tim produksi untuk mulai."}
            </span>
            {slip.status === "draft" && (
              <button
                type="button"
                onClick={onVerify}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-xl bg-tertiary text-foreground border-2 border-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
              >
                <CheckCircle2 size={14} strokeWidth={2.5} />
                Verifikasi
              </button>
            )}
            {slip.status === "verified" && (
              <button
                type="button"
                onClick={onSend}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-xl bg-pop-emerald text-foreground border-2 border-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
              >
                <Send size={14} strokeWidth={2.5} />
                Kirim ke produksi
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SlipOrderCard({
  order,
  included,
  editable,
  editing,
  spanFull,
  optionsByKind,
  labelFor,
  onToggle,
  onEdit,
  onSaved,
}: SlipOrderCardProps) {
  return (
    <li
      className={`rounded-lg border ${
        included
          ? "border-foreground bg-card"
          : "border-dashed border-border bg-muted/20 opacity-70"
      } p-2 transition-colors ${
        spanFull ? "md:col-span-2 xl:col-span-3" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={included}
          disabled={!editable}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-3.5 shrink-0"
          aria-label={included ? "Hapus dari slip" : "Tambah ke slip"}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-[13px] text-foreground truncate">
              {order.customer_name}
            </span>
            {order.customer_phone && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                📱 {order.customer_phone}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums ml-auto">
              {format(new Date(order.scheduled_at), "HH:mm", {
                locale: idLocale,
              })}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            <Cake
              size={9}
              className="inline-block mr-1 -translate-y-px"
            />
            {labelFor("base_cake", order.base_cake_option_id)} ·{" "}
            {labelFor("shape", order.shape_option_id)}
            {order.shape_custom ? ` (${order.shape_custom})` : ""}
            {order.filling_option_id
              ? ` · ${labelFor("filling", order.filling_option_id)}`
              : ""}
            <span className="mx-1.5">·</span>
            <Truck
              size={9}
              className="inline-block mr-1 -translate-y-px"
            />
            {labelFor("delivery", order.delivery_option_id)}
          </div>
        </div>
        {editable && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-foreground bg-card px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted flex items-center gap-0.5 shrink-0"
            aria-label={editing ? "Tutup editor" : "Edit detail"}
          >
            {editing ? (
              <X size={10} strokeWidth={2.5} />
            ) : (
              <Edit3 size={10} strokeWidth={2.5} />
            )}
            {editing ? "Tutup" : "Edit"}
          </button>
        )}
      </div>

      {editing && optionsByKind && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
          {/* Full create-form in edit mode — same layout & validation
              as /cake-orders/new so admin sees every field, not just
              the freeform notes. Closes panel + refreshes on save. */}
          <NewCakeOrderForm
            optionsByKind={optionsByKind}
            editing={order}
            onSuccess={onSaved}
            onCancel={onEdit}
          />
        </div>
      )}
    </li>
  );
}


