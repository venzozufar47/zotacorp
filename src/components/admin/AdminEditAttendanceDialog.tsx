"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminUpdateAttendanceLog } from "@/lib/actions/attendance.actions";
import { formatTime, formatLocalDate } from "@/lib/utils/date";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: {
    id: string;
    date: string;
    checked_in_at: string;
    checked_out_at: string | null;
    status: string;
    late_minutes: number;
    is_overtime: boolean;
    overtime_minutes: number;
    overtime_status: string | null;
    late_checkout_reason: string | null;
    late_proof_admin_note: string | null;
    employeeName: string;
  } | null;
  timezone?: string;
}

const STATUS_OPTIONS = [
  { value: "on_time", label: "On time" },
  { value: "late", label: "Late" },
  { value: "late_excused", label: "Late (excused)" },
  { value: "flexible", label: "Flexible" },
] as const;

const OVERTIME_STATUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

/**
 * Admin-only: overwrite row attendance_logs. Dipakai saat karyawan
 * record salah jam (contoh case: sign in 10:00, sign out 21:00 dari
 * rumah padahal pulang jam 18:00, butuh koreksi oleh admin).
 */
export function AdminEditAttendanceDialog({
  open,
  onOpenChange,
  row,
  timezone,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [status, setStatus] = useState<string>("on_time");
  const [lateMin, setLateMin] = useState<string>("");
  const [isOvertime, setIsOvertime] = useState(false);
  const [otMin, setOtMin] = useState<string>("");
  const [otStatus, setOtStatus] = useState<string>("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!row) return;
    setCheckIn(formatTime(row.checked_in_at, timezone));
    setCheckOut(
      row.checked_out_at ? formatTime(row.checked_out_at, timezone) : ""
    );
    setStatus(row.status || "on_time");
    setLateMin(String(row.late_minutes ?? 0));
    setIsOvertime(row.is_overtime);
    setOtMin(String(row.overtime_minutes ?? 0));
    setOtStatus(row.overtime_status ?? "");
    setReason(row.late_checkout_reason ?? "");
  }, [row, timezone]);

  function handleSave() {
    if (!row) return;
    startTransition(async () => {
      const res = await adminUpdateAttendanceLog({
        attendanceLogId: row.id,
        checkInTime: checkIn || undefined,
        checkOutTime: checkOut === "" ? null : checkOut,
        status: status as "on_time" | "late" | "late_excused" | "flexible",
        lateMinutes: lateMin === "" ? 0 : Number(lateMin),
        isOvertime,
        overtimeMinutes: otMin === "" ? 0 : Number(otMin),
        overtimeStatus:
          otStatus === "" ? null : (otStatus as "approved" | "pending" | "rejected"),
        lateCheckoutReason: reason,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Data presensi diperbarui.");
      onOpenChange(false);
      router.refresh();
    });
  }

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit data presensi</DialogTitle>
          <DialogDescription>
            {row.employeeName} · {formatLocalDate(row.date)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Check-in</Label>
            <Input
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Check-out</Label>
            <Input
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              placeholder="Kosongkan untuk unset"
            />
            <p className="text-[10px] text-muted-foreground">
              Kosongkan buat hapus checkout (karyawan bisa pakai Late
              Checkout dialog setelahnya).
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Late minutes</Label>
            <Input
              type="number"
              min={0}
              value={lateMin}
              onChange={(e) => setLateMin(e.target.value)}
            />
          </div>

          <div className="col-span-2 border-t border-border pt-3 space-y-1">
            <Label className="text-xs flex items-center gap-2">
              <input
                type="checkbox"
                checked={isOvertime}
                onChange={(e) => setIsOvertime(e.target.checked)}
                className="size-4 accent-primary"
              />
              Overtime
            </Label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Overtime minutes</Label>
            <Input
              type="number"
              min={0}
              value={otMin}
              onChange={(e) => setOtMin(e.target.value)}
              disabled={!isOvertime}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Overtime status</Label>
            <select
              value={otStatus}
              onChange={(e) => setOtStatus(e.target.value)}
              disabled={!isOvertime}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:bg-muted"
            >
              {OVERTIME_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Catatan</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Mis. Izin sakit, alasan overtime, koreksi jam pulang…"
            />
            <p className="text-[10px] text-muted-foreground">
              Catatan ini terlihat oleh karyawan di history mereka dan di
              recap admin.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
