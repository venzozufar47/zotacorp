export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Calendar, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { createClient } from "@/lib/supabase/server";
import {
  jakartaDateString,
  jakartaDateMinusDays,
} from "@/lib/utils/jakarta";
import { SlipStatusBadge } from "@/components/cake/SlipStatusBadge";
import type { CakeProductionSlipStatus } from "@/lib/cake-orders/types";

/**
 * Slip preview calendar — cake-input employee picks a date to review,
 * edit, verify, and send to the production team. Mirrors `/cake-orders`
 * shell (no app navbar). Admin role does NOT see this surface; admin
 * is view-only on cake operations.
 */
export default async function EmployeeSlipCalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasOrders) redirect("/dashboard");

  // 14 Jakarta-anchored dates. `format(addDays(...))` on the server's
  // local clock would be wrong on Vercel (UTC).
  const todayYmd = jakartaDateString(new Date());
  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    dates.push(jakartaDateMinusDays(todayYmd, -i));
  }

  const supabase = await createClient();
  const [{ data: slipsRaw }, { data: countsRaw }] = await Promise.all([
    supabase
      .from("cake_production_slips" as never)
      .select("target_date, status")
      .in("target_date", dates),
    supabase
      .from("cake_orders" as never)
      .select("scheduled_at")
      .gte("scheduled_at", `${dates[0]}T00:00:00.000+07:00`)
      .lte(
        "scheduled_at",
        `${dates[dates.length - 1]}T23:59:59.999+07:00`
      ),
  ]);

  type Row = { target_date: string; status: string };
  const slipMap = new Map<string, string>();
  for (const r of (slipsRaw ?? []) as unknown as Row[])
    slipMap.set(r.target_date, r.status);

  type C = { scheduled_at: string };
  const countMap = new Map<string, number>();
  for (const r of (countsRaw ?? []) as unknown as C[]) {
    const day = jakartaDateString(new Date(r.scheduled_at));
    countMap.set(day, (countMap.get(day) ?? 0) + 1);
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <Link
          href="/cake-orders"
          className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
          aria-label="Kembali ke pesanan"
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
            Slip produksi
          </h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Pilih tanggal — review, edit, verifikasi, lalu kirim ke tim
            produksi.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {dates.map((d) => {
          const status = slipMap.get(d);
          const count = countMap.get(d) ?? 0;
          const isToday = d === dates[0];
          const isTomorrow = d === dates[1];
          return (
            <Link
              key={d}
              href={`/cake-orders/slip/${d}`}
              className="rounded-2xl border-2 border-foreground bg-card p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar
                  size={14}
                  className="text-muted-foreground shrink-0"
                />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {isToday ? "Hari ini" : isTomorrow ? "Besok" : ""}
                </span>
              </div>
              <div className="font-semibold text-foreground mt-1">
                {format(new Date(`${d}T00:00:00`), "EEE, d MMM", {
                  locale: idLocale,
                })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {count} cake terjadwal
              </div>
              {status && (
                <div className="mt-1.5">
                  <SlipStatusBadge status={status as CakeProductionSlipStatus} />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
