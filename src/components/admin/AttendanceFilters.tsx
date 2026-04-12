"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Date range */}
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => updateParams({ start: e.target.value })}
            className="text-sm h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => updateParams({ end: e.target.value })}
            className="text-sm h-9"
          />
        </div>

        {/* Employee dropdown */}
        <div className="space-y-1">
          <Label className="text-xs">Employee</Label>
          <Select
            value={selectedUserId || "all"}
            onValueChange={(v) => updateParams({ userId: v === "all" ? "" : (v ?? "") })}
          >
            <SelectTrigger className="text-sm h-9">
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.full_name || emp.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
