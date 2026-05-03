export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  listEmployeeMonitoring,
  previewBirthdayBroadcast,
} from "@/lib/actions/employee-monitoring.actions";
import { CelebrationsMonitoringTable } from "@/components/admin/CelebrationsMonitoringTable";
import { BirthdayBroadcastButton } from "@/components/admin/BirthdayBroadcastButton";

/**
 * Admin tab: monitoring streak presensi, ulang tahun, anniversary
 * tahun kerja, dan log pesan WA terkait perayaan untuk setiap
 * karyawan. Tidak menampilkan WA notifikasi presensi (request user).
 */
export default async function AdminCelebrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [{ data, error }, broadcastPreview] = await Promise.all([
    listEmployeeMonitoring(),
    previewBirthdayBroadcast(),
  ]);
  // Karyawan ulang tahun hari ini — dipakai buat preview di tombol
  // broadcast supaya admin tahu siapa yang akan disebut sebelum klik.
  const todayBirthdays = data.filter((r) => r.daysToBirthday === 0);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Monitoring Karyawan"
        subtitle="Streak presensi, ulang tahun, anniversary tahun kerja, dan log pesan WA perayaan"
      />
      <BirthdayBroadcastButton
        todayBirthdays={todayBirthdays.map((r) => ({
          id: r.id,
          name: r.nickname || r.fullName,
        }))}
        previewMessage={broadcastPreview.message}
      />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <CelebrationsMonitoringTable rows={data} />
      )}
    </div>
  );
}
