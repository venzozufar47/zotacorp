export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PosNavLink } from "@/components/pos/PosNavLink";
import { PosShell } from "@/components/pos/PosShell";
import { QrisReceiptBadge } from "@/components/pos/QrisReceiptBadge";
import { ReprintReceiptButton } from "@/components/pos/ReprintReceiptButton";
import { VoidSaleButton } from "@/components/pos/VoidSaleButton";
import { QRIS_RECEIPT_FROM_RIWAYAT } from "@/lib/pos/flags";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  findPosAccount,
  listPosSaleDates,
  listRecentPosSales,
} from "@/lib/actions/pos.actions";
import { getPosReceiptConfig } from "@/lib/actions/pos-receipt-config.actions";
import { getPosAuthorizers } from "@/lib/actions/pos-stock.actions";
import {
  listCakePickupHistory,
  listCakePickupHistoryDates,
  type CakePickupHistoryRow,
} from "@/lib/actions/pos-cake-pickup.actions";
import { defaultReceiptContent } from "@/lib/pos/receipt-settings";
import { posBranchFromParam, posBasePath } from "@/lib/pos/branch";
import { formatRp } from "@/lib/cashflow/format";
import { formatTime } from "@/lib/utils/date";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { sugarLevelLabel } from "@/lib/pos/sugar-levels";

/** "HH:mm" → menit sejak tengah malam, untuk mengurutkan sale + cake
 *  pickup dalam satu timeline kronologis. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function PosRiwayatPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/pospare");
  const basePath = posBasePath(branchParam);

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await findPosAccount(branch);
  if (!account) redirect("/");

  const role = await getCurrentRole();
  const isAdmin = role === "admin";

  const receiptContent =
    (await getPosReceiptConfig(account.id).catch(() => null)) ??
    defaultReceiptContent(account.accountName);

  const sp = await searchParams;

  // Daftar tanggal aktif (DESC) — dipakai untuk navigasi prev/next.
  // Digabung dengan tanggal pickup kue supaya hari yang cuma ada
  // pengambilan kue (tanpa penjualan reguler) tetap terjangkau nav.
  const [saleDates, cakeDates] = await Promise.all([
    listPosSaleDates(account.id).catch((e) => {
      console.error("[PosRiwayatPage] listPosSaleDates failed", e);
      return [] as string[];
    }),
    listCakePickupHistoryDates(account.id).catch((e) => {
      console.error("[PosRiwayatPage] listCakePickupHistoryDates failed", e);
      return [] as string[];
    }),
  ]);
  const dates = [...new Set([...saleDates, ...cakeDates])].sort().reverse();

  if (dates.length === 0) {
    return (
      <PosShell
        outletName={account.accountName}
        basePath={basePath}
        isAdmin={isAdmin}
        active="riwayat"
        title="Riwayat Penjualan"
        showShiftPill={false}
      >
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Belum ada transaksi.
            </p>
          </div>
        </div>
      </PosShell>
    );
  }

  // Default ke tanggal terbaru. Kalau user request tanggal yang tidak
  // ada sale-nya, fallback ke terbaru.
  const requestedDate = sp.date && dates.includes(sp.date) ? sp.date : dates[0];
  const idx = dates.indexOf(requestedDate);
  const prevDate = idx < dates.length - 1 ? dates[idx + 1] : null; // older
  const nextDate = idx > 0 ? dates[idx - 1] : null; // newer

  const [sales, authorizers, cakePickups] = await Promise.all([
    listRecentPosSales(account.id, null, 0, requestedDate).catch((e) => {
      console.error("[PosRiwayatPage] listRecentPosSales failed", e);
      return [] as Awaited<ReturnType<typeof listRecentPosSales>>;
    }),
    getPosAuthorizers(account.id),
    listCakePickupHistory(account.id, requestedDate).catch((e) => {
      console.error("[PosRiwayatPage] listCakePickupHistory failed", e);
      return [] as CakePickupHistoryRow[];
    }),
  ]);

  // Timeline gabungan, urut waktu terbaru dulu — sama seperti urutan
  // `sales` sendiri. Pickup kue TIDAK ikut `dayTotal`/`activeCount` di
  // bawah: uangnya (kalau cash) sudah tercatat terpisah sebagai baris
  // kas non-operasional, dan pendapatannya diakui via akrual cake.
  // Ikut menghitungnya di sini akan dobel.
  type TimelineEntry =
    | { kind: "sale"; time: string; sale: (typeof sales)[number] }
    | { kind: "cake"; time: string; cake: CakePickupHistoryRow };
  const timeline: TimelineEntry[] = [
    ...sales.map((s) => ({ kind: "sale" as const, time: s.saleTime, sale: s })),
    ...cakePickups.map((c) => ({
      kind: "cake" as const,
      time: formatTime(c.pickedUpAt),
      cake: c,
    })),
  ].sort((a, b) => hhmmToMinutes(b.time) - hhmmToMinutes(a.time));

  const dayTotal = sales.reduce(
    (a, b) => (b.voidedAt ? a : a + b.total),
    0
  );
  const voidedCount = sales.filter((s) => s.voidedAt).length;
  const activeCount = sales.length - voidedCount;

  // Tombol batal hanya dirender kalau `voidPosSale` memang akan menerimanya
  // — aturannya harus SAMA PERSIS dengan action, kalau tidak kasir menekan
  // tombol yang selalu ditolak. Halaman ini sering menampilkan tanggal lain
  // (default = hari terakhir yang ada penjualannya, bukan hari ini), jadi
  // tanpa gating ini seluruh tombol di layar akan gagal.
  //
  // Sisa penolakan (transaksi lama pra-link yang tak tertaut kas) sengaja
  // TIDAK dicek di sini: semuanya bertanggal April, jadi aturan hari-ini
  // sudah menyembunyikannya dari kasir, dan hanya admin yang bisa
  // menemuinya — dengan pesan error yang jelas.
  const todayWib = jakartaDateString(new Date());
  const canVoid = (s: (typeof sales)[number]) => {
    if (s.voidedAt || s.paymentStatus !== "paid") return false;
    if (isAdmin) return true;
    const moneyDate = s.settledAt
      ? jakartaDateString(new Date(s.settledAt))
      : s.saleDate;
    return moneyDate === todayWib;
  };

  const nav = (
    <DateNav
      basePath={basePath}
      currentDate={requestedDate}
      prevDate={prevDate}
      nextDate={nextDate}
      dayIndex={dates.length - idx}
      totalDays={dates.length}
    />
  );

  return (
    <PosShell
      outletName={account.accountName}
      basePath={basePath}
      isAdmin={isAdmin}
      active="riwayat"
      title="Riwayat Penjualan"
      subtitle="catatan transaksi per hari"
      showShiftPill={false}
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-5 space-y-3.5">

      {/* KPI grid — mirror concept-b: total hari + transaksi + avg basket. */}
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
        <div className="rounded-2xl border-2 border-success bg-success/10 p-4 shadow-[3px_3px_0_0_var(--foreground)]">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            {formatDateLong(requestedDate)}
          </p>
          <p className="mt-1.5 text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
            {formatRp(dayTotal)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Total penjualan hari ini
          </p>
        </div>
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--foreground)]">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            Transaksi
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {activeCount}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {voidedCount > 0 ? `${voidedCount} dibatalkan` : "Tidak ada void"}
            {cakePickups.length > 0
              ? ` · ${cakePickups.length} kue diambil`
              : ""}
          </p>
        </div>
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--foreground)]">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            Avg per tx
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {activeCount > 0
              ? formatRp(Math.round(dayTotal / activeCount))
              : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            basket size
          </p>
        </div>
      </div>

      {nav}

      <div className="space-y-2">
        {timeline.map((entry) => {
          if (entry.kind === "cake") {
            return (
              <CakePickupHistoryCard
                key={`cake-${entry.cake.id}`}
                cake={entry.cake}
              />
            );
          }
          const s = entry.sale;
          return (
          <details
            key={s.id}
            className={`rounded-2xl border-2 bg-card shadow-[2px_2px_0_0_var(--foreground)] ${
              s.voidedAt
                ? "border-destructive/40 bg-destructive/5"
                : "border-foreground"
            }`}
          >
            <summary className="cursor-pointer list-none p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      s.paymentStatus === "pending"
                        ? "bg-pop-amber/30 text-foreground"
                        : s.paymentMethod === "cash"
                          ? "bg-success/15 text-success"
                          : s.paymentMethod === "qris"
                            ? "bg-primary/15 text-primary"
                            : "bg-pop-emerald/20 text-foreground"
                    }`}
                  >
                    {s.paymentStatus === "pending"
                      ? "Pesanan"
                      : s.paymentMethod === "cash"
                        ? "Cash"
                        : s.paymentMethod === "qris"
                          ? "QRIS"
                          : "via Admin"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(s.saleTime)}
                  </span>
                  {s.customerName && (
                    <span className="text-xs font-medium text-foreground">
                      · {s.customerName}
                    </span>
                  )}
                  {s.fulfillmentType && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted/60 border border-border uppercase tracking-wider">
                      {s.fulfillmentType === "dine_in"
                        ? "🍽️ Dine"
                        : "🥡 TA"}
                    </span>
                  )}
                  {s.voidedAt && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive uppercase tracking-wider">
                      Dibatalkan
                    </span>
                  )}
                  {QRIS_RECEIPT_FROM_RIWAYAT &&
                    s.receiptUploaded !== null &&
                    !s.voidedAt && (
                      <QrisReceiptBadge
                        saleId={s.id}
                        initialUploaded={s.receiptUploaded}
                      />
                    )}
                </div>
                <div
                  className={`text-xs mt-0.5 truncate ${
                    s.voidedAt
                      ? "text-muted-foreground line-through"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.items
                    .map((it) => {
                      const parts = [it.productName];
                      if (it.variantName) parts.push(it.variantName);
                      const sugar = sugarLevelLabel(it.sugarLevel);
                      if (sugar) parts.push(sugar);
                      return `${it.qty}× ${parts.join(" ")}`;
                    })
                    .join(", ")}
                </div>
              </div>
              <span
                className={`font-semibold tabular-nums whitespace-nowrap ${
                  s.voidedAt
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                }`}
              >
                {formatRp(s.total)}
              </span>
            </summary>
            <ul className="px-3 pb-3 pt-0 border-t border-border text-sm space-y-1">
              {s.items.map((it, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-foreground">
                    {it.qty}× {it.productName}
                    {it.variantName && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {it.variantName}
                      </span>
                    )}
                    {sugarLevelLabel(it.sugarLevel) && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {sugarLevelLabel(it.sugarLevel)}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatRp(it.subtotal)}
                  </span>
                </li>
              ))}
              {s.discountAmount > 0 && s.grossTotal != null && (
                <li className="mt-1 pt-2 border-t border-dashed border-border space-y-0.5 text-xs">
                  <div className="flex items-center justify-between gap-3 text-muted-foreground tabular-nums">
                    <span>Subtotal</span>
                    <span>{formatRp(s.grossTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-success tabular-nums">
                    <span>Diskon</span>
                    <span>−{formatRp(s.discountAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-border tabular-nums">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="font-semibold text-foreground">
                      {formatRp(s.total)}
                    </span>
                  </div>
                </li>
              )}
              {s.voidedAt && (s.voidReason || s.voidedByName) && (
                <li className="mt-1 pt-2 border-t border-dashed border-destructive/30 text-xs text-muted-foreground">
                  {s.voidReason && (
                    <span className="text-destructive font-medium">
                      Alasan: {s.voidReason}
                    </span>
                  )}
                  {/* Nama ini adalah pemilik PIN yang menyetujui (migrasi
                      133), bukan sekadar yang menekan tombol — kata
                      kerjanya diselaraskan supaya tidak menyesatkan. */}
                  {s.voidedByName && (
                    <span className="block mt-0.5">
                      Diotorisasi oleh {s.voidedByName}
                    </span>
                  )}
                </li>
              )}
              {!s.voidedAt && receiptContent.enabled && (
                <li>
                  <ReprintReceiptButton
                    sale={s}
                    content={receiptContent}
                    branch={account.branch}
                  />
                </li>
              )}
              {canVoid(s) && (
                <li>
                  <VoidSaleButton
                    sale={s}
                    authorizers={authorizers.sale_void}
                  />
                </li>
              )}
            </ul>
          </details>
          );
        })}
      </div>

      {nav}
      </div>
    </PosShell>
  );
}

/**
 * Kartu pickup kue di timeline Riwayat — bentuknya sengaja mirip kartu
 * sale (badge + waktu + nama, ringkasan di bawah, total di kanan) supaya
 * timeline gabungan terasa satu sistem, bukan dua widget yang ditempel.
 * Tidak collapsible seperti sale: isinya sudah pendek, dan tidak ada
 * baris item untuk disembunyikan.
 */
function CakePickupHistoryCard({ cake }: { cake: CakePickupHistoryRow }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card shadow-[2px_2px_0_0_var(--foreground)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pop-amber/30 text-foreground">
              🎂 Kue
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTime(cake.pickedUpAt)}
            </span>
            <span className="text-xs font-medium text-foreground">
              · {cake.customerName}
            </span>
            {cake.freeClaim ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pop-emerald/20 border border-foreground uppercase tracking-wider">
                Gratis
              </span>
            ) : cake.hasOutstanding ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive uppercase tracking-wider">
                {cake.paymentLabel}
              </span>
            ) : null}
          </div>
          {cake.spec && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {cake.spec}
            </div>
          )}
        </div>
        <span className="font-semibold tabular-nums whitespace-nowrap text-foreground shrink-0">
          {formatRp(cake.totalIdr)}
        </span>
      </div>

      {cake.settlement && (
        <div className="mt-2 pt-2 border-t border-dashed border-border flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground truncate">
            Diterima saat pickup
            {cake.settlement.recordedByName
              ? ` · oleh ${cake.settlement.recordedByName}`
              : ""}
          </span>
          <span className="font-medium text-foreground tabular-nums shrink-0">
            {cake.settlement.method === "qris"
              ? "QRIS "
              : cake.settlement.method === "cash"
                ? "Cash "
                : ""}
            {formatRp(cake.settlement.amountIdr)}
          </span>
        </div>
      )}
    </div>
  );
}

function DateNav({
  basePath,
  currentDate,
  prevDate,
  nextDate,
  dayIndex,
  totalDays,
}: {
  basePath: string;
  currentDate: string;
  prevDate: string | null;
  nextDate: string | null;
  dayIndex: number;
  totalDays: number;
}) {
  return (
    <nav className="flex items-center justify-between gap-2">
      <DateButton
        href={prevDate ? `${basePath}/riwayat?date=${prevDate}` : null}
        label={prevDate ? formatDateShort(prevDate) : "Tidak ada"}
        side="prev"
      />
      <span className="text-[11px] text-muted-foreground tabular-nums text-center">
        Hari{" "}
        <strong className="text-foreground">{dayIndex}</strong> / {totalDays}
        <br />
        <span className="text-[10px]">{formatDateShort(currentDate)}</span>
      </span>
      <DateButton
        href={nextDate ? `${basePath}/riwayat?date=${nextDate}` : null}
        label={nextDate ? formatDateShort(nextDate) : "Tidak ada"}
        side="next"
      />
    </nav>
  );
}

function DateButton({
  href,
  label,
  side,
}: {
  href: string | null;
  label: string;
  side: "prev" | "next";
}) {
  const base =
    "inline-flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-semibold border transition flex-1 max-w-[150px]";
  const content =
    side === "prev" ? (
      <>
        <ChevronLeft size={14} className="shrink-0" />
        <span className="truncate">{label}</span>
      </>
    ) : (
      <>
        <span className="truncate">{label}</span>
        <ChevronRight size={14} className="shrink-0" />
      </>
    );
  if (!href) {
    return (
      <span
        className={`${base} border-border text-muted-foreground/50 bg-muted/30 cursor-not-allowed ${side === "next" ? "justify-end" : ""}`}
      >
        {content}
      </span>
    );
  }
  return (
    <PosNavLink
      href={href}
      className={`${base} border-border text-foreground hover:bg-muted ${side === "next" ? "justify-end" : ""}`}
    >
      {content}
    </PosNavLink>
  );
}
