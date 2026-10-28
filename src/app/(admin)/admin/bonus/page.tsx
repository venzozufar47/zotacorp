export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { getBonusQuarter } from "@/lib/actions/bonus.actions";
import { isValidPeriod, quarterOf } from "@/lib/bonus/periods";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { BonusMonthNav } from "@/components/admin/bonus/BonusMonthNav";
import { BonusParametersCard } from "@/components/admin/bonus/BonusParametersCard";
import { BonusResults } from "@/components/admin/bonus/BonusResults";

/**
 * Kalkulator Bonus Tim: owner menentukan p & LK dasar per kuartal, lalu menggeser bulan untuk melihat hitungan bonus
 * koordinator toko & kepala produksi (otomatis). Bulan yang sudah selesai bisa diterbitkan.
 */
export default async function AdminBonusPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const thisMonth = jakartaDateString(new Date()).slice(0, 7);
  const sp = await searchParams;
  const period = isValidPeriod(sp.bulan) && sp.bulan <= thisMonth ? sp.bulan : thisMonth;
  const quarter = await getBonusQuarter(quarterOf(period));

  return (
    <div className="space-y-5 p-4 animate-fade-up">
      <PageHeader title="Kalkulator Bonus" subtitle="Bonus koordinator toko & kepala produksi — dihitung otomatis dari omzet, HPP, dan scorecard." />
      <BonusMonthNav period={period} thisMonth={thisMonth} published={quarter?.publishedPeriods ?? []} />
      {quarter && <BonusParametersCard key={quarter.quarter} view={quarter} />}
      <Suspense
        key={period}
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[34rem]" />
            <Skeleton className="h-[34rem]" />
          </div>
        }
      >
        <BonusResults period={period} />
      </Suspense>
      <p className="text-[12px] text-muted-foreground">
        Kolam = p% × max(0, LK aktual − LK dasar) × (poin scorecard ÷ 4), dibagi menurut jam hadir penerima. LK aktual = omzet (POS + Custom Cake + lain-lain) − HPP.
      </p>
    </div>
  );
}
