export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  CleaningOverview,
  type CleaningRangeKey,
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
 * `?range=` menentukan lebar rentang skor (hari / 7 / 30). Strip 14 hari di
 * kartu selalu 14 hari, jadi rentang 1 hari pun tetap punya konteks.
 */

const RANGE_DAYS: Record<CleaningRangeKey, number> = {
  hari: 1,
  "7": 7,
  "30": 30,
};

/** Strip di kartu selalu memperlihatkan 14 hari, jadi rentang sesempit apa pun
 *  tetap diambil minimal 14 hari ke belakang. */
const MIN_FETCH_DAYS = 14;

function ymdMinus(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export default async function AdminCleaningPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const range: CleaningRangeKey =
    sp.range === "7" || sp.range === "30" || sp.range === "hari"
      ? sp.range
      : "hari";
  const view: CleaningViewKey = sp.view === "karyawan" ? "karyawan" : "ringkasan";

  const today = jakartaDateString(new Date());
  const from = ymdMinus(today, Math.max(RANGE_DAYS[range], MIN_FETCH_DAYS) - 1);

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
      // Skor mengikuti rentang yang DIPILIH, walau datanya diambil ≥14 hari
      // demi strip. Tanpa ini "Hari ini" menampilkan skor 14 hari.
      scoreDays: RANGE_DAYS[range],
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
          range={range}
          view={view}
          checklists={checklists}
          assignments={assignments}
          branchDuties={branchDuties}
          locations={locations}
          employees={employees}
          holidays={holidays}
        />
      )}
    </div>
  );
}
