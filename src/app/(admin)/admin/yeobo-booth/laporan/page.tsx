export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import { listBookings } from "@/lib/actions/yeobo-booth.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { LaporanCharts } from "@/components/yeobo-booth/LaporanCharts";
import { formatIDR } from "@/lib/cashflow/format";
import { jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Laporan Yeobo Booth — chart pendapatan & jumlah sesi, plus tabel
 * ringkasan per bulan. Investor view (lebih ringkas, cuma gross/net +
 * sesi) ditampilkan terpisah di /investor/finance ketika investor
 * punya assignment ke business_unit 'Yeobo Booth'.
 */
export default async function LaporanPage() {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");

  // Window 12 bulan terakhir.
  const today = new Date();
  const fromDate = jakartaDateString(
    new Date(today.getFullYear(), today.getMonth() - 11, 1)
  );
  const bookings = await listBookings({ fromDate });

  // Aggregat ringkasan total (lifetime window).
  const totalPendapatan = bookings.reduce(
    (s, b) =>
      s +
      (b.status === "cancelled"
        ? 0
        : (b.dp_nominal ?? 0) + (b.pelunasan_nominal ?? 0)),
    0
  );
  const totalSesi = bookings.filter((b) => b.status === "completed").length;
  const totalOutstanding = bookings.reduce((s, b) => {
    if (b.status === "cancelled") return s;
    return (
      s +
      Math.max(
        0,
        b.harga_total - (b.dp_nominal ?? 0) - (b.pelunasan_nominal ?? 0)
      )
    );
  }, 0);

  // Breakdown DP vs Lunas (count + nominal)
  const dpCount = bookings.filter(
    (b) => b.payment_status === "dp" && b.status !== "cancelled"
  ).length;
  const lunasCount = bookings.filter(
    (b) => b.payment_status === "lunas" && b.status !== "cancelled"
  ).length;

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Laporan"
        subtitle="Pendapatan, jumlah sesi, dan outstanding dalam 12 bulan terakhir."
        action={
          <Link
            href="/admin/yeobo-booth"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Overview
          </Link>
        }
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Total Pendapatan" value={formatIDR(totalPendapatan)} />
        <Metric label="Sesi Completed" value={String(totalSesi)} />
        <Metric
          label="Outstanding"
          value={formatIDR(totalOutstanding)}
          tone="warn"
        />
        <Metric label="DP / Lunas" value={`${dpCount} / ${lunasCount}`} />
      </section>

      <LaporanCharts bookings={bookings} />

      <p className="text-xs text-muted-foreground">
        Catatan: pendapatan dihitung dari DP + pelunasan yang sudah masuk
        (cash basis). Booking yang dibatalkan dikeluarkan dari semua angka.
        Data <em>net</em> setelah alokasi Pusat tersedia di laporan finance
        utama (<Link
          href="/admin/finance"
          className="text-primary underline"
        >
          /admin/finance
        </Link>) dengan filter business unit{" "}
        <strong>Yeobo Booth</strong>.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          tone === "warn"
            ? "font-display font-bold text-base sm:text-xl text-destructive mt-1 break-words"
            : "font-display font-bold text-base sm:text-xl text-foreground mt-1 break-words"
        }
      >
        {value}
      </div>
    </div>
  );
}
