export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getCurrentProfile } from "@/lib/supabase/cached";
import {
  getEmployeePayslips,
  getPayslipDeliverables,
  getPayslipSettings,
} from "@/lib/actions/payslip.actions";
import { listMyPayslipDisputes } from "@/lib/actions/payslip-disputes.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { PayslipBreakdownDetails } from "@/components/payslip/PayslipBreakdownDetails";
import { PayslipSettingsReview } from "@/components/payslip/PayslipSettingsReview";
import type { PayslipBreakdown } from "@/lib/supabase/types";
import { getDictionary } from "@/lib/i18n/server";

/** Field yang harus terisi sebelum karyawan boleh lihat payslip
 *  ter-finalize. Mirror PROFILE_SECTIONS di dashboard supaya gating
 *  konsisten dengan progress bar yang dilihat karyawan. */
const REQUIRED_PROFILE_KEYS = [
  "full_name",
  "gender",
  "date_of_birth",
  "place_of_birth",
  "domisili_provinsi",
  "domisili_kota",
  "domisili_kecamatan",
  "domisili_kelurahan",
  "domisili_alamat",
  "asal_provinsi",
  "asal_kota",
  "asal_kecamatan",
  "asal_kelurahan",
  "asal_alamat",
  "business_unit",
  "job_role",
  "whatsapp_number",
  "npwp",
  "emergency_contact_name",
  "emergency_contact_whatsapp",
] as const;

export default async function EmployeePayslipsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  const missingFields = REQUIRED_PROFILE_KEYS.filter((k) => {
    const v = (profile as Record<string, unknown> | null)?.[k];
    return typeof v === "string" ? v.trim().length === 0 : !v;
  });
  const profileComplete = missingFields.length === 0;
  const completionPct = Math.round(
    ((REQUIRED_PROFILE_KEYS.length - missingFields.length) /
      REQUIRED_PROFILE_KEYS.length) *
      100
  );

  const [payslips, settings, disputes] = profileComplete
    ? await Promise.all([
        getEmployeePayslips(user.id),
        getPayslipSettings(user.id),
        listMyPayslipDisputes(),
      ])
    : [[], null, []];
  const deliverablesByPayslip = new Map(
    await Promise.all(
      payslips.map(
        async (p) => [p.id, await getPayslipDeliverables(p.id)] as const
      )
    )
  );
  const { lang, t } = await getDictionary();

  // Show locked state kalau profile belum lengkap, ATAU kalau profile
  // sudah lengkap tapi memang belum ada finalisasi sama sekali.
  const showLocked = !profileComplete || payslips.length === 0;

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title={t.payslipsPage.title}
        subtitle={t.payslipsPage.subtitle}
      />

      {profileComplete && settings && (
        <PayslipSettingsReview
          settings={{
            monthlyFixedAmount: Number(settings.monthly_fixed_amount),
            calculationBasis: settings.calculation_basis,
            attendanceWeightPct: Number(settings.attendance_weight_pct),
            deliverablesWeightPct: Number(settings.deliverables_weight_pct),
            expectedDaysMode: settings.expected_days_mode,
            expectedWorkDays: settings.expected_work_days,
            expectedWeekdays: settings.expected_weekdays ?? [],
          }}
          disputes={disputes}
        />
      )}

      {showLocked ? (
        <LockedNotice
          profileComplete={profileComplete}
          completionPct={completionPct}
          missingCount={missingFields.length}
        />
      ) : (
        <div className="space-y-3">
          {payslips.map((p) => {
            const monthLabel = new Date(p.year, p.month - 1).toLocaleDateString(
              lang === "id" ? "id-ID" : "en-US",
              { month: "long", year: "numeric" }
            );
            return (
              <Card key={p.id} className="card-wiggle">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold">
                      {monthLabel}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-display font-bold uppercase tracking-wider border-2 border-foreground bg-quaternary text-foreground">
                      {t.payslipsPage.finalized}
                    </span>
                  </div>

                  <div className="space-y-1 text-sm">
                    {Number(p.base_salary) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t.payslipsPage.monthlyStandardSalary}
                        </span>
                        <span>{formatIDR(Number(p.base_salary))}</span>
                      </div>
                    )}
                    {Number(p.prorated_salary) > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t.payslipsPage.workDays}
                          </span>
                          <span>
                            {p.actual_work_days} / {p.expected_work_days}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {p.actual_work_days > p.expected_work_days
                              ? t.payslipsPage.proratedSalaryExtra
                              : t.payslipsPage.proratedSalary}
                          </span>
                          <span>{formatIDR(Number(p.prorated_salary))}</span>
                        </div>
                      </>
                    )}
                    {Number(p.overtime_pay) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t.payslipsPage.overtimePay}
                        </span>
                        <span className="text-quaternary font-bold">
                          + {formatIDR(Number(p.overtime_pay))}
                        </span>
                      </div>
                    )}
                    {Number(p.late_penalty) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t.payslipsPage.latePenalty}
                        </span>
                        <span className="text-destructive font-bold">
                          - {formatIDR(Number(p.late_penalty))}
                        </span>
                      </div>
                    )}
                    {Number(p.deliverables_pay) > 0 && (
                      <>
                        {(deliverablesByPayslip.get(p.id) ?? []).map((d) => {
                          const target = Number(d.target);
                          const real = Number(d.realization);
                          const ach = target > 0 ? (real / target) * 100 : 0;
                          return (
                            <div
                              key={d.id}
                              className="flex justify-between text-xs"
                            >
                              <span className="text-muted-foreground pl-2">
                                {d.name} ({real}/{target},{" "}
                                {Number(d.weight_pct)}%)
                              </span>
                              <span>{ach.toFixed(1)}%</span>
                            </div>
                          );
                        })}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t.payslipsPage.deliverables} (
                            {Number(p.deliverables_achievement_pct).toFixed(1)}%)
                          </span>
                          <span className="text-quaternary font-bold">
                            + {formatIDR(Number(p.deliverables_pay))}
                          </span>
                        </div>
                      </>
                    )}
                    {Number(p.monthly_bonus) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t.payslipsPage.monthlyBonus}
                          {p.monthly_bonus_note
                            ? ` (${p.monthly_bonus_note})`
                            : ""}
                        </span>
                        <span className="text-quaternary font-bold">
                          + {formatIDR(Number(p.monthly_bonus))}
                        </span>
                      </div>
                    )}
                    {Number(p.debt_deduction) > 0 && (
                      <div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t.payslipsPage.debtDeduction}
                          </span>
                          <span className="text-destructive font-bold">
                            - {formatIDR(Number(p.debt_deduction))}
                          </span>
                        </div>
                        {p.debt_deduction_note && (
                          <pre className="text-[10px] text-muted-foreground/80 leading-snug whitespace-pre-wrap font-sans pl-3 mt-0.5">
                            {p.debt_deduction_note}
                          </pre>
                        )}
                      </div>
                    )}
                    {Number(p.other_penalty) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t.payslipsPage.otherPenalty}
                          {p.other_penalty_note
                            ? ` (${p.other_penalty_note})`
                            : ""}
                        </span>
                        <span className="text-destructive font-bold">
                          - {formatIDR(Number(p.other_penalty))}
                        </span>
                      </div>
                    )}
                  </div>

                  {p.breakdown_json && (
                    <PayslipBreakdownDetails
                      breakdown={p.breakdown_json as PayslipBreakdown}
                      totalOvertimePay={Number(p.overtime_pay)}
                      totalLatePenalty={Number(p.late_penalty)}
                      totalExtraWorkPay={Number(p.extra_work_pay)}
                    />
                  )}

                  <div className="flex items-center justify-between p-3 rounded-2xl border-2 border-foreground bg-primary text-primary-foreground shadow-hard">
                    <span className="font-display text-sm font-bold uppercase tracking-wide">
                      {t.payslipsPage.netTotal}
                    </span>
                    <span className="font-display text-lg font-extrabold tabular-nums">
                      {formatIDR(Number(p.net_total))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LockedNotice({
  profileComplete,
  completionPct,
  missingCount,
}: {
  profileComplete: boolean;
  completionPct: number;
  missingCount: number;
}) {
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-4">
        <div className="inline-flex items-center justify-center size-16 rounded-full border-2 border-foreground bg-warning shadow-hard-sm">
          <span className="text-3xl">{profileComplete ? "💰" : "🔒"}</span>
        </div>
        {profileComplete ? (
          <>
            <h3 className="font-display text-lg font-bold">
              Belum ada slip gaji
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Admin belum men-finalize slip gaji apapun untuk kamu. Slip
              gaji akan muncul di sini setelah admin men-finalize-nya
              pada akhir periode.
            </p>
          </>
        ) : (
          <>
            <h3 className="font-display text-lg font-bold">
              Lengkapi profile dulu
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Slip gaji terkunci sampai profile kamu lengkap.
              Tinggal{" "}
              <strong className="text-foreground">{missingCount} field</strong>{" "}
              lagi yang belum diisi (saat ini{" "}
              <strong className="text-foreground">{completionPct}%</strong>{" "}
              lengkap). Buka dashboard untuk lihat field mana yang
              kosong.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm border-2 border-foreground shadow-hard hover:bg-primary/90 transition"
            >
              Lengkapi profile →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
