import { MapPin } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  formatLocalDate,
  formatTime,
  getDurationHours,
  getDurationHoursDecimal,
} from "@/lib/utils/date";

interface AttendanceRow {
  id: string;
  date: string;
  checked_in_at: string;
  checked_out_at: string | null;
  latitude: number | null;
  longitude: number | null;
  profiles: {
    full_name: string;
    email: string;
    department: string;
    position: string;
  };
}

interface AttendanceRecapTableProps {
  rows: AttendanceRow[];
  count: number;
  page: number;
  pageSize: number;
}

export function AttendanceRecapTable({
  rows,
  count,
  page,
  pageSize,
}: AttendanceRecapTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No records found"
        description="Try adjusting your filters."
      />
    );
  }

  const totalPages = Math.ceil(count / pageSize);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {count} record{count !== 1 ? "s" : ""} · page {page} of {totalPages}
      </p>

      <div className="rounded-xl border overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f5f5f7]">
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Employee</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Department</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-in</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-out</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Hours</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isOpen = !row.checked_out_at;
              const hours = getDurationHoursDecimal(
                row.checked_in_at,
                row.checked_out_at
              );
              return (
                <TableRow
                  key={row.id}
                  className={isOpen ? "bg-orange-50/50" : "hover:bg-[#f5f5f7]/40"}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{row.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{row.profiles.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{row.profiles.department}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatLocalDate(row.date)}
                  </TableCell>
                  <TableCell className="text-sm">{formatTime(row.checked_in_at)}</TableCell>
                  <TableCell className="text-sm">
                    {row.checked_out_at ? formatTime(row.checked_out_at) : "—"}
                  </TableCell>
                  <TableCell className="text-sm font-semibold">
                    {hours > 0 ? `${hours}h` : "—"}
                  </TableCell>
                  <TableCell>
                    {isOpen ? (
                      <Badge
                        className="text-[10px] px-2"
                        style={{ background: "#fff7ed", color: "#ff9f0a", border: "none" }}
                      >
                        Open
                      </Badge>
                    ) : (
                      <Badge
                        className="text-[10px] px-2"
                        style={{ background: "#f0fdf4", color: "#34c759", border: "none" }}
                      >
                        Complete
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.latitude ? (
                      <a
                        href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs"
                        style={{ color: "var(--primary)" }}
                      >
                        <MapPin size={12} />
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
