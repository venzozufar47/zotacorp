export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Ban, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import {
  getBooking,
  listBankAccountOptions,
} from "@/lib/actions/yeobo-booth.actions";
import { listFreelance } from "@/lib/actions/yeobo-booth-freelance.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingForm } from "@/components/yeobo-booth/BookingForm";
import { CancelBookingButton } from "@/components/yeobo-booth/CancelBookingButton";
import { PaymentPanel } from "@/components/yeobo-booth/PaymentPanel";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
} from "@/components/yeobo-booth/StatusBadges";
import { formatIDR } from "@/lib/cashflow/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: PageProps) {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");
  const { id } = await params;

  const [booking, freelance, bankAccounts] = await Promise.all([
    getBooking(id),
    listFreelance({ includeInactive: true }),
    listBankAccountOptions(),
  ]);
  if (!booking) notFound();

  return (
    // NOTE: tidak pakai `animate-fade-up` di root — animation memakai
    // `transform` yang bikin <position:fixed> sticky bar di BookingForm
    // jadi terikat ke parent (bukan viewport).
    <div className="space-y-5">
      <PageHeader
        title={booking.nama_klien}
        subtitle={`Booking #${booking.id.slice(0, 8)}`}
        action={
          <Link
            href="/admin/yeobo-booth/bookings"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Daftar Booking
          </Link>
        }
      />

      {/* Summary card */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <BookingStatusBadge status={booking.status} />
          <PaymentStatusBadge status={booking.payment_status} />
          {booking.status === "cancelled" && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <Ban size={12} /> Dibatalkan
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field icon={<CalendarDays size={14} />} label="Tanggal">
            {new Date(booking.tanggal + "T00:00:00").toLocaleDateString(
              "id-ID",
              {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }
            )}
          </Field>
          <Field icon={<Clock size={14} />} label="Jam">
            {booking.jam_mulai.slice(0, 5)} – {booking.jam_selesai.slice(0, 5)} WIB
          </Field>
          {booking.lokasi_event && (
            <Field
              icon={<MapPin size={14} />}
              label="Lokasi"
              className="md:col-span-2"
            >
              {booking.lokasi_event}
            </Field>
          )}
          {booking.no_hp_klien && (
            <Field label="No HP Klien">{booking.no_hp_klien}</Field>
          )}
          {booking.freelance.length > 0 && (
            <Field
              icon={<Users size={14} />}
              label="Freelance"
              className="md:col-span-2"
            >
              {booking.freelance.map((f) => f.nama).join(", ")}
            </Field>
          )}
          <Field label="Harga Total" className="md:col-span-2">
            <span className="font-display font-bold text-lg text-foreground">
              {formatIDR(booking.harga_total)}
            </span>
          </Field>
          {booking.catatan && (
            <Field label="Catatan" className="md:col-span-2">
              <p className="whitespace-pre-wrap">{booking.catatan}</p>
            </Field>
          )}
        </div>
      </section>

      {/* Pembayaran */}
      <PaymentPanel booking={booking} bankAccounts={bankAccounts} />

      {/* Edit form */}
      <section>
        <h2 className="font-display text-xl font-bold text-foreground mb-3">
          Edit Booking
        </h2>
        <BookingForm freelance={freelance} editing={booking} />
      </section>

      {/* Danger zone — cancel booking */}
      {booking.status !== "cancelled" && (
        <section className="rounded-2xl border-2 border-destructive/30 bg-destructive/[0.03] p-4 sm:p-5">
          <h2 className="font-display text-base font-bold text-destructive mb-1">
            Batalkan Booking
          </h2>
          <p className="text-[12.5px] text-muted-foreground mb-3">
            Sesi tidak jadi dilaksanakan. Kalau sudah ada pembayaran, kamu
            bisa pilih uang hangus (revenue tetap) atau dikembalikan ke
            klien (refund di cashflow).
          </p>
          <CancelBookingButton booking={booking} />
        </section>
      )}
    </div>
  );
}

function Field({
  icon,
  label,
  className,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}
