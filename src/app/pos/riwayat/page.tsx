export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { PosNavLink } from "@/components/pos/PosNavLink";
import { QrisReceiptBadge } from "@/components/pos/QrisReceiptBadge";
import { QRIS_RECEIPT_FROM_RIWAYAT } from "@/lib/pos/flags";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  findPosAccountForCurrentUser,
  listPosSaleDates,
  listRecentPosSales,
} from "@/lib/actions/pos.actions";
import { formatRp } from "@/lib/cashflow/format";
import { formatTime } from "@/lib/utils/date";

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
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const sp = await searchParams;

  // Daftar tanggal aktif (DESC) — dipakai untuk navigasi prev/next.
  const dates = await listPosSaleDates(account.id).catch((e) => {
    console.error("[PosRiwayatPage] listPosSaleDates failed", e);
    return [] as string[];
  });

  if (dates.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <Header accountName={account.accountName} />
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">Belum ada penjualan.</p>
        </div>
      </div>
    );
  }

  // Default ke tanggal terbaru. Kalau user request tanggal yang tidak
  // ada sale-nya, fallback ke terbaru.
  const requestedDate = sp.date && dates.includes(sp.date) ? sp.date : dates[0];
  const idx = dates.indexOf(requestedDate);
  const prevDate = idx < dates.length - 1 ? dates[idx + 1] : null; // older
  const nextDate = idx > 0 ? dates[idx - 1] : null; // newer

  const sales = await listRecentPosSales(
    account.id,
    null,
    0,
    requestedDate
  ).catch((e) => {
    console.error("[PosRiwayatPage] listRecentPosSales failed", e);
    return [] as Awaited<ReturnType<typeof listRecentPosSales>>;
  });

  const dayTotal = sales.reduce(
    (a, b) => (b.voidedAt ? a : a + b.total),
    0
  );
  const voidedCount = sales.filter((s) => s.voidedAt).length;
  const activeCount = sales.length - voidedCount;

  const nav = (
    <DateNav
      currentDate={requestedDate}
      prevDate={prevDate}
      nextDate={nextDate}
      dayIndex={dates.length - idx}
      totalDays={dates.length}
    />
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <Header accountName={account.accountName} />

      <div className="rounded-2xl border-2 border-foreground bg-pop-emerald/15 p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {formatDateLong(requestedDate)}
          </p>
          <p className="font-bold text-lg text-foreground tabular-nums">
            {formatRp(dayTotal)}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground tabular-nums">
          <p>
            <strong className="text-foreground">{activeCount}</strong>{" "}
            transaksi
          </p>
          {voidedCount > 0 && (
            <p className="text-destructive/80">+{voidedCount} dibatalkan</p>
          )}
        </div>
      </div>

      {nav}

      <div className="space-y-1.5">
        {sales.map((s) => (
          <details
            key={s.id}
            className={`rounded-xl border bg-card ${
              s.voidedAt
                ? "border-destructive/30 bg-destructive/5"
                : "border-border"
            }`}
          >
            <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      s.paymentMethod === "cash"
                        ? "bg-success/15 text-success"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    {s.paymentMethod === "cash" ? "Cash" : "QRIS"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(s.saleTime)}
                  </span>
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
                    .map(
                      (it) =>
                        `${it.qty}× ${it.variantName ? `${it.productName} ${it.variantName}` : it.productName}`
                    )
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
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatRp(it.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      {nav}
    </div>
  );
}

function Header({ accountName }: { accountName: string }) {
  return (
    <header>
      <PosNavLink
        href="/pos"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
      >
        <ArrowLeft size={12} /> Kembali ke POS
      </PosNavLink>
      <h1 className="font-semibold text-foreground">Riwayat Penjualan</h1>
      <p className="text-xs text-muted-foreground">{accountName}</p>
    </header>
  );
}

function DateNav({
  currentDate,
  prevDate,
  nextDate,
  dayIndex,
  totalDays,
}: {
  currentDate: string;
  prevDate: string | null;
  nextDate: string | null;
  dayIndex: number;
  totalDays: number;
}) {
  return (
    <nav className="flex items-center justify-between gap-2">
      <DateButton
        href={prevDate ? `/pos/riwayat?date=${prevDate}` : null}
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
        href={nextDate ? `/pos/riwayat?date=${nextDate}` : null}
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
