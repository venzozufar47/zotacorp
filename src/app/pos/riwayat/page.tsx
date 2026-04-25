export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { PosNavLink } from "@/components/pos/PosNavLink";
import { QrisReceiptBadge } from "@/components/pos/QrisReceiptBadge";
import { QRIS_RECEIPT_FROM_RIWAYAT } from "@/lib/pos/flags";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  countPosSales,
  findPosAccountForCurrentUser,
  listRecentPosSales,
} from "@/lib/actions/pos.actions";
import { formatRp } from "@/lib/cashflow/format";
import { formatTime } from "@/lib/utils/date";

const PAGE_SIZE = 50;

function formatDate(iso: string): string {
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
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await findPosAccountForCurrentUser();
  if (!account) redirect("/");

  const sp = await searchParams;
  const requestedPage = Math.max(1, Number(sp.page) || 1);

  // Total count dipakai untuk hitung jumlah halaman + clamp `page`
  // kalau user request halaman > totalPages.
  let totalCount = 0;
  try {
    totalCount = await countPosSales(account.id);
  } catch (e) {
    console.error("[PosRiwayatPage] countPosSales failed", e);
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  // Defensive: kalau listRecentPosSales throw (DB hiccup, attachment
  // lookup edge case), jangan trigger error.tsx — fallback ke list
  // kosong supaya kasir masih bisa navigate kembali ke /pos.
  let sales: Awaited<ReturnType<typeof listRecentPosSales>> = [];
  try {
    sales = await listRecentPosSales(account.id, PAGE_SIZE, offset);
  } catch (e) {
    console.error("[PosRiwayatPage] listRecentPosSales failed", e);
  }

  // Group by sale_date untuk tampilan per hari.
  const byDate = new Map<string, typeof sales>();
  for (const s of sales) {
    const arr = byDate.get(s.saleDate) ?? [];
    arr.push(s);
    byDate.set(s.saleDate, arr);
  }

  const rangeFrom = totalCount === 0 ? 0 : offset + 1;
  const rangeTo = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
      <header>
        <PosNavLink
          href="/pos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft size={12} /> Kembali ke POS
        </PosNavLink>
        <h1 className="font-semibold text-foreground">Riwayat Penjualan</h1>
        <p className="text-xs text-muted-foreground">
          {account.accountName} · {totalCount} transaksi
          {totalCount > 0 && (
            <>
              {" · "}
              <span className="tabular-nums">
                {rangeFrom}–{rangeTo}
              </span>
            </>
          )}
        </p>
      </header>

      {totalCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">Belum ada penjualan.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {[...byDate.entries()].map(([date, rows]) => {
              // Hitung hanya sale yang masih aktif — yang di-void tidak
              // lagi ada di ledger jadi tidak boleh ikut total harian.
              const dayTotal = rows.reduce(
                (a, b) => (b.voidedAt ? a : a + b.total),
                0
              );
              const voidedCount = rows.filter((r) => r.voidedAt).length;
              return (
                <section key={date}>
                  <div className="flex items-center justify-between px-1 pb-1.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {formatDate(date)}
                    </h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {rows.length - voidedCount} · {formatRp(dayTotal)}
                      {voidedCount > 0 && (
                        <span className="ml-1 text-destructive/80">
                          (+{voidedCount} dibatalkan)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((s) => (
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
                </section>
              );
            })}
          </div>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              rangeFrom={rangeFrom}
              rangeTo={rangeTo}
              total={totalCount}
            />
          )}
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  rangeFrom,
  rangeTo,
  total,
}: {
  page: number;
  totalPages: number;
  rangeFrom: number;
  rangeTo: number;
  total: number;
}) {
  const prevHref = page > 1 ? `/pos/riwayat?page=${page - 1}` : null;
  const nextHref = page < totalPages ? `/pos/riwayat?page=${page + 1}` : null;
  return (
    <nav className="flex items-center justify-between gap-3 pt-2 border-t border-border">
      <PageButton href={prevHref}>
        <ChevronLeft size={14} /> Sebelumnya
      </PageButton>
      <span className="text-xs text-muted-foreground tabular-nums text-center">
        Halaman <strong className="text-foreground">{page}</strong> /{" "}
        {totalPages}
        <br />
        <span className="text-[10px]">
          {rangeFrom}–{rangeTo} dari {total}
        </span>
      </span>
      <PageButton href={nextHref}>
        Berikutnya <ChevronRight size={14} />
      </PageButton>
    </nav>
  );
}

function PageButton({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-semibold border transition";
  if (!href) {
    return (
      <span
        className={`${base} border-border text-muted-foreground/50 bg-muted/30 cursor-not-allowed`}
      >
        {children}
      </span>
    );
  }
  return (
    <PosNavLink
      href={href}
      className={`${base} border-border text-foreground hover:bg-muted`}
    >
      {children}
    </PosNavLink>
  );
}
