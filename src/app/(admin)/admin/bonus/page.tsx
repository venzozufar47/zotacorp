export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { getBonusQuarter } from "@/lib/actions/bonus.actions";
import { isValidPeriod, periodLabel, quarterLabel, quarterOf } from "@/lib/bonus/periods";
import { HubTabs } from "@/components/admin/karyawan/HubTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BonusMonthNav } from "@/components/admin/bonus/BonusMonthNav";
import { BonusParametersCard } from "@/components/admin/bonus/BonusParametersCard";
import { BonusResults } from "@/components/admin/bonus/BonusResults";
import { BonusVerification } from "@/components/admin/bonus/BonusVerification";

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
      <HubTabs active="gaji" />
      <div>
        <h2 className="text-sm font-semibold text-foreground">Kalkulator bonus</h2>
        <p className="text-sm text-muted-foreground">
          Bonus koordinator toko dan kepala produksi, dihitung dari omzet, HPP, dan scorecard.
        </p>
      </div>
      <BonusMonthNav period={period} thisMonth={thisMonth} published={quarter?.publishedPeriods ?? []} sim={sim} />
      {sim && (
        <div role="status" className="rounded-xl border-2 border-warning/60 bg-warning/10 px-4 py-2.5 text-[13px] text-warning">
          <strong>Simulasi:</strong> parameter {quarterLabel(sim)} diterapkan pada {periodLabel(period)}. Hanya tampilan — tidak tersimpan, tidak bisa
          diterbitkan, dan tidak masuk slip gaji.
        </div>
      )}
      {quarter && <BonusParametersCard key={quarter.quarter} view={quarter} period={period} sim={sim} />}
      {/* Verifikasi tutup buku: hanya untuk bulan yang sudah selesai, belum terbit, dan bukan simulasi. */}
      {!sim && period < thisMonth && !(quarter?.publishedPeriods ?? []).includes(period) && (
        <Suspense key={`v|${period}`} fallback={<Skeleton className="h-16" />}>
          <BonusVerification period={period} />
        </Suspense>
      )}
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
