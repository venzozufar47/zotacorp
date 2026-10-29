export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listHolidays } from "@/lib/actions/holidays.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { PageHeader } from "@/components/shared/PageHeader";
import { HolidayCalendarView } from "@/components/admin/HolidayCalendarView";

/**
 * Kalender Libur: tanggal merah nasional 2026 & 2027 menurut SKB 3 Menteri (tanpa cuti bersama), untuk dicek superadmin.
 * Daftar resminya ada di `src/lib/holidays/indonesia.ts` dan dipakai juga oleh hari kerja scorecard.
 */
export default async function KalenderLiburPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const rows = await listHolidays();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Kalender Libur"
        subtitle="Tanggal merah nasional 2026 & 2027 menurut SKB 3 Menteri. Cuti bersama tidak termasuk. Dipakai untuk hari kerja scorecard dan bonus libur absensi."
      />
      <HolidayCalendarView dbDates={rows.map((r) => r.date)} today={jakartaDateString(new Date())} />
    </div>
  );
}
