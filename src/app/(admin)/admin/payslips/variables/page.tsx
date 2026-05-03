export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { PayslipVariablesEditor } from "@/components/admin/PayslipVariablesEditor";
import { PayslipDisputesPanel } from "@/components/admin/PayslipDisputesPanel";
import { PayslipPaymentsTable, type PaymentRow } from "@/components/admin/PayslipPaymentsTable";
import { PayslipTabsNav, type PayslipView } from "@/components/admin/PayslipTabsNav";
import { PayslipViewPersist } from "@/components/admin/PayslipViewPersist";
import { CustomCakeBonusView } from "@/components/admin/CustomCakeBonusView";
import { getCustomCakeBonusMonth } from "@/lib/actions/custom-cake-bonus.actions";
import { listOpenPayslipDisputes } from "@/lib/actions/payslip-disputes.actions";
import type { PayslipSettings } from "@/lib/supabase/types";

interface SearchParams {
  month?: string;
  year?: string;
  scope?: string;
  view?: string;
}

export default async function PayslipVariablesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const today = new Date();
  const month = parseInt(sp.month ?? String(today.getMonth() + 1), 10);
  const year = parseInt(sp.year ?? String(today.getFullYear()), 10);
  const scope: "settings" | "monthly" =
    sp.scope === "monthly" ? "monthly" : "settings";
  const view: PayslipView =
    sp.view === "payments"
      ? "payments"
      : sp.view === "bonus-cake"
        ? "bonus-cake"
        : "variables";

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, full_name, email, business_unit")
    .eq("payslip_excluded", false)
    .order("business_unit", { ascending: true, nullsFirst: false })
    .order("full_name");

  const { data: settings } = await supabase
    .from("payslip_settings")
    .select("*");

  const { data: payslips } = await supabase
    .from("payslips")
    .select("*")
    .eq("month", month)
    .eq("year", year);

  // Deliverables fetch: hanya untuk payslips yang ada di bulan ini.
  // Group ke Map<payslip_id, rows[]> di client untuk lookup O(1).
  const payslipIds = (payslips ?? []).map((p) => p.id);
  const { data: deliverables } =
    payslipIds.length > 0
      ? await supabase
          .from("payslip_deliverables")
          .select("*")
          .in("payslip_id", payslipIds)
          .order("sort_order", { ascending: true })
      : { data: [] };

  // Extra-work logs for the period — admin pakai untuk per-entry editor
  // di monthly expand. Date range: bulan target (1st → end of month).
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const { data: extraWorkLogs } = await supabase
    .from("extra_work_logs")
    .select(
      "id, user_id, date, kind, notes, formula_override, custom_rate_idr, multiplier_override"
    )
    .gte("date", monthStart)
    .lt("date", monthEnd)
    .order("date", { ascending: true });

  const { data: kinds } = await supabase
    .from("extra_work_kinds")
    .select("name, formula_kind, fixed_rate_idr, daily_multiplier");
  const kindsByName: Record<
    string,
    { formulaKind: string; fixedRateIdr: number; dailyMultiplier: number }
  > = {};
  for (const k of kinds ?? []) {
    kindsByName[k.name] = {
      formulaKind: k.formula_kind,
      fixedRateIdr: Number(k.fixed_rate_idr ?? 0),
      dailyMultiplier: Number(k.daily_multiplier ?? 0),
    };
  }

  const settingsByUser = new Map(
    ((settings ?? []) as PayslipSettings[]).map((s) => [s.user_id, s])
  );
  const payslipByUser = new Map(
    (payslips ?? []).map((p) => [p.user_id, p])
  );
  const deliverablesByPayslip = new Map<string, typeof deliverables>();
  for (const d of deliverables ?? []) {
    const arr = deliverablesByPayslip.get(d.payslip_id) ?? [];
    arr.push(d);
    deliverablesByPayslip.set(d.payslip_id, arr);
  }

  const extraWorkByUser = new Map<string, typeof extraWorkLogs>();
  for (const log of extraWorkLogs ?? []) {
    const arr = extraWorkByUser.get(log.user_id) ?? [];
    arr.push(log);
    extraWorkByUser.set(log.user_id, arr);
  }

  const rows = (employees ?? []).map((emp) => {
    const ps = payslipByUser.get(emp.id) ?? null;
    return {
      userId: emp.id,
      fullName: emp.full_name ?? emp.email ?? "(tanpa nama)",
      businessUnit: emp.business_unit ?? null,
      settings: settingsByUser.get(emp.id) ?? null,
      payslip: ps,
      deliverables: ps ? (deliverablesByPayslip.get(ps.id) ?? []) : [],
      extraWorkLogs: extraWorkByUser.get(emp.id) ?? [],
    };
  });

  const monthLabel = new Date(year, month - 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  const openDisputes = await listOpenPayslipDisputes();
  const userMap = new Map(
    (employees ?? []).map((e) => [e.id, e.full_name ?? e.email ?? "(tanpa nama)"])
  );
  const disputesWithName = openDisputes.map((d) => ({
    ...d,
    userName: userMap.get(d.userId) ?? "(karyawan tidak diketahui)",
  }));

  // Pembayaran rows: only finalized payslips, joined with profile name + BU.
  const paymentRows: PaymentRow[] = rows
    .filter((r) => r.payslip?.status === "finalized")
    .map((r) => ({
      payslipId: r.payslip!.id,
      userId: r.userId,
      fullName: r.fullName,
      businessUnit: r.businessUnit,
      netTotal: Number(r.payslip!.net_total),
      employeeResponse:
        (r.payslip!.employee_response ?? "pending") as PaymentRow["employeeResponse"],
      employeeResponseMessage: r.payslip!.employee_response_message ?? null,
      employeeResponseAt: r.payslip!.employee_response_at ?? null,
      paymentStatus:
        (r.payslip!.payment_status ?? "unpaid") as PaymentRow["paymentStatus"],
      paymentAt: r.payslip!.payment_at ?? null,
      paymentNote: r.payslip!.payment_note ?? null,
    }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PayslipViewPersist />
      <PageHeader
        title="Slip gaji"
        subtitle={
          view === "payments"
            ? "Tracking respon karyawan + status pembayaran"
            : "Atur variabel payslip semua karyawan dalam satu tabel"
        }
      />

      <PayslipTabsNav current={view} />

      {view === "variables" && (
        <>
          <PayslipDisputesPanel disputes={disputesWithName} />

          <PayslipVariablesEditor
            rows={rows}
            scope={scope}
            month={month}
            year={year}
            monthLabel={monthLabel}
            kindsByName={kindsByName}
          />
        </>
      )}

      {view === "payments" && (
        <PayslipPaymentsTable
          rows={paymentRows}
          month={month}
          year={year}
          monthLabel={monthLabel}
        />
      )}

      {view === "bonus-cake" && (
        <CustomCakeBonusViewWrapper
          month={month}
          year={year}
          monthLabel={monthLabel}
        />
      )}
    </div>
  );
}

async function CustomCakeBonusViewWrapper({
  month,
  year,
  monthLabel,
}: {
  month: number;
  year: number;
  monthLabel: string;
}) {
  const data = await getCustomCakeBonusMonth(month, year);
  return (
    <CustomCakeBonusView
      month={month}
      year={year}
      monthLabel={monthLabel}
      days={data.days}
      totalBonus={data.totalBonus}
    />
  );
}
