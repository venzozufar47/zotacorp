export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { getBonusQuarter } from "@/lib/actions/bonus.actions";
import { isValidPeriod, periodLabel, quarterLabel, quarterOf } from "@/lib/bonus/periods";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { BonusMonthNav } from "@/components/admin/bonus/BonusMonthNav";
import { BonusParametersCard } from "@/components/admin/bonus/BonusParametersCard";
import { BonusResults } from "@/components/admin/bonus/BonusResults";

/**
 * Kalkulator Bonus Tim: owner menentukan p & LK dasar per kuartal, lalu menggeser bulan untuk melihat hitungan bonus
 * koordinator toko & kepala produksi (otomatis). Bulan yang sudah selesai bisa diterbitkan.
 */
export default async function AdminBonusPage({ searchParams }: { searchParams: Promise<{ bulan?: string; sim?: string }> }) {
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const thisMonth = jakartaDateString(new Date()).slice(0, 7);
  const sp = await searchParams;
  const period = isValidPeriod(sp.bulan) && sp.bulan <= thisMonth ? sp.bulan : thisMonth;
  const quarter = await getBonusQuarter(quarterOf(period));
  // Simulasi hanya diterima bila kuartal sumbernya memang punya parameter lengkap.
  const sim = quarter?.simulationSources.find((s) => s.quarter === sp.sim)?.quarter ?? null;

  return (
    <div className="space-y-5 p-4 animate-fade-up">
      <PageHeader title="Kalkulator Bonus" subtitle="Bonus koordinator toko & kepala produksi — dihitung otomatis dari omzet, HPP, dan scorecard." />
      <BonusMonthNav period={period} thisMonth={thisMonth} published={quarter?.publishedPeriods ?? []} sim={sim} />
      {sim && (
        <div role="status" className="rounded-xl border-2 border-warning/60 bg-warning/10 px-4 py-2.5 text-[13px] text-warning">
          <strong>Simulasi:</strong> parameter {quarterLabel(sim)} diterapkan pada {periodLabel(period)}. Hanya tampilan — tidak tersimpan, tidak bisa
          diterbitkan, dan tidak masuk slip gaji.
        </div>
      )}
      {quarter && <BonusParametersCard key={quarter.quarter} view={quarter} period={period} sim={sim} />}
      <Suspense
        key={`${period}|${sim ?? ""}`}
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[34rem]" />
            <Skeleton className="h-[34rem]" />
          </div>
        }
      >
        <BonusResults period={period} simulateWith={sim} />
      </Suspense>
      <p className="text-[12px] text-muted-foreground">
        Kolam = p% × max(0, LK aktual − LK dasar) × (poin Scorecard Cabang ÷ 4), dibagi sama rata ke penerima yang berhak (SP aktif atau tidak aktif dikecualikan). LK aktual = omzet (POS + Custom Cake + lain-lain) − HPP.
      </p>
    </div>
  );
}
