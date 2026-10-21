export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listMyFiledGrievances,
  listGrievanceInbox,
  listEmployeesForGrievance,
} from "@/lib/actions/grievances.actions";
import { GrievanceClient } from "@/components/grievances/GrievanceClient";

export default async function PengaduanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  // Superadmin menangani pengaduan langsung di beranda admin, bukan di halaman terpisah.
  if (role === "admin") redirect("/admin");

  const [myReports, inbox, employees] = await Promise.all([
    listMyFiledGrievances(),
    listGrievanceInbox(),
    listEmployeesForGrievance(),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
          Pengaduan<span className="text-primary">.</span>
        </h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Identitasmu dijaga bila kamu pilih &ldquo;kirim tanpa nama&rdquo;. Tidak ada pembalasan bagi
        pelapor beritikad baik.
      </p>
      <GrievanceClient
        myReports={myReports}
        inbox={inbox}
        employees={employees}
        isAdmin={false}
        trustedContacts={[]}
      />
    </div>
  );
}
