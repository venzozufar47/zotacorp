"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { MapPin, MapPinOff, Clock } from "lucide-react";
import { PasswordConfirmModal } from "./PasswordConfirmModal";
import { checkIn, checkOut } from "@/lib/actions/attendance.actions";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import type { AttendanceLog } from "@/lib/supabase/types";
import { formatTime } from "@/lib/utils/date";

interface CheckInButtonProps {
  todayLog: AttendanceLog | null;
  onSuccess?: () => void;
}

type AttendanceState = "idle" | "checked-in" | "checked-out";

function getState(log: AttendanceLog | null): AttendanceState {
  if (!log) return "idle";
  if (!log.checked_out_at) return "checked-in";
  return "checked-out";
}

export function CheckInButton({ todayLog, onSuccess }: CheckInButtonProps) {
  const [log, setLog] = useState<AttendanceLog | null>(todayLog);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"check-in" | "check-out">("check-in");
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

  async function handleCheckIn() {
    startTransition(async () => {
      // Request geolocation (non-blocking if denied)
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
        toast.success("Checked in! Have a great day 🎉");

        // Confetti celebration
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

  async function handleCheckOut() {
    startTransition(async () => {
      const result = await checkOut();

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      if (result?.data) {
        setLog(result.data as AttendanceLog);
        toast.success("Checked out! See you tomorrow ✌️");
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
        onConfirm={modalAction === "check-in" ? handleCheckIn : handleCheckOut}
      />
    </>
  );
}
