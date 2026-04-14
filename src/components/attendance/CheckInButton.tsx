"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { MapPin, MapPinOff, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PasswordConfirmModal } from "./PasswordConfirmModal";
import { checkIn, checkOut } from "@/lib/actions/attendance.actions";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import type { AttendanceLog, AttendanceSettings } from "@/lib/supabase/types";
import { formatTime, formatMinutesHuman } from "@/lib/utils/date";
import { StatusBadge } from "./StatusBadge";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface CheckInButtonProps {
  todayLog: AttendanceLog | null;
  settings: AttendanceSettings | null;
  isFlexible?: boolean;
  /** Per-employee standard check-out time (HH:MM or HH:MM:SS). Falls back
   * to the org-wide setting. This is also what the server uses to compute
   * overtime minutes, so gating the UI on the same value keeps things
   * consistent. */
  workEndTime?: string | null;
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
  workEndTime,
  onSuccess,
}: CheckInButtonProps) {
  const [log, setLog] = useState<AttendanceLog | null>(todayLog);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"check-in" | "check-out">("check-in");
  const [overtimeChecked, setOvertimeChecked] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const { status: geoStatus, requestLocation } = useGeolocation();
  const { t } = useTranslation();

  const state = getState(log);
  const pastEndTime = isPastEndTime();

  function openCheckIn() {
    setModalAction("check-in");
    setModalOpen(true);
  }

  function openCheckOut() {
    setModalAction("check-out");
    setModalOpen(true);
  }

  /** Check if current time is past work end time. Uses the per-employee
   * `workEndTime` (same source the server uses for overtime calc) and
   * falls back to the org-wide setting. */
  function isPastEndTime(): boolean {
    if (!settings || isFlexible) return false;
    try {
      const endRaw = workEndTime ?? settings.work_end_time;
      if (!endRaw) return false;
      const now = new Date();
      const localNow = new Date(
        now.toLocaleString("en-US", { timeZone: settings.timezone })
      );
      const [endH, endM] = endRaw.split(":").map(Number);
      const endTime = new Date(localNow);
      endTime.setHours(endH, endM ?? 0, 0, 0);
      return localNow > endTime;
    } catch {
      return false;
    }
  }

  async function handleCheckIn() {
    startTransition(async () => {
      const coords = await requestLocation();

      if (!coords) {
        toast.error(t.checkIn.toastLocationRequired, { duration: 6000 });
        return;
      }

      const result = await checkIn({
        latitude: coords.latitude,
        longitude: coords.longitude,
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
          toast.warning(
            t.checkIn.toastLateBy
              .replace("{n}", String(mins))
              .replace("{plural}", mins !== 1 ? "s" : "")
          );
        } else {
          toast.success(t.checkIn.toastCheckedIn);
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
    if (overtimeChecked && !overtimeReason.trim()) {
      toast.error(t.checkIn.toastReasonRequired);
      return;
    }
    await performCheckOut(overtimeChecked, overtimeReason.trim());
  }

  async function performCheckOut(isOvertime: boolean, reason: string) {
    startTransition(async () => {
      const result = await checkOut({
        isOvertime,
        overtimeReason: reason,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      if (result?.data) {
        setLog(result.data as AttendanceLog);
        if (isOvertime && (result.data as AttendanceLog).overtime_minutes > 0) {
          const mins = (result.data as AttendanceLog).overtime_minutes;
          toast.success(
            t.checkIn.toastCheckedOutOvertime.replace(
              "{duration}",
              formatMinutesHuman(mins)
            )
          );
        } else {
          toast.success(t.checkIn.toastCheckedOut);
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
              <span className="animate-pulse">{t.checkIn.processing}</span>
            ) : (
              <>
                <Clock size={20} />
                {t.checkIn.checkIn}
              </>
            )}
          </button>
        )}

        {state === "checked-in" && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground px-1">
              <Clock size={14} style={{ color: "var(--primary)" }} />
              <span>
                {t.checkIn.checkedInAt}{" "}
                <span className="font-semibold text-foreground">
                  {formatTime(log!.checked_in_at, settings?.timezone)}
                </span>
              </span>
              <StatusBadge status={log!.status} lateMinutes={log!.late_minutes} />
              {log?.latitude && (
                <span className="flex items-center gap-0.5 ml-auto">
                  <MapPin size={13} style={{ color: "var(--primary)" }} />
                  <span className="text-xs">{t.checkIn.locationSaved}</span>
                </span>
              )}
            </div>

            <button
              className="btn-checkout w-full flex items-center justify-center gap-2"
              onClick={openCheckOut}
              disabled={isPending}
            >
              {isPending ? (
                <span className="animate-pulse">{t.checkIn.processing}</span>
              ) : (
                <>
                  <Clock size={20} />
                  {t.checkIn.checkOut}
                </>
              )}
            </button>

            {/* Overtime opt-in — only active after the standard end time.
                Rendered below the Check Out button so the primary action
                stays at the top and the opt-in reads as a modifier. */}
            {pastEndTime && (
              <div className="space-y-2 p-3 rounded-xl bg-[#f5f5f7]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overtimeChecked}
                    onChange={(e) => {
                      setOvertimeChecked(e.target.checked);
                      if (!e.target.checked) setOvertimeReason("");
                    }}
                    className="w-4 h-4 rounded accent-[var(--primary)]"
                  />
                  <span className="text-sm font-medium">{t.checkIn.overtimeOptIn}</span>
                </label>
                {overtimeChecked && (
                  <Textarea
                    value={overtimeReason}
                    onChange={(e) => setOvertimeReason(e.target.value)}
                    placeholder={t.checkIn.overtimeReasonPlaceholder}
                    rows={2}
                    className="text-sm"
                  />
                )}
              </div>
            )}
          </>
        )}

        {state === "checked-out" && (
          <div className="w-full h-[72px] rounded-[20px] bg-[#f5f5f7] flex flex-col items-center justify-center gap-1">
            <span className="text-2xl">✅</span>
            <span className="text-sm font-medium text-muted-foreground">
              {t.checkIn.completeToday}
            </span>
          </div>
        )}

        {/* Location status hint — only shown before check-in */}
        {state === "idle" && (
          <p className={`text-xs text-center ${
            geoStatus === "denied" || geoStatus === "unavailable"
              ? "text-destructive font-medium"
              : "text-muted-foreground"
          }`}>
            {locationIcon}
            {geoStatus === "idle" || geoStatus === "requesting"
              ? t.checkIn.locationRequiredBefore
              : geoStatus === "granted"
              ? t.checkIn.locationWillRecord
              : t.checkIn.locationBlocked}
          </p>
        )}
      </div>

      <PasswordConfirmModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        action={modalAction}
        onConfirm={modalAction === "check-in" ? handleCheckIn : handleCheckOutAttempt}
      />
    </>
  );
}
