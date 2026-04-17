"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface Employee {
  id: string;
  full_name: string;
  email: string;
}

interface AttendanceFiltersProps {
  startDate: string;
  endDate: string;
  selectedUserId: string;
  employees: Employee[];
}

export function AttendanceFilters({
  startDate,
  endDate,
  selectedUserId,
  employees,
}: AttendanceFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v) params.set(k, v);
        else params.delete(k);
      });
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  function clearFilters() {
    router.push(pathname);
  }

  const hasFilters =
    searchParams.has("userId") ||
    searchParams.has("start") ||
    searchParams.has("end");

  return (
    <div className="bg-card rounded-2xl border-2 border-foreground shadow-hard p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Date range */}
        <div className="space-y-2">
          <Label>From</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => updateParams({ start: e.target.value })}
            className="text-sm h-10"
          />
        </div>
        <div className="space-y-2">
          <Label>To</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => updateParams({ end: e.target.value })}
            className="text-sm h-10"
          />
        </div>

        {/* Employee dropdown */}
        <div className="space-y-2">
          <Label>Employee</Label>
          <select
            value={selectedUserId || "all"}
            onChange={(e) => updateParams({ userId: e.target.value === "all" ? "" : e.target.value })}
            className={cn(
              "flex w-full items-center rounded-xl border-2 border-border bg-white px-3.5 py-2 text-sm font-medium h-10 outline-none transition-all",
              "focus-visible:border-primary focus-visible:shadow-hard-violet"
            )}
          >
            <option value="all">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name || emp.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasFilters && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs text-muted-foreground h-7 gap-1"
          >
            <X size={12} />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
