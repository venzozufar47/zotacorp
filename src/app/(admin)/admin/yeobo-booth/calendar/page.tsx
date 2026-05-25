export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import { listBookings } from "@/lib/actions/yeobo-booth.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingCalendar } from "@/components/yeobo-booth/BookingCalendar";

export default async function CalendarPage() {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");

  // Window lebar — calendar component support navigasi ke bulan apa
  // saja, jadi fetch 6 bulan ke belakang + 12 bulan ke depan biar user
  // tidak kehilangan event saat geser bulan. Volume booking photobooth
  // moderate (puluhan/bulan), aman fetch sebanyak ini di satu request.
  const today = new Date();
  const fromDate = new Date(today.getFullYear(), today.getMonth() - 6, 1)
    .toISOString()
    .slice(0, 10);
  const toDate = new Date(today.getFullYear(), today.getMonth() + 13, 0)
    .toISOString()
    .slice(0, 10);
  const bookings = await listBookings({ fromDate, toDate });

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Kalender"
        subtitle="Tampilan bulanan semua booking. Klik sesi untuk detail."
        action={
          <div className="flex gap-2">
            <Link
              href="/admin/yeobo-booth"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
              Overview
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
      <BookingCalendar bookings={bookings} />
    </div>
  );
}
