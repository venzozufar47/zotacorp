export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import {
  listGrievanceInbox,
  listEmployeesForGrievance,
  listTrustedContacts,
} from "@/lib/actions/grievances.actions";
import { GrievanceAdminSection } from "@/components/grievances/GrievanceClient";

/**
 * Superadmin — Pengaduan: antrean pengaduan HR yang masuk (tingkat 3 dan 4) dan pengaturan pihak
 * tepercaya. Laporan tingkat 2 ditangani kepala tim dari halaman Tim.
 */
export default async function AdminPengaduanPage() {
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const [inbox, employees, trustedContacts] = await Promise.all([
    listGrievanceInbox(),
    listEmployeesForGrievance(),
    listTrustedContacts(),
  ]);

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Pengaduan</h1>
        <p className="text-sm text-muted-foreground">
          Pengaduan HR yang masuk, dan pihak tepercaya alternatif untuk laporan tingkat 4.
        </p>
      </div>
      <GrievanceAdminSection inbox={inbox} employees={employees} trustedContacts={trustedContacts} />
    </div>
  );
}
