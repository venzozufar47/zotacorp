"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ViewModeSwitch } from "./PayslipViewModeSwitch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatRp as formatIDR } from "@/lib/cashflow/format";
import { calculatePayslip } from "@/lib/actions/payslip.actions";
import { toast } from "sonner";
import { useState, useTransition } from "react";
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
    return <Badge variant="muted" className="text-[10px]">No settings</Badge>;
  }
  if (!settings.is_finalized) {
    return <Badge variant="tertiary" className="text-[10px]">Settings draft</Badge>;
  }
  if (!payslip) {
    return <Badge variant="tertiary" className="text-[10px]">Not calculated</Badge>;
  }
  if (payslip.status === "finalized") {
    return <Badge variant="quaternary" className="text-[10px]">Finalized</Badge>;
  }
  return <Badge variant="default" className="text-[10px]">Draft</Badge>;
}

export function PayslipOverviewTable({ summaries, month, year }: PayslipOverviewTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );

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
      setProgress({ done: 0, total: eligible.length });
      let count = 0;
      for (let i = 0; i < eligible.length; i += 1) {
        const result = await calculatePayslip(eligible[i].id, month, year);
        if (!result.error) count++;
        setProgress({ done: i + 1, total: eligible.length });
      }
      setProgress(null);
      toast.success(`Calculated ${count} payslip${count !== 1 ? "s" : ""}`);
      router.refresh();
    });
  }

  const monthLabel = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4 max-w-full">
      <ViewModeSwitch current="employee" />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={prevMonth}>&larr;</Button>
          <Label className="!text-sm !font-display !font-extrabold !uppercase !tracking-wide min-w-[140px] !justify-center text-center">{monthLabel}</Label>
          <Button variant="outline" size="icon-sm" onClick={nextMonth}>&rarr;</Button>
        </div>
        <Button
          size="sm"
          onClick={handleCalculateAll}
          disabled={isPending}
          loading={isPending}
          className="ml-auto"
        >
          {progress
            ? `Calculating ${progress.done} / ${progress.total}…`
            : isPending
              ? "Calculating…"
              : "Calculate All"}
        </Button>
      </div>

      {summaries.length === 0 ? (
        <EmptyState icon="💰" title="No employees found" />
      ) : (
        <div className="overflow-x-auto max-w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Work Days</TableHead>
                <TableHead className="text-right">Net Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => (
                <TableRow key={s.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/admin/payslips/${s.id}?month=${month}&year=${year}`} className="block">
                      <p className="font-display font-bold text-sm">{s.full_name || s.email}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge settings={s.settings} payslip={s.payslip} />
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">
                    {s.payslip
                      ? `${s.payslip.actual_work_days} / ${s.payslip.expected_work_days}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-display font-bold tabular-nums">
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
