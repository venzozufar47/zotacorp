export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  CleaningOverview,
  type CleaningViewKey,
} from "@/components/admin/cleaning/CleaningOverview";
import {
  listChecklists,
  listAssignments,
  listBranchDuties,
  listCleaningLocations,
} from "@/lib/actions/cleaning.actions";
import { getCleaningRangeReport } from "@/lib/actions/cleaning-range.actions";
import { listHolidays } from "@/lib/actions/holidays.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Kebersihan — satu halaman.
 *
 * Dulu 5 tab: Monitoring / Review Foto / Checklist / Duty Cabang / Assignment.
 * Tiga tab terakhir adalah penyusunan SOP — sekali diatur lalu jarang disentuh —
 * tapi berdiri sejajar dengan pemantauan harian, sehingga tiap kali membuka
 * halaman ini admin harus memilih dulu "mau memantau atau menyusun". Penyusunan
 * turun ke drawer; halaman menjawab dua hal: seberapa bersih tiap cabang, dan
 * siapa yang rajin.
 *
 * Skor & strip SELALU 14 hari terakhir — tidak ada lagi pilihan rentang
 * (dulu hari ini / 7 / 30 hari), yang bikin skor bisa tidak sinkron dengan
 * strip yang memang selalu 14 hari.
 */

const SCORE_DAYS = 14;

function ymdMinus(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export default async function AdminCleaningPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; gallery?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const view: CleaningViewKey = sp.view === "karyawan" ? "karyawan" : "ringkasan";
  const initialGalleryOpen = sp.gallery === "1";

  const today = jakartaDateString(new Date());
  const from = ymdMinus(today, SCORE_DAYS - 1);

  const supabase = await createClient();
  const [
    checklists,
    assignments,
    branchDuties,
    locations,
    reportRes,
    employeesRes,
    holidays,
  ] = await Promise.all([
    listChecklists(),
    listAssignments(),
    listBranchDuties(),
    listCleaningLocations(),
    getCleaningRangeReport({
      from,
      to: today,
      scoreDays: SCORE_DAYS,
    }),
    supabase
      .from("profiles")
      .select("id, full_name, business_unit")
      .eq("is_active", true)
      .neq("role", "investor")
      .order("full_name"),
    listHolidays(),
  ]);

  const employees = (employeesRes.data ?? []).map((e) => ({
    id: e.id,
    name: e.full_name || "—",
    business_unit: e.business_unit ?? null,
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Kebersihan"
        subtitle="Seberapa bersih tiap cabang, dan siapa yang rajin menjalankan SOP. Penyusunan checklist, duty cabang, dan assignment ada di Pengaturan SOP."
      />
      {!reportRes.ok ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          {reportRes.error ?? "Gagal memuat laporan kebersihan."}
        </div>
      ) : (
        <CleaningOverview
          report={reportRes.data!}
          view={view}
          checklists={checklists}
          assignments={assignments}
          branchDuties={branchDuties}
          locations={locations}
          employees={employees}
          holidays={holidays}
          initialGalleryOpen={initialGalleryOpen}
        />
      )}
    </div>
  );
}
