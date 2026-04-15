"use client";

import { useState, useTransition, useRef } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { MapPin, MapPinOff, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { checkIn, checkOut } from "@/lib/actions/attendance.actions";

/**
 * The password-confirm modal pulls in @base-ui/react's Dialog, Input,
 * Label, and Button plus an auth round-trip — none of which we need until
 * the employee actually taps Check In / Check Out. Loading it lazily
 * trims a meaningful chunk off the dashboard's first-paint bundle and
 * pushes the modal's hydration to interaction time (where the cost is
 * hidden by the tap). `ssr: false` skips server-rendering because the
 * modal is only ever visible after a click anyway.
 */
const PasswordConfirmModal = dynamic(
  () => import("./PasswordConfirmModal").then((m) => m.PasswordConfirmModal),
  { ssr: false }
);

/**
 * canvas-confetti is ~7KB gzipped but its eval cost on mobile is
 * non-trivial and it only runs on a successful check-in. Import it on
 * demand so it never touches the critical hydration path. We also shrink
 * the particle count on low-power devices — rendering 80 particles at 60fps
 * on a mid-tier phone can easily hold the main thread long enough to flag
 * in INP. deviceMemory is a loose proxy but good enough for this.
 */
async function fireConfetti() {
  const confettiModule = await import("canvas-confetti");
  const confetti = confettiModule.default;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const isLowPower =
    // @ts-expect-error deviceMemory is not in the standard DOM typings.
    (nav && typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) ||
    (nav && nav.hardwareConcurrency && nav.hardwareConcurrency <= 4);
  confetti({
    particleCount: isLowPower ? 40 : 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#005a65", "#007a88", "#34c759", "#fff"],
  });
}
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import type { AttendanceLog, AttendanceSettings } from "@/lib/supabase/types";
import { formatTime, formatMinutesHuman } from "@/lib/utils/date";
import { getEffectiveWorkEnd } from "@/lib/utils/attendance-overtime";
import { StatusBadge } from "./StatusBadge";
import { SelfieCaptureDialog } from "./SelfieCaptureDialog";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

interface CheckInButtonProps {
  todayLog: AttendanceLog | null;
  settings: AttendanceSettings | null;
  isFlexible?: boolean;
  /** Per-employee standard check-in time. Required for the early-arrival
   * overtime gate — without it we can't compute the effective end. */
  workStartTime?: string | null;
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
  workStartTime,
  workEndTime,
  onSuccess,
}: CheckInButtonProps) {
  const [log, setLog] = useState<AttendanceLog | null>(todayLog);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"check-in" | "check-out">("check-in");
  const [overtimeChecked, setOvertimeChecked] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState("");
  const [isPending, startTransition] = useTransition();
  // Outside-radius checkout note flow. When the server reports
  // `requiresNote: true`, we stash the GPS + overtime args and open a
  // small modal asking the employee for the explanation; submitting it
  // re-fires the same checkOut call with the note attached.
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [pendingCheckout, setPendingCheckout] = useState<{
    isOvertime: boolean;
    overtimeReason: string;
    latitude: number | null;
    longitude: number | null;
  } | null>(null);
  // Selfie capture + upload for check-in. `pendingCoordsRef` holds the GPS
  // fix from step 1 while the selfie dialog is open in step 2.
  const [selfieOpen, setSelfieOpen] = useState(false);
  const pendingCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const { status: geoStatus, requestLocation } = useGeolocation();
  const { t } = useTranslation();

  const state = getState(log);
  const pastEndTime = canOptInOvertime();

  function openCheckIn() {
    setModalAction("check-in");
    setModalOpen(true);
  }

  function openCheckOut() {
    setModalAction("check-out");
    setModalOpen(true);
  }

  /**
   * Should the overtime opt-in checkbox appear yet?
   *
   * Today's behaviour for normal arrivals: `now > work_end_time`.
   * Early-arrival behaviour: `now > checked_in_at + standard_duration`.
   * Both cases collapse into a single check via `getEffectiveWorkEnd`,
   * the same helper the server uses to credit OT minutes — so the UI
   * never enables an opt-in the server then refuses.
   */
  function canOptInOvertime(): boolean {
    if (!settings || isFlexible || !log) return false;
    try {
      const start = workStartTime ?? settings.work_start_time;
      const end = workEndTime ?? settings.work_end_time;
      if (!start || !end) return false;
      const effectiveEnd = getEffectiveWorkEnd(
        new Date(log.checked_in_at),
        start,
        end,
        settings.timezone,
        false
      );
      if (!effectiveEnd) return false;
      const localNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: settings.timezone })
      );
      return localNow >= effectiveEnd;
    } catch {
      return false;
    }
  }

  /**
   * Step 1 of check-in: grab GPS, then open the selfie capture dialog.
   * We ask GPS first so a permission-denied case doesn't waste the user's
   * time taking a selfie that can't be submitted. The selfie upload +
   * server action run in step 2 (handleSelfieConfirmed).
   */
  async function handleCheckIn() {
    const coords = await requestLocation();
    if (!coords) {
      toast.error(t.checkIn.toastLocationRequired, { duration: 6000 });
      return;
    }
    pendingCoordsRef.current = coords;
    setSelfieOpen(true);
  }

  /**
   * Step 2: dialog returns the captured Blob. Upload to Supabase Storage
   * under the signed-in employee's own folder (enforced by storage RLS),
   * then call the server action with the resulting path.
   */
  async function handleSelfieConfirmed(blob: Blob) {
    const coords = pendingCoordsRef.current;
    if (!coords) {
      toast.error(t.checkIn.toastLocationRequired);
      setSelfieOpen(false);
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        toast.error(t.checkIn.errGeneric);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      // Unique per-day-per-user. If a browser re-tries, upsert overwrites
      // rather than accumulating stale frames.
      const path = `${uid}/${today}-${crypto.randomUUID()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from("attendance-selfies")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadErr) {
        toast.error(t.checkIn.selfieUploadFailed);
        return;
      }

      const result = await checkIn({
        latitude: coords.latitude,
        longitude: coords.longitude,
        selfie_path: path,
      });

      if (result?.error) {
        toast.error(result.error);
        // Orphaned upload isn't worth a cleanup round-trip — bucket is
        // private and path contains employee's uid; cost is negligible.
        return;
      }

      if (result?.data) {
        setSelfieOpen(false);
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

        // Fire-and-forget — don't keep the transition pending on the
        // confetti animation, which would tie the button to its disabled
        // state during the whole 400ms spread.
        fireConfetti();

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
      // Grab fresh GPS at checkout so the server can geofence-check against
      // the employee's assigned locations. We don't block on missing coords —
      // the server will downgrade the response to "requires note" if needed.
      const coords = await requestLocation();

      await submitCheckout({
        isOvertime,
        overtimeReason: reason,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        note: null,
      });
    });
  }

  /**
   * Single-shot checkout submission. Used by both the fresh attempt (no note
   * yet) and the note-modal retry. Splitting it from `performCheckOut` keeps
   * the GPS capture out of the retry path so the user doesn't get a second
   * permission prompt on resubmit.
   */
  async function submitCheckout(args: {
    isOvertime: boolean;
    overtimeReason: string;
    latitude: number | null;
    longitude: number | null;
    note: string | null;
  }) {
    const result = await checkOut({
      isOvertime: args.isOvertime,
      overtimeReason: args.overtimeReason,
      latitude: args.latitude,
      longitude: args.longitude,
      outsideLocationNote: args.note ?? undefined,
    });

    if (result?.error) {
      // Outside-radius → open the note modal and stash args for retry.
      if ((result as { requiresNote?: boolean }).requiresNote) {
        setPendingCheckout({
          isOvertime: args.isOvertime,
          overtimeReason: args.overtimeReason,
          latitude: args.latitude,
          longitude: args.longitude,
        });
        setNoteValue("");
        setNoteOpen(true);
        return;
      }
      toast.error(result.error);
      return;
    }

    if (result?.data) {
      setLog(result.data as AttendanceLog);
      if (args.isOvertime && (result.data as AttendanceLog).overtime_minutes > 0) {
        const mins = (result.data as AttendanceLog).overtime_minutes;
        toast.success(
          t.checkIn.toastCheckedOutOvertime.replace(
            "{duration}",
            formatMinutesHuman(mins, t.units)
          )
        );
      } else {
        toast.success(t.checkIn.toastCheckedOut);
      }
      onSuccess?.();
    }
  }

  function submitNoteAndRetry() {
    if (!pendingCheckout) return;
    if (!noteValue.trim()) {
      toast.error("Catatan wajib diisi.");
      return;
    }
    const args = pendingCheckout;
    const note = noteValue.trim();
    startTransition(async () => {
      await submitCheckout({ ...args, note });
      setNoteOpen(false);
      setPendingCheckout(null);
      setNoteValue("");
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

      {/* Step 2 of check-in: live selfie capture. The dialog manages its
          own MediaStream; we only handle the final Blob. */}
      <SelfieCaptureDialog
        open={selfieOpen}
        onOpenChange={(o) => {
          setSelfieOpen(o);
          if (!o) pendingCoordsRef.current = null;
        }}
        onConfirm={handleSelfieConfirmed}
      />

      {/* Outside-radius checkout note prompt */}
      <Dialog
        open={noteOpen}
        onOpenChange={(o) => {
          setNoteOpen(o);
          if (!o) {
            setPendingCheckout(null);
            setNoteValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check out di luar lokasi</DialogTitle>
            <DialogDescription>
              Kamu sedang di luar lokasi kerja terdaftar. Isi catatan singkat untuk admin sebelum check out.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            placeholder="Misal: lupa absen di kantor, baru sempet pas di rumah"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)} disabled={isPending}>
              Batal
            </Button>
            <Button onClick={submitNoteAndRetry} disabled={isPending}>
              {isPending ? "Mengirim…" : "Check out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
