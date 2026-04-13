"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatIDR } from "@/lib/utils/currency";
import { calculatePayslip } from "@/lib/actions/payslip.actions";
import { toast } from "sonner";
import { useTransition } from "react";
import type { Payslip } from "@/lib/supabase/types";

interface Summary {
  id: string;
  full_name: string;
  email: string;
  settings: { user_id: string; is_finalized: boolean } | null;
  payslip: Payslip | null;
}

interface PayslipOverviewTableProps {
  summaries: Summary[];
  month: number;
  year: number;
}

function StatusBadge({ settings, payslip }: { settings: Summary["settings"]; payslip: Summary["payslip"] }) {
  if (!settings) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f5f5f7", color: "#525252" }}>
        No settings
      </span>
    );
  }
  if (!settings.is_finalized) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fefce8", color: "#92400e" }}>
        Settings draft
      </span>
    );
  }
  if (!payslip) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fff7ed", color: "#b45309" }}>
        Not calculated
      </span>
    );
  }
  if (payslip.status === "finalized") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f0fdf4", color: "#15803d" }}>
        Finalized
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
      Draft
    </span>
  );
}

export function PayslipOverviewTable({ summaries, month, year }: PayslipOverviewTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function changeMonth(m: number, y: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    router.push(`${pathname}?${params.toString()}`);
  }

  function prevMonth() {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    changeMonth(m, y);
  }

  function nextMonth() {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    changeMonth(m, y);
  }

  function handleCalculateAll() {
    startTransition(async () => {
      const eligible = summaries.filter((s) => s.settings?.is_finalized);
      let count = 0;
      for (const s of eligible) {
        const result = await calculatePayslip(s.id, month, year);
        if (!result.error) count++;
      }
      toast.success(`Calculated ${count} payslip${count !== 1 ? "s" : ""}`);
      router.refresh();
    });
  }

  const monthLabel = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const employees = summaries.filter((s) => s.settings?.is_finalized !== undefined || s.payslip);

  return (
    <div className="space-y-3 max-w-full">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>&larr;</Button>
          <Label className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</Label>
          <Button variant="outline" size="sm" onClick={nextMonth}>&rarr;</Button>
        </div>
        <Button
          size="sm"
          onClick={handleCalculateAll}
          disabled={isPending}
          className="ml-auto"
        >
          {isPending ? "Calculating..." : "Calculate All"}
        </Button>
      </div>

      {summaries.length === 0 ? (
        <EmptyState icon="💰" title="No employees found" />
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-white max-w-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f5f5f7]">
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Employee</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Work Days</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Net Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => (
                <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/admin/payslips/${s.id}?month=${month}&year=${year}`} className="block">
                      <p className="font-medium text-sm">{s.full_name || s.email}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge settings={s.settings} payslip={s.payslip} />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {s.payslip
                      ? `${s.payslip.actual_work_days} / ${s.payslip.expected_work_days}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {s.payslip ? formatIDR(Number(s.payslip.net_total)) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
