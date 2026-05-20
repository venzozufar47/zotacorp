"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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
  Lock,
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
import { BranchBadge } from "@/components/cake/BranchBadge";
import { SlipStatusBadge } from "@/components/cake/SlipStatusBadge";
import { NewCakeOrderForm } from "@/components/cake/NewCakeOrderForm";
import type {
  CakeBaseDiameterPrice,
  CakeBranch,
  CakeDiameterOption,
  CakeOrder,
  CakeOrderAttachment,
  CakeOptionsByKind,
} from "@/lib/cake-orders/types";
import {
  deleteCakeOrderAttachment,
  getCakeAttachmentSignedUrl,
} from "@/lib/actions/cake-orders.actions";
import { jakartaDateMinusDays } from "@/lib/utils/jakarta";
import { ImagePopup } from "@/components/cake/ImagePopup";

interface Props {
  bundle: TomorrowSlipBundle;
  optionsByKind: CakeOptionsByKind | null;
  diameters?: CakeDiameterOption[];
  prices?: CakeBaseDiameterPrice[];
  /** YYYY-MM-DD WIB. Untuk menentukan urgency banner + label
   *  "hari ini / besok / kemarin / 3 hari lagi". */
  todayYmd: string;
  /** Cabang aktif yang slip-nya sedang dipreview. */
  branch: CakeBranch;
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
export function SlipPreview({
  bundle,
  optionsByKind,
  diameters = [],
  prices = [],
  todayYmd,
  branch,
}: Props) {
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
  // Track ID yang DIKECUALIKAN secara eksplisit oleh admin (untick),
  // bukan yang termasuk. Daftar `included` di-derive dari prop `items`
  // minus excluded. Pola ini mencegah state lokal bocor antar slip
  // (root cause: pare orders dikirim ke semarang slip) dan memastikan
  // order yang BARU muncul (customer baru bikin order tomorrow setelah
  // admin buka halaman) otomatis ter-include — tidak akan hilang
  // setiap kali admin save/send.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(
    () => new Set()
  );
  const includedIds = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) {
      if (!excludedIds.has(i.order.id)) s.add(i.order.id);
    }
    return s;
  }, [items, excludedIds]);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Kedua section opsional & far-future default tertutup — section
  // "Otomatis (besok)" sudah cukup informasi utama, dropdown ini
  // di-expand on-demand kalau admin perlu tinjau kandidat.
  const [showFarFuture, setShowFarFuture] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

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
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (on) next.delete(orderId);
      else next.add(orderId);
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

  const dayDiff = ymdDaysBetween(todayYmd, targetDate);
  const { relativeLabel, banner } = describeDayDiff(dayDiff);
  const targetDateInput = targetDate;

  function gotoSlip(ymd: string, b: CakeBranch) {
    const params = new URLSearchParams();
    if (ymd) params.set("date", ymd);
    params.set("branch", b);
    router.push(`/cake-orders/slip?${params}`);
  }
  function gotoDate(ymd: string) {
    gotoSlip(ymd, branch);
  }
  function gotoBranch(b: CakeBranch) {
    gotoSlip(targetDate, b);
  }

  return (
    <div className="space-y-3 animate-fade-up pb-36 sm:pb-24">
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
            Slip {relativeLabel.toLowerCase()} ·{" "}
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

      {/* Banner urgency + date picker. Warna dirancang supaya admin
          tidak bisa keliru: hijau = hari ini, kuning = jauh, merah =
          lampau, default = besok (alur normal). Relative label BESAR
          di kanan supaya admin langsung sadar slip ini untuk kapan. */}
      <div
        className={`rounded-2xl border-2 p-3 sm:p-4 space-y-3 ${banner.cls}`}
        role="region"
        aria-label="Pilih tanggal slip"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-foreground">
              {banner.label}
            </p>
            <p className="text-xs sm:text-sm text-foreground/80 leading-snug">
              {banner.sub}
            </p>
          </div>
          {/* HERO badge — relative label di-bold besar supaya jadi
              fokus utama. Sebelumnya pill kecil mudah terlewat. */}
          <div className="shrink-0 rounded-2xl border-2 border-foreground bg-card px-4 py-2 text-center shadow-[0_2px_0_0_var(--foreground)]">
            <p className="text-[9px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
              Untuk
            </p>
            <p className="text-lg sm:text-xl font-bold text-foreground leading-tight tabular-nums">
              {relativeLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
            Cabang:
            <button
              type="button"
              onClick={() => gotoBranch("pare")}
              className={`rounded-full border-2 px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                branch === "pare"
                  ? "border-foreground bg-pop-emerald/40 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-foreground"
              }`}
            >
              Pare
            </button>
            <button
              type="button"
              onClick={() => gotoBranch("semarang")}
              className={`rounded-full border-2 px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                branch === "semarang"
                  ? "border-foreground bg-pop-pink/40 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-foreground"
              }`}
            >
              Semarang
            </button>
          </span>
          <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
            Tanggal:
            <input
              type="date"
              value={targetDateInput}
              onChange={(e) => {
                if (e.target.value) gotoDate(e.target.value);
              }}
              className="rounded-lg border border-foreground bg-card px-2 py-1 text-xs tabular-nums"
            />
          </label>
          <button
            type="button"
            onClick={() => gotoDate(jakartaDateMinusDays(todayYmd, -1))}
            className="rounded-full border border-foreground bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
          >
            Besok (default)
          </button>
          <button
            type="button"
            onClick={() => gotoDate(todayYmd)}
            className="rounded-full border border-foreground bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={() => gotoDate(jakartaDateMinusDays(todayYmd, 1))}
            className="rounded-full border border-foreground bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
          >
            Kemarin
          </button>
        </div>
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

      {/* Banner BIG & LOUD untuk state read-only — slip sudah dikirim
          ke produksi. Visual cue yang jelas: latar hijau emerald,
          checkmark besar, judul tebal uppercase, plus "diagonal stripe"
          overlay supaya admin langsung paham di first glance.
          Sengaja besar — friction-free reopen lebih penting daripada
          space-saving. */}
      {!isEditable && (
        <div
          className="relative overflow-hidden rounded-2xl border-2 border-foreground bg-pop-emerald/30 p-4 sm:p-5 shadow-[0_2px_0_0_var(--foreground)]"
          role="status"
          aria-live="polite"
        >
          {/* Diagonal stripe overlay — subtle "approved/sent" pattern. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, currentColor 0 8px, transparent 8px 22px)",
            }}
          />
          <div className="relative flex items-start gap-3 sm:gap-4">
            <div className="flex items-center justify-center size-12 sm:size-14 rounded-full bg-pop-emerald border-2 border-foreground shrink-0">
              <CheckCircle2 size={28} strokeWidth={2.5} className="text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] text-foreground/70">
                Status slip
              </p>
              <h2 className="text-lg sm:text-xl font-bold text-foreground leading-tight mt-0.5">
                ✓ Slip sudah dikirim ke produksi
              </h2>
              <p className="text-xs sm:text-sm text-foreground/80 mt-1 leading-snug">
                Tim produksi sedang membaca daftar ini. Kalau ada
                perubahan order, klik <strong>Buka kembali</strong>{" "}
                supaya admin bisa edit dan tim produksi dapat banner
                perbedaan.
              </p>
            </div>
          </div>
          <div className="relative mt-3 flex justify-end">
            <button
              type="button"
              onClick={onReopen}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-xl bg-card border-2 border-foreground px-4 py-2 text-sm font-semibold hover:bg-muted active:scale-95 transition-transform disabled:opacity-50 shrink-0"
            >
              <RotateCcw size={14} strokeWidth={2.5} />
              Buka kembali untuk edit
            </button>
          </div>
        </div>
      )}

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
          <ul className="grid grid-flow-row-dense grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {items.map(({ order, attachments }) => {
              const isEditingThis = editingId === order.id;
              return (
                <SlipOrderCard
                  key={order.id}
                  order={order}
                  attachments={attachments}
                  included={includedIds.has(order.id)}
                  editable={isEditable}
                  editing={isEditingThis}
                  spanFull={isEditingThis}
                  optionsByKind={optionsByKind}
                  diameters={diameters}
                  prices={prices}
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
              {/* Saat slip terkunci (sent/received/closed), checkbox
                  di kartu opsional secara otomatis disabled via prop
                  `editable`. Hint inline ini supaya admin tahu kenapa
                  tidak responsif dan langsung bisa Reopen dari sini —
                  tidak perlu scroll ke atas. */}
              {!isEditable && (
                <div className="rounded-xl border-2 border-dashed border-pop-pink/50 bg-pop-pink/10 px-3 py-2 text-xs text-foreground flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    Slip sudah dikirim — buka kembali dulu untuk
                    menambah order opsional ke slip.
                  </span>
                  <button
                    type="button"
                    onClick={onReopen}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-card border-2 border-foreground px-2.5 py-1 text-[11px] font-semibold hover:bg-muted disabled:opacity-50 shrink-0"
                  >
                    <RotateCcw size={11} strokeWidth={2.5} />
                    Buka kembali
                  </button>
                </div>
              )}
              {optionalCandidates.map((g) => (
                <div key={g.date} className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(new Date(`${g.date}T00:00:00`), "EEEE, d MMM", {
                      locale: idLocale,
                    })}
                  </div>
                  <ul className="grid grid-flow-row-dense grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
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
                          diameters={diameters}
                          prices={prices}
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
                        {labelFor("shape", o.shape_option_id)}
                        {o.dimension_cm != null ? ` ${o.dimension_cm}cm` : ""} ·{" "}
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

      {/* Sticky footer di-portal ke document.body supaya position:fixed
          tidak terikat ancestor `.animate-fade-up`. Saat admin sedang
          edit detail order customer (editingId set), footer Verifikasi
          diganti dengan "Simpan perubahan" yang submit form inline —
          supaya admin save dulu sebelum kembali ke verifikasi+kirim. */}
      {isEditable && editingId != null && (
        <SaveEditFooter
          formId={`cake-edit-${editingId}`}
          onCancel={() => setEditingId(null)}
        />
      )}
      {isEditable && editingId == null && (
        <VerifySendFooter
          pending={pending}
          isResend={isResend}
          onVerifyAndSend={onVerifyAndSend}
        />
      )}
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
  /** Reference photos (warna/tekstur/dekorasi/aksesoris).
   *  Untuk kandidat opsional/far-future yang belum di-fetch
   *  attachment-nya, pass `null` atau empty array — card tetap render
   *  tanpa strip foto. */
  attachments?: CakeOrderAttachment[] | null;
  included: boolean;
  editable: boolean;
  editing: boolean;
  spanFull?: boolean;
  optionsByKind: CakeOptionsByKind | null;
  diameters: CakeDiameterOption[];
  prices: CakeBaseDiameterPrice[];
  labelFor: (kind: keyof CakeOptionsByKind, id: string | null) => string;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onSaved: () => void;
}

function SlipOrderCard({
  order,
  attachments,
  included,
  editable,
  editing,
  spanFull,
  optionsByKind,
  diameters,
  prices,
  labelFor,
  onToggle,
  onEdit,
  onSaved,
}: SlipOrderCardProps) {
  // Mirror CakeOrderDetail's lock: once production is done or admin
  // already moved the card past the bake stage, the spec is frozen.
  const lockedFromEdit =
    order.production_status === "done" ||
    order.status === "ready" ||
    order.status === "delivering" ||
    order.status === "done" ||
    order.status === "cancelled";
  const canEditCard = editable && !lockedFromEdit;
  // Span full hanya kalau form edit benar-benar di-render. Tanpa
  // ini, card editing yang locked tetap memakan row penuh tapi tidak
  // expand isinya → admin lihat layout pecah (card lain pindah row
  // dengan slot kosong).
  const spanFullActive = spanFull && editing && canEditCard && !!optionsByKind;
  return (
    <li
      className={`rounded-lg border ${
        included
          ? "border-foreground bg-card"
          : "border-dashed border-border bg-muted/20 opacity-70"
      } p-2 transition-colors ${spanFullActive ? "md:col-span-2 xl:col-span-3" : ""}`}
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
        {lockedFromEdit && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-foreground bg-pop-emerald/30 px-1.5 py-0.5 text-[9px] font-medium text-foreground shrink-0"
            title="Sudah diproduksi — tidak bisa diedit"
          >
            <Lock size={9} strokeWidth={2.5} />
            Sudah diproduksi
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-[13px] text-foreground truncate">
              {order.customer_name}
            </span>
            {/* Cabang explicit di tiap kartu — admin double-check
                bahwa order ini benar berada di cabang slip yang
                sedang dibuat. Mencegah pengiriman silang antar
                cabang (lihat fix branch-state-leak di SlipPreview). */}
            <BranchBadge branch={order.branch} size="xs" />
            {order.customer_phone && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                📱 {order.customer_phone}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums ml-auto">
              <CalendarClock size={10} className="inline-block mr-0.5 -translate-y-px" />
              {format(new Date(order.scheduled_at), "EEE, d MMM · HH:mm", {
                locale: idLocale,
              })}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            <Cake size={9} className="inline-block mr-1 -translate-y-px" />
            {labelFor("base_cake", order.base_cake_option_id)} ·{" "}
            {labelFor("shape", order.shape_option_id)}
            {order.shape_custom ? ` (${order.shape_custom})` : ""}
            {order.dimension_cm != null ? (
              <span className="ml-1 rounded-full border border-foreground bg-card px-1 py-0 text-[10px] font-semibold tabular-nums text-foreground align-middle">
                {order.dimension_cm} cm
              </span>
            ) : null}
            {order.filling_option_id
              ? ` · ${labelFor("filling", order.filling_option_id)}`
              : ""}
            <span className="mx-1.5">·</span>
            <Truck size={9} className="inline-block mr-1 -translate-y-px" />
            {labelFor("delivery", order.delivery_option_id)}
          </div>
        </div>
        {canEditCard && (
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

      {/* Strip foto referensi — visible in card AND di edit form. */}
      {attachments && attachments.length > 0 && (
        <SlipCardReferencePhotos
          attachments={attachments}
          canDelete={canEditCard}
        />
      )}

      {editing && canEditCard && optionsByKind && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <NewCakeOrderForm
            optionsByKind={optionsByKind}
            diameters={diameters}
            prices={prices}
            editing={order}
            singleColumn
            onSuccess={onSaved}
            onCancel={onEdit}
            formId={`cake-edit-${order.id}`}
            hideInternalSave
          />
        </div>
      )}
    </li>
  );
}

/**
 * Footer "Verifikasi & kirim" yang harus selalu sticky di viewport
 * bottom. Di-portal ke document.body karena parent `.animate-fade-up`
 * menerapkan CSS transform yang membuat fixed-children jadi relatif
 * ke parent (browser spec containing-block rule).
 */
/**
 * Wrapper portal untuk sticky footer di SlipPreview. Sengaja di-portal
 * ke document.body karena ancestor `.animate-fade-up` apply transform
 * → containing block untuk `position: fixed` jadi ancestor itu (bukan
 * viewport). Portal melepas footer dari containing-block trap.
 */
function StickyPortalFooter({
  children,
  message,
}: {
  children: React.ReactNode;
  message: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-50 bg-card border-t-2 border-foreground px-3 py-2 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]"
      style={{
        paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="max-w-[1700px] mx-auto flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
          {message}
        </span>
        {children}
      </div>
    </div>,
    document.body
  );
}

function VerifySendFooter({
  pending,
  isResend,
  onVerifyAndSend,
}: {
  pending: boolean;
  isResend: boolean;
  onVerifyAndSend: () => void;
}) {
  return (
    <StickyPortalFooter
      message={
        isResend
          ? "Review perubahan, lalu kirim ulang ke produksi."
          : "Review daftar, lalu kirim ke produksi."
      }
    >
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
    </StickyPortalFooter>
  );
}

function SaveEditFooter({
  formId,
  onCancel,
}: {
  formId: string;
  onCancel: () => void;
}) {
  return (
    <StickyPortalFooter message="✏️ Sedang edit order — simpan dulu sebelum verifikasi & kirim ulang.">
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold hover:bg-muted shrink-0"
      >
        Batal
      </button>
      <button
        type="submit"
        form={formId}
        className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 active:scale-95 transition-transform shrink-0"
      >
        💾 Simpan perubahan
      </button>
    </StickyPortalFooter>
  );
}

/**
 * Foto referensi di slip card admin, dikelompokkan per kategori
 * (Warna / Tekstur / Tulisan-Dekorasi / Aksesoris) supaya admin tahu
 * peruntukan tiap foto. Mirror tampilan di production slip card.
 * Tap thumb → ImagePopup zoomable.
 */
type SlipRefField = "color" | "texture" | "decoration" | "accessories";
const SLIP_REF_LABELS: Array<{
  key: SlipRefField;
  emoji: string;
  label: string;
}> = [
  { key: "color", emoji: "🎨", label: "Warna" },
  { key: "texture", emoji: "✨", label: "Tekstur" },
  { key: "decoration", emoji: "✍️", label: "Tulisan / Dekorasi" },
  { key: "accessories", emoji: "🎁", label: "Aksesoris" },
];

function SlipCardReferencePhotos({
  attachments,
  canDelete,
}: {
  attachments: CakeOrderAttachment[];
  /** Saat true, popup foto dapat tombol Hapus. Slip status sudah
   *  draft/reopened (editable) → admin boleh hapus. Server tetap
   *  re-check via slip-frozen gate. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [openItem, setOpenItem] = useState<{
    url: string;
    attachmentId: string;
  } | null>(null);
  const filtered = attachments.filter((a) => a.field !== "payment_proof");
  if (filtered.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {SLIP_REF_LABELS.map(({ key, emoji, label }) => {
        const group = filtered.filter((a) => a.field === key);
        if (group.length === 0) return null;
        return (
          <div
            key={key}
            className="flex items-start gap-1.5 rounded-md border border-border bg-muted/30 px-1.5 py-1"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground whitespace-nowrap pt-0.5">
              {emoji} {label}
            </span>
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {group.map((a) => (
                <SlipThumb
                  key={a.id}
                  attachment={a}
                  onOpen={(url) =>
                    setOpenItem({ url, attachmentId: a.id })
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
      {openItem && (
        <ImagePopup
          url={openItem.url}
          onClose={() => setOpenItem(null)}
          onDelete={
            canDelete
              ? async () => {
                  const res = await deleteCakeOrderAttachment(
                    openItem.attachmentId
                  );
                  if (res.ok) router.refresh();
                  return res;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function SlipThumb({
  attachment,
  onOpen,
}: {
  attachment: CakeOrderAttachment;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getCakeAttachmentSignedUrl(attachment.id);
      if (!cancelled && res.ok) setUrl(res.data!.url);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);
  if (!url) {
    return (
      <span
        className="inline-block size-8 rounded-md border border-border bg-muted animate-pulse"
        aria-hidden
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="size-8 rounded-md overflow-hidden border border-foreground bg-muted hover:opacity-90 active:scale-95"
      aria-label="Lihat foto referensi"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="w-full h-full object-cover" />
    </button>
  );
}

/** Selisih hari (negatif = lampau, 0 = hari ini, 1 = besok) antara
 *  dua YYYY-MM-DD WIB. Pakai UTC math supaya server timezone tidak
 *  menggeser hasil. */
function ymdDaysBetween(fromYmd: string, toYmd: string): number {
  const toMs = (ymd: string) =>
    Date.UTC(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(5, 7)) - 1,
      Number(ymd.slice(8, 10))
    );
  return Math.round((toMs(toYmd) - toMs(fromYmd)) / 86_400_000);
}

interface BannerStyle {
  cls: string;
  label: string;
  sub: string;
}

function describeDayDiff(dayDiff: number): {
  relativeLabel: string;
  banner: BannerStyle;
} {
  if (dayDiff < 0) {
    return {
      relativeLabel:
        dayDiff === -1 ? "Kemarin" : `${Math.abs(dayDiff)} hari lalu`,
      banner: {
        cls: "bg-destructive/15 border-destructive/40",
        label: "Slip TANGGAL LAMPAU",
        sub: "Hati-hati — slip ini untuk hari yang sudah lewat. Pastikan kamu sengaja membuka arsip.",
      },
    };
  }
  if (dayDiff === 0) {
    return {
      relativeLabel: "Hari ini",
      banner: {
        cls: "bg-pop-emerald/20 border-pop-emerald/60",
        label: "Slip HARI INI",
        sub: "Slip ini untuk hari ini. Verifikasi cepat — kue harus dipanggang sekarang.",
      },
    };
  }
  if (dayDiff === 1) {
    return {
      relativeLabel: "Besok",
      banner: {
        cls: "bg-tertiary/30 border-foreground",
        label: "Slip BESOK",
        sub: "Alur normal — siapkan untuk produksi besok pagi.",
      },
    };
  }
  return {
    relativeLabel: `${dayDiff} hari lagi`,
    banner: {
      cls: "bg-warning/20 border-warning/50",
      label: `Slip ${dayDiff} hari ke depan`,
      sub: "Slip ini untuk hari setelah besok. Pastikan kamu tidak salah membuka slip yang seharusnya besok.",
    },
  };
}
