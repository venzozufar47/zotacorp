"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface AttendanceFiltersProps {
  startDate: string;
  endDate: string;
  search: string;
}

export function AttendanceFilters({
  startDate,
  endDate,
  search,
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
      params.delete("page"); // reset page on filter change
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  function clearFilters() {
    router.push(pathname);
  }

  const hasFilters =
    searchParams.has("search") ||
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

        {/* Search */}
        <div className="space-y-1">
          <Label className="text-xs">Search name</Label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Employee name…"
              value={search}
              onChange={(e) => updateParams({ search: e.target.value })}
              className="pl-8 text-sm h-9"
            />
          </div>
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
