export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Plus,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import { getCurrentRole } from "@/lib/supabase/cached";
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
  const role = await getCurrentRole();
  const isAdminZota = role === "admin";

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
    // NOTE: tidak pakai `animate-fade-up` — animation memakai
    // `transform` yang bikin FAB <position:fixed> jadi terikat ke
    // root div (bukan viewport).
    <div className="space-y-6 pb-28 md:pb-0">
      <PageHeader
        title="Yeobo Booth"
        subtitle="Scheduling + booking + pembayaran unit persewaan photobooth."
        action={
          <Link
            href="/admin/yeobo-booth/bookings/new"
            className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
          >
            <Plus size={14} strokeWidth={2.5} />
            Booking Baru
          </Link>
        }
      />

      {/* Tool row — di mobile horizontal scroll dengan icon kompak;
          di desktop wrap inline di sebelah primary CTA atas. */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <ToolLink href="/admin/yeobo-booth/calendar" icon={CalendarDays} label="Kalender" />
        <ToolLink href="/admin/yeobo-booth/bookings" icon={ClipboardList} label="Semua Booking" />
        <ToolLink href="/admin/yeobo-booth/laporan" icon={Wallet} label="Laporan" />
        <ToolLink href="/admin/yeobo-booth/freelance" icon={Users} label="Freelance" />
        {isAdminZota && (
          <ToolLink href="/admin/yeobo-booth/admins" icon={Shield} label="Akses Admin" />
        )}
      </div>

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

      {/* Mobile-only floating action button. md+ pakai tombol di header. */}
      <Link
        href="/admin/yeobo-booth/bookings/new"
        aria-label="Booking baru"
        className="md:hidden fixed right-4 z-40 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground px-5 py-3 text-sm font-bold shadow-lg shadow-primary/30 hover:opacity-90"
        style={{
          bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Plus size={18} strokeWidth={2.5} />
        Booking Baru
      </Link>
    </div>
  );
}

function ToolLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </Link>
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
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
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
