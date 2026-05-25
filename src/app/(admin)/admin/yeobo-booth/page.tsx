export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import { listBookings } from "@/lib/actions/yeobo-booth.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingTable } from "@/components/yeobo-booth/BookingTable";
import { formatIDR } from "@/lib/cashflow/format";
import { jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Overview Yeobo Booth — sesi mendatang + metrik bulan berjalan.
 *
 * Akses Phase 3: admin Zota saja. Phase 8 akan extend ke admin Yeobo
 * Booth (membership table yeobo_booth_admins).
 */
export default async function YeoboBoothOverviewPage() {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");

  const today = jakartaDateString(new Date());
  const monthStart = today.slice(0, 7) + "-01";
  const [upcoming, thisMonth] = await Promise.all([
    listBookings({ fromDate: today }),
    listBookings({ fromDate: monthStart }),
  ]);

  const sesiBulanIni = thisMonth.filter(
    (b) => b.status !== "cancelled"
  ).length;
  const pendapatanBulanIni = thisMonth.reduce(
    (sum, b) =>
      sum +
      (b.status === "cancelled"
        ? 0
        : (b.dp_nominal ?? 0) + (b.pelunasan_nominal ?? 0)),
    0
  );
  const outstanding = thisMonth.reduce((sum, b) => {
    if (b.status === "cancelled") return sum;
    return (
      sum +
      Math.max(
        0,
        b.harga_total - (b.dp_nominal ?? 0) - (b.pelunasan_nominal ?? 0)
      )
    );
  }, 0);
  const upcomingUnpaid = upcoming.filter(
    (b) => b.status !== "cancelled" && b.payment_status !== "lunas"
  ).length;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Yeobo Booth"
        subtitle="Scheduling + booking + pembayaran unit persewaan photobooth."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/yeobo-booth/calendar"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <CalendarDays size={14} strokeWidth={2.5} />
              Kalender
            </Link>
            <Link
              href="/admin/yeobo-booth/laporan"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Wallet size={14} strokeWidth={2.5} />
              Laporan
            </Link>
            <Link
              href="/admin/yeobo-booth/freelance"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Users size={14} strokeWidth={2.5} />
              Freelance
            </Link>
            <Link
              href="/admin/yeobo-booth/bookings"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ClipboardList size={14} strokeWidth={2.5} />
              Semua Booking
            </Link>
            <Link
              href="/admin/yeobo-booth/bookings/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
            >
              <Plus size={14} strokeWidth={2.5} />
              Booking Baru
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={<CalendarDays size={16} />}
          label="Sesi Bulan Ini"
          value={String(sesiBulanIni)}
        />
        <MetricCard
          icon={<Wallet size={16} />}
          label="Pendapatan Bulan Ini"
          value={formatIDR(pendapatanBulanIni)}
        />
        <MetricCard
          icon={<Wallet size={16} />}
          label="Outstanding"
          value={formatIDR(outstanding)}
          tone="warn"
        />
        <MetricCard
          icon={<ClipboardList size={16} />}
          label="Upcoming Belum Lunas"
          value={String(upcomingUnpaid)}
        />
      </section>

      <section>
        <h2 className="font-display text-xl font-bold text-foreground mb-3">
          Sesi Mendatang
        </h2>
        <BookingTable
          bookings={upcoming}
          emptyHint="Tidak ada sesi mendatang. Buat booking baru untuk mulai."
        />
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div
        className={
          tone === "warn"
            ? "font-display font-bold text-xl text-destructive mt-1"
            : "font-display font-bold text-xl text-foreground mt-1"
        }
      >
        {value}
      </div>
    </div>
  );
}
