import Link from "next/link";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { formatIDR } from "@/lib/cashflow/format";
import type { YeoboBoothBookingWithFreelance } from "@/lib/yeobo-booth/types";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
} from "./StatusBadges";

interface Props {
  bookings: YeoboBoothBookingWithFreelance[];
  emptyHint?: string;
}

function formatTanggal(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingTable({ bookings, emptyHint }: Props) {
  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
        {emptyHint ?? "Belum ada booking."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bookings.map((b) => {
        const sisa =
          b.harga_total - (b.dp_nominal ?? 0) - (b.pelunasan_nominal ?? 0);
        return (
          <Link
            key={b.id}
            href={`/admin/yeobo-booth/bookings/${b.id}`}
            className="block rounded-2xl border border-border bg-card hover:bg-muted/40 transition p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h3 className="font-semibold text-foreground text-base truncate">
                    {b.nama_klien}
                  </h3>
                  <BookingStatusBadge status={b.status} />
                  <PaymentStatusBadge status={b.payment_status} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={13} />
                    {formatTanggal(b.tanggal)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={13} />
                    {b.jam_mulai.slice(0, 5)} – {b.jam_selesai.slice(0, 5)} WIB
                  </span>
                  {b.lokasi_event && (
                    <span className="inline-flex items-center gap-1.5 col-span-2 truncate">
                      <MapPin size={13} />
                      {b.lokasi_event}
                    </span>
                  )}
                  {b.freelance.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 col-span-2 truncate">
                      <Users size={13} />
                      {b.freelance.map((f) => f.nama).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="font-display font-bold text-lg text-foreground">
                  {formatIDR(b.harga_total)}
                </div>
                {sisa > 0 && b.status !== "cancelled" && (
                  <div className="text-[11px] text-destructive font-medium mt-0.5">
                    Sisa: {formatIDR(sisa)}
                  </div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
