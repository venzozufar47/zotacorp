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
  RotateCcw,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  reopenSlip,
  setSlipItems,
  setSlipNotes,
  verifyAndSendSlip,
  type TomorrowSlipBundle,
} from "@/lib/actions/cake-slips.actions";
import { makeLabelFor } from "@/lib/cake-orders/helpers";
import { SlipStatusBadge } from "@/components/cake/SlipStatusBadge";
import { NewCakeOrderForm } from "@/components/cake/NewCakeOrderForm";
import type { CakeOrder, CakeOptionsByKind } from "@/lib/cake-orders/types";

interface Props {
  bundle: TomorrowSlipBundle;
  optionsByKind: CakeOptionsByKind | null;
}

/**
 * Admin's tomorrow-only slip page:
 *   1. Auto section: tomorrow's orders (D+1) auto-included on draft/reopen
 *   2. Optional section: D+2..D+5 candidates admin may tick in
 *   3. Far-future section: D+6..D+30, read-only, hidden by default
 *   4. Inline edit any order via the full NewCakeOrderForm
 *   5. One-shot Verifikasi & kirim
 *   6. Reopen for further edits — production keeps reading the
 *      previous snapshot until next send.
 */
export function SlipPreview({ bundle, optionsByKind }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    slip,
    targetDate,
    items,
    optionalCandidates,
    farFutureCandidates,
  } = bundle;

  const [notes, setNotes] = useState(slip.notes ?? "");
  const [includedIds, setIncludedIds] = useState<Set<string>>(
    () => new Set(items.map((i) => i.order.id))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFarFuture, setShowFarFuture] = useState(false);
  const [showOptional, setShowOptional] = useState(true);

  const labelFor = makeLabelFor(optionsByKind);
  const isEditable = slip.status === "draft" || slip.status === "reopened";
  const isResend = slip.status === "reopened" || slip.sent_count > 0;

  // Combined order map for inline-edit lookups.
  const orderById = useMemo(() => {
    const m = new Map<string, CakeOrder>();
    for (const { order } of items) m.set(order.id, order);
    for (const g of optionalCandidates) for (const o of g.orders) m.set(o.id, o);
    return m;
  }, [items, optionalCandidates]);

  const dirty =
    includedIds.size !== items.length ||
    items.some((i) => !includedIds.has(i.order.id));

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

  const onVerifyAndSend = () =>
    startTransition(async () => {
      // Persist any pending tick changes before sending so the
      // snapshot reflects what's on screen.
      if (dirty) {
        const r = await setSlipItems(slip.id, [...includedIds]);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      if (notes !== (slip.notes ?? "")) {
        const r = await setSlipNotes(slip.id, notes);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      const res = await verifyAndSendSlip(slip.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data?.wasResend && res.data.hasDiff) {
        toast.success("Slip dikirim ulang. Banner perubahan dikirim ke produksi.");
      } else if (res.data?.wasResend) {
        toast.success("Slip dikirim ulang (tanpa perubahan).");
      } else {
        toast.success("Slip dikirim ke tim produksi");
      }
      router.refresh();
    });

  const onReopen = () =>
    startTransition(async () => {
      const res = await reopenSlip(slip.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Slip dibuka kembali — boleh diedit");
      router.refresh();
    });

  return (
    <div className="space-y-3 animate-fade-up pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/cake-orders"
          className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
            Slip besok ·{" "}
            {format(
              new Date(`${targetDate}T00:00:00`),
              "EEEE, d MMM yyyy",
              { locale: idLocale }
            )}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {includedIds.size} cake siap dikirim ke produksi
            {slip.sent_count > 0 && (
              <span className="ml-1.5">
                · sudah dikirim {slip.sent_count}×
              </span>
            )}
          </p>
        </div>
        <SlipStatusBadge status={slip.status} />
      </div>

      {/* Slip note */}
      <div className="rounded-xl border border-border bg-card p-2.5 flex items-start gap-2">
        <StickyNote size={14} className="text-muted-foreground shrink-0 mt-1.5" />
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

      {/* AUTO section: tomorrow's orders */}
      <Section
        emoji="🍰"
        label={`Otomatis · besok (${items.length} cake)`}
        action={
          isEditable && dirty ? (
            <button
              type="button"
              onClick={saveItems}
              disabled={pending}
              className="rounded-md bg-primary text-primary-foreground border border-foreground px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
            >
              Simpan daftar
            </button>
          ) : null
        }
      >
        {items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            Belum ada order untuk besok.
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {items.map(({ order }) => {
              const isEditingThis = editingId === order.id;
              return (
                <SlipOrderCard
                  key={order.id}
                  order={order}
                  included={includedIds.has(order.id)}
                  editable={isEditable}
                  editing={isEditingThis}
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
        )}
      </Section>

      {/* OPTIONAL: D+2..D+5 */}
      {optionalCandidates.length > 0 && (
        <Section
          emoji="📅"
          label="Opsional · 2–5 hari ke depan"
          collapsible
          collapsed={!showOptional}
          onToggle={() => setShowOptional((v) => !v)}
        >
          {showOptional && (
            <div className="space-y-2">
              {optionalCandidates.map((g) => (
                <div key={g.date} className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(new Date(`${g.date}T00:00:00`), "EEEE, d MMM", {
                      locale: idLocale,
                    })}
                  </div>
                  <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                    {g.orders.map((order) => {
                      const isEditingThis = editingId === order.id;
                      return (
                        <SlipOrderCard
                          key={order.id}
                          order={order}
                          included={includedIds.has(order.id)}
                          editable={isEditable}
                          editing={isEditingThis}
                          spanFull={isEditingThis}
                          optionsByKind={optionsByKind}
                          labelFor={labelFor}
                          onToggle={(on) => toggleIncluded(order.id, on)}
                          onEdit={() =>
                            setEditingId(
                              editingId === order.id ? null : order.id
                            )
                          }
                          onSaved={() => {
                            setEditingId(null);
                            router.refresh();
                          }}
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* FAR FUTURE: read-only, default hidden */}
      {farFutureCandidates.length > 0 && (
        <Section
          emoji="🔭"
          label={`Order lebih jauh · ${farFutureCandidates.reduce(
            (s, g) => s + g.orders.length,
            0
          )} cake`}
          collapsible
          collapsed={!showFarFuture}
          onToggle={() => setShowFarFuture((v) => !v)}
        >
          {showFarFuture && (
            <div className="space-y-2">
              {farFutureCandidates.map((g) => (
                <div key={g.date} className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(new Date(`${g.date}T00:00:00`), "EEE, d MMM yyyy", {
                      locale: idLocale,
                    })}
                  </div>
                  <ul className="space-y-1">
                    {g.orders.map((o) => (
                      <li
                        key={o.id}
                        className="text-[11px] text-muted-foreground rounded-md border border-dashed border-border bg-muted/20 px-2 py-1 truncate"
                      >
                        <Cake size={10} className="inline-block mr-1 -translate-y-px" />
                        {o.customer_name} · {labelFor("base_cake", o.base_cake_option_id)} ·{" "}
                        {labelFor("shape", o.shape_option_id)} ·{" "}
                        {format(new Date(o.scheduled_at), "HH:mm")}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {!isEditable && slip.last_sent_snapshot && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          Slip sudah dikirim ke produksi
          {slip.sent_at && (
            <>
              {" "}({format(new Date(slip.sent_at), "EEE, d MMM · HH:mm", {
                locale: idLocale,
              })})
            </>
          )}
          . Untuk mengubah daftar atau spesifikasi, klik &quot;Buka kembali&quot;.
        </div>
      )}

      {slip.status === "reopened" && slip.sent_count > 0 && (
        <div className="rounded-xl border-2 border-pop-pink bg-pop-pink/15 p-2.5 text-[11px] text-foreground">
          ⚠️ Slip dibuka kembali. Tim produksi masih melihat versi
          sebelumnya — klik &quot;Verifikasi & kirim ulang&quot; agar perubahan
          terkirim.
        </div>
      )}

      {/* Sticky footer: combined verify+send OR reopen */}
      <div
        className="fixed left-0 right-0 z-30 bg-card border-t-2 border-foreground px-3 py-2"
        style={{
          bottom: 0,
          paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="max-w-[1700px] mx-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
            {isEditable
              ? isResend
                ? "Review perubahan, lalu kirim ulang ke produksi."
                : "Review daftar, lalu kirim ke produksi."
              : "Slip sudah dikirim — buka kembali kalau ada perubahan."}
          </span>
          {isEditable ? (
            <button
              type="button"
              onClick={onVerifyAndSend}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-xl bg-pop-emerald text-foreground border-2 border-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
            >
              {isResend ? (
                <Send size={14} strokeWidth={2.5} />
              ) : (
                <CheckCircle2 size={14} strokeWidth={2.5} />
              )}
              {isResend ? "Verifikasi & kirim ulang" : "Verifikasi & kirim ke produksi"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onReopen}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-xl bg-card border-2 border-foreground px-4 py-2 text-sm font-semibold hover:bg-muted active:scale-95 transition-transform disabled:opacity-50"
            >
              <RotateCcw size={14} strokeWidth={2.5} />
              Buka kembali
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Layout primitives ----------------------------------------

function Section({
  emoji,
  label,
  action,
  collapsible,
  collapsed,
  onToggle,
  children,
}: {
  emoji: string;
  label: string;
  action?: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!collapsible}
          onClick={onToggle}
          className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${
            collapsible ? "hover:text-foreground" : "cursor-default"
          }`}
        >
          <span aria-hidden>{emoji}</span>
          <span>{label}</span>
          {collapsible &&
            (collapsed ? (
              <ChevronDown size={12} strokeWidth={2.5} />
            ) : (
              <ChevronUp size={12} strokeWidth={2.5} />
            ))}
        </button>
        {action}
      </div>
      {children}
    </section>
  );
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
      } p-2 transition-colors ${spanFull ? "md:col-span-2 xl:col-span-3" : ""}`}
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
              <CalendarClock size={10} className="inline-block mr-0.5 -translate-y-px" />
              {format(new Date(order.scheduled_at), "HH:mm", { locale: idLocale })}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            <Cake size={9} className="inline-block mr-1 -translate-y-px" />
            {labelFor("base_cake", order.base_cake_option_id)} ·{" "}
            {labelFor("shape", order.shape_option_id)}
            {order.shape_custom ? ` (${order.shape_custom})` : ""}
            {order.filling_option_id
              ? ` · ${labelFor("filling", order.filling_option_id)}`
              : ""}
            <span className="mx-1.5">·</span>
            <Truck size={9} className="inline-block mr-1 -translate-y-px" />
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
            {editing ? <X size={10} strokeWidth={2.5} /> : <Edit3 size={10} strokeWidth={2.5} />}
            {editing ? "Tutup" : "Edit"}
          </button>
        )}
      </div>

      {editing && optionsByKind && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
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
