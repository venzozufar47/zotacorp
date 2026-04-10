"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { MapPin, MapPinOff, Clock } from "lucide-react";
import { PasswordConfirmModal } from "./PasswordConfirmModal";
import { OvertimePromptModal } from "./OvertimePromptModal";
import { checkIn, checkOut } from "@/lib/actions/attendance.actions";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import type { AttendanceLog, AttendanceSettings } from "@/lib/supabase/types";
import { formatTime } from "@/lib/utils/date";
import { StatusBadge } from "./StatusBadge";

interface CheckInButtonProps {
  todayLog: AttendanceLog | null;
  settings: AttendanceSettings | null;
  isFlexible?: boolean;
  onSuccess?: () => void;
}

type AttendanceState = "idle" | "checked-in" | "checked-out";

function getState(log: AttendanceLog | null): AttendanceState {
  if (!log) return "idle";
  if (!log.checked_out_at) return "checked-in";
  return "checked-out";
}

export function CheckInButton({
  todayLog,
  settings,
  isFlexible = false,
  onSuccess,
}: CheckInButtonProps) {
  const [log, setLog] = useState<AttendanceLog | null>(todayLog);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"check-in" | "check-out">("check-in");
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { status: geoStatus, requestLocation } = useGeolocation();

  const state = getState(log);

  function openCheckIn() {
    setModalAction("check-in");
    setModalOpen(true);
  }

  function openCheckOut() {
    setModalAction("check-out");
    setModalOpen(true);
  }

  /** Check if current time is past work end time */
  function isPastEndTime(): boolean {
    if (!settings || isFlexible) return false;
    try {
      const now = new Date();
      const localNow = new Date(
        now.toLocaleString("en-US", { timeZone: settings.timezone })
      );
      const [endH, endM] = settings.work_end_time.split(":").map(Number);
      const endTime = new Date(localNow);
      endTime.setHours(endH, endM, 0, 0);
      return localNow > endTime;
    } catch {
      return false;
    }
  }

  async function handleCheckIn() {
    startTransition(async () => {
      const coords = await requestLocation();

      const result = await checkIn({
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      if (result?.data) {
        setLog(result.data as AttendanceLog);
        const status = (result.data as AttendanceLog).status;

        if (status === "late") {
          const mins = (result.data as AttendanceLog).late_minutes;
          toast.warning(`Checked in — Late by ${mins} minute${mins !== 1 ? "s" : ""}`);
        } else {
          toast.success("Checked in! Have a great day 🎉");
        }

        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#005a65", "#007a88", "#34c759", "#fff"],
        });

        onSuccess?.();
      }
    });
  }

  async function handleCheckOutAttempt() {
    // If past end time and not flexible, show overtime prompt
    if (isPastEndTime()) {
      setOvertimeOpen(true);
      return;
    }

    // Normal checkout
    await performCheckOut(false, "");
  }

  async function handleOvertimeDecision(isOvertime: boolean, reason: string) {
    setOvertimeOpen(false);
    await performCheckOut(isOvertime, reason);
  }

  async function performCheckOut(isOvertime: boolean, overtimeReason: string) {
    startTransition(async () => {
      const result = await checkOut({
        isOvertime,
        overtimeReason,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      if (result?.data) {
        setLog(result.data as AttendanceLog);
        if (isOvertime && (result.data as AttendanceLog).overtime_minutes > 0) {
          const mins = (result.data as AttendanceLog).overtime_minutes;
          const hrs = Math.round((mins / 60) * 10) / 10;
          toast.success(`Checked out! Overtime request submitted (${hrs}h)`);
        } else {
          toast.success("Checked out! See you tomorrow ✌️");
        }
        onSuccess?.();
      }
    });
  }

  const locationIcon =
    geoStatus === "granted" ? (
      <MapPin size={14} className="inline-block mr-1" style={{ color: "var(--success)" }} />
    ) : geoStatus === "denied" || geoStatus === "unavailable" ? (
      <MapPinOff size={14} className="inline-block mr-1 opacity-40" />
    ) : null;

  return (
    <>
      <div className="w-full space-y-3">
        {state === "idle" && (
          <button
            className="btn-checkin w-full pulse-primary flex items-center justify-center gap-2"
            onClick={openCheckIn}
            disabled={isPending}
          >
            {isPending ? (
              <span className="animate-pulse">Processing…</span>
            ) : (
              <>
                <Clock size={20} />
                Check In
              </>
            )}
          </button>
        )}

        {state === "checked-in" && (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
              <Clock size={14} style={{ color: "var(--primary)" }} />
              <span>
                Checked in at{" "}
                <span className="font-semibold text-foreground">
                  {formatTime(log!.checked_in_at)}
                </span>
              </span>
              <StatusBadge status={log!.status} lateMinutes={log!.late_minutes} />
              {log?.latitude && (
                <span className="flex items-center gap-0.5 ml-auto">
                  <MapPin size={13} style={{ color: "var(--primary)" }} />
                  <span className="text-xs">Location saved</span>
                </span>
              )}
            </div>
            <button
              className="btn-checkout w-full flex items-center justify-center gap-2"
              onClick={openCheckOut}
              disabled={isPending}
            >
              {isPending ? (
                <span className="animate-pulse">Processing…</span>
              ) : (
                <>
                  <Clock size={20} />
                  Check Out
                </>
              )}
            </button>
          </>
        )}

        {state === "checked-out" && (
          <div className="w-full h-[72px] rounded-[20px] bg-[#f5f5f7] flex flex-col items-center justify-center gap-1">
            <span className="text-2xl">✅</span>
            <span className="text-sm font-medium text-muted-foreground">
              Attendance complete for today
            </span>
          </div>
        )}

        {/* Location status hint — only shown before check-in */}
        {state === "idle" && (
          <p className="text-xs text-center text-muted-foreground">
            {locationIcon}
            {geoStatus === "idle" || geoStatus === "requesting"
              ? "Location will be requested on check-in"
              : geoStatus === "granted"
              ? "Location will be recorded"
              : "Check-in works without location"}
          </p>
        )}
      </div>

      <PasswordConfirmModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        action={modalAction}
        onConfirm={modalAction === "check-in" ? handleCheckIn : handleCheckOutAttempt}
      />

      <OvertimePromptModal
        open={overtimeOpen}
        onOpenChange={setOvertimeOpen}
        onConfirm={handleOvertimeDecision}
      />
    </>
  );
}
