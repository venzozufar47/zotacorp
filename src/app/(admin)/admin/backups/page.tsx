export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getBackupSettings,
  listBackupRuns,
} from "@/lib/actions/backup.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { BackupsAdmin } from "@/components/admin/BackupsAdmin";

/**
 * Admin-only halaman pengelolaan backup database. Pasangan dari cron
 * `/api/cron/backup-database` — di sini admin atur cadence + retensi,
 * trigger backup manual, dan restore.
 */
export default async function AdminBackupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [settingsRes, runsRes] = await Promise.all([
    getBackupSettings(),
    listBackupRuns({ limit: 50 }),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Backup Database"
        subtitle="Snapshot semua data app yang bisa di-restore per kategori. Cron jalan tiap hari; cadence diatur di bawah."
      />
      <BackupsAdmin
        settings={settingsRes.ok ? settingsRes.data ?? null : null}
        runs={runsRes.ok ? runsRes.data ?? [] : []}
      />
    </div>
  );
}
