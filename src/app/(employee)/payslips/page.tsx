export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getEmployeePayslips, getPayslipDeliverables } from "@/lib/actions/payslip.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { PayslipBreakdownDetails } from "@/components/payslip/PayslipBreakdownDetails";
import type { PayslipBreakdown } from "@/lib/supabase/types";
import { getDictionary } from "@/lib/i18n/server";

export default async function EmployeePayslipsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const payslips = await getEmployeePayslips(user.id);
  const deliverablesByPayslip = new Map(
    await Promise.all(
      payslips.map(async (p) => [p.id, await getPayslipDeliverables(p.id)] as const)
    )
  );
  const { lang, t } = await getDictionary();

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title={t.payslipsPage.title}
        subtitle={t.payslipsPage.subtitle}
      />

      {payslips.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="inline-flex items-center justify-center size-16 rounded-full border-2 border-foreground bg-tertiary shadow-hard-sm mb-3">
              <span className="text-3xl">💰</span>
            </div>
            <p className="text-sm text-muted-foreground font-medium">{t.payslipsPage.emptyState}</p>
          </CardContent>
        </Card>
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
                    <h3 className="font-display text-base font-bold">{monthLabel}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-display font-bold uppercase tracking-wider border-2 border-foreground bg-quaternary text-foreground">
                      {t.payslipsPage.finalized}
                    </span>
                  </div>

                  <div className="space-y-1 text-sm">
                    {Number(p.base_salary) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t.payslipsPage.monthlyStandardSalary}</span>
                        <span>{formatIDR(Number(p.base_salary))}</span>
                      </div>
                    )}
                    {Number(p.prorated_salary) > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t.payslipsPage.workDays}</span>
                          <span>{p.actual_work_days} / {p.expected_work_days}</span>
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
                        <span className="text-muted-foreground">{t.payslipsPage.overtimePay}</span>
                        <span className="text-quaternary font-bold">+ {formatIDR(Number(p.overtime_pay))}</span>
                      </div>
                    )}
                    {Number(p.late_penalty) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t.payslipsPage.latePenalty}</span>
                        <span className="text-destructive font-bold">- {formatIDR(Number(p.late_penalty))}</span>
                      </div>
                    )}
                    {Number(p.deliverables_pay) > 0 && (
                      <>
                        {(deliverablesByPayslip.get(p.id) ?? []).map((d) => {
                          const target = Number(d.target);
                          const real = Number(d.realization);
                          const ach = target > 0 ? (real / target) * 100 : 0;
                          return (
                            <div key={d.id} className="flex justify-between text-xs">
                              <span className="text-muted-foreground pl-2">
                                {d.name} ({real}/{target}, {Number(d.weight_pct)}%)
                              </span>
                              <span>{ach.toFixed(1)}%</span>
                            </div>
                          );
                        })}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t.payslipsPage.deliverables} ({Number(p.deliverables_achievement_pct).toFixed(1)}%)
                          </span>
                          <span className="text-quaternary font-bold">+ {formatIDR(Number(p.deliverables_pay))}</span>
                        </div>
                      </>
                    )}
                    {Number(p.monthly_bonus) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t.payslipsPage.monthlyBonus}{p.monthly_bonus_note ? ` (${p.monthly_bonus_note})` : ""}
                        </span>
                        <span className="text-quaternary font-bold">+ {formatIDR(Number(p.monthly_bonus))}</span>
                      </div>
                    )}
                    {Number(p.debt_deduction) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t.payslipsPage.debtDeduction}</span>
                        <span className="text-destructive font-bold">- {formatIDR(Number(p.debt_deduction))}</span>
                      </div>
                    )}
                    {Number(p.other_penalty) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t.payslipsPage.otherPenalty}{p.other_penalty_note ? ` (${p.other_penalty_note})` : ""}
                        </span>
                        <span className="text-destructive font-bold">- {formatIDR(Number(p.other_penalty))}</span>
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
                    <span className="font-display text-sm font-bold uppercase tracking-wide">{t.payslipsPage.netTotal}</span>
                    <span className="font-display text-lg font-extrabold tabular-nums">{formatIDR(Number(p.net_total))}</span>
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
