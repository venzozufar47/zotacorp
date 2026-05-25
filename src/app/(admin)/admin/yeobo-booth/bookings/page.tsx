export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import { listBookings } from "@/lib/actions/yeobo-booth.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingTable } from "@/components/yeobo-booth/BookingTable";

export default async function BookingsListPage() {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");

  const bookings = await listBookings();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Semua Booking"
        subtitle="Daftar lengkap sesi photobooth — terjadwal, berlangsung, selesai, dan dibatalkan."
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
      <BookingTable bookings={bookings} />
    </div>
  );
}
