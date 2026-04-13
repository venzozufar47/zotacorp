export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getEmployeePayslips } from "@/lib/actions/payslip.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { formatIDR } from "@/lib/utils/currency";

export default async function EmployeePayslipsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const payslips = await getEmployeePayslips(user.id);

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title="My Payslips"
        subtitle="Your finalized monthly payslips"
      />

      {payslips.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <p className="text-3xl mb-2">💰</p>
            <p className="text-sm text-muted-foreground">No finalized payslips yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payslips.map((p) => {
            const monthLabel = new Date(p.year, p.month - 1).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            });
            return (
              <Card key={p.id} className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{monthLabel}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f0fdf4", color: "#15803d" }}>
                      Finalized
                    </span>
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Work Days</span>
                      <span>{p.actual_work_days} / {p.expected_work_days}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prorated Salary</span>
                      <span>{formatIDR(Number(p.prorated_salary))}</span>
                    </div>
                    {Number(p.extra_day_bonus) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Extra Day Bonus</span>
                        <span className="text-green-700">+ {formatIDR(Number(p.extra_day_bonus))}</span>
                      </div>
                    )}
                    {Number(p.overtime_pay) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Overtime Pay</span>
                        <span className="text-green-700">+ {formatIDR(Number(p.overtime_pay))}</span>
                      </div>
                    )}
                    {Number(p.late_penalty) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Late Penalty</span>
                        <span className="text-red-600">- {formatIDR(Number(p.late_penalty))}</span>
                      </div>
                    )}
                    {Number(p.monthly_bonus) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Monthly Bonus{p.monthly_bonus_note ? ` (${p.monthly_bonus_note})` : ""}
                        </span>
                        <span className="text-green-700">+ {formatIDR(Number(p.monthly_bonus))}</span>
                      </div>
                    )}
                    {Number(p.debt_deduction) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Debt Deduction</span>
                        <span className="text-red-600">- {formatIDR(Number(p.debt_deduction))}</span>
                      </div>
                    )}
                    {Number(p.other_penalty) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Other Penalty{p.other_penalty_note ? ` (${p.other_penalty_note})` : ""}
                        </span>
                        <span className="text-red-600">- {formatIDR(Number(p.other_penalty))}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "var(--primary)", color: "white" }}>
                    <span className="text-xs font-semibold">Net Total</span>
                    <span className="text-base font-bold">{formatIDR(Number(p.net_total))}</span>
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
