"use client";

import { useState, useTransition, useRef } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { MapPin, MapPinOff, Clock, Coffee } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { checkIn, checkOut, breakOut, breakIn } from "@/lib/actions/attendance.actions";
import { CheckoutConfirmDialog } from "./CheckoutConfirmDialog";
import { activeBreakWindow } from "@/lib/utils/break-windows";

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
    colors: ["#8B5CF6", "#F472B6", "#FBBF24", "#34D399", "#A78BFA"],
    shapes: ["circle", "square"],
  });
}
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import type {
  AttendanceLog,
  AttendanceSettings,
  AttendanceBreakLog,
  BreakWindow,
} from "@/lib/supabase/types";
import { formatMinutesHuman } from "@/lib/utils/date";
import { getEffectiveWorkEnd } from "@/lib/utils/attendance-overtime";
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
  /** Istirahat feature: enabled flag + windows + today's break sessions. */
  breakEnabled?: boolean;
  breakWindows?: BreakWindow[];
  breakLogs?: AttendanceBreakLog[];
  onSuccess?: () => void;
}

type AttendanceState = "idle" | "checked-in" | "checked-out";
type ModalAction = "check-in" | "check-out" | "break-out" | "break-in";

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
  breakEnabled = false,
  breakWindows = [],
  breakLogs = [],
  onSuccess,
}: CheckInButtonProps) {
  const [log, setLog] = useState<AttendanceLog | null>(todayLog);
  const [breaks, setBreaks] = useState<AttendanceBreakLog[]>(breakLogs);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<ModalAction>("check-in");
  // Which flow the GPS→selfie→action pipeline is currently running.
  const pendingActionRef = useRef<ModalAction>("check-in");
  const [overtimeChecked, setOvertimeChecked] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState("");
  const [isPending, startTransition] = useTransition();
  // Checkout confirmation flow. Server return `requiresConfirmation:
  // true` kalau (a) posisi di luar geofence ATAU (b) sekarang lewat
  // jam kerja selesai > 30 menit. Dialog menawarkan dua opsi: pakai
  // jam sekarang atau input jam lebih awal. Note wajib.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmReason, setConfirmReason] = useState<
    "outside_location" | "late_over_threshold" | null
  >(null);
  const [confirmTimes, setConfirmTimes] = useState<{
    currentTime: string | null;
    workEndTime: string | null;
    checkinTime: string | null;
  }>({ currentTime: null, workEndTime: null, checkinTime: null });
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

  // ── Istirahat (break) derivation ──────────────────────────────────────
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const openBreak = breaks.find((b) => b.break_in_at == null) ?? null;
  // The break window the current local time falls inside (client-side; the
  // server re-validates). Only relevant while checked-in and not on break.
  const currentWindow =
    breakEnabled && state === "checked-in" && !openBreak
      ? activeBreakWindow(new Date(), breakWindows, tz)
      : null;
  const windowAlreadyUsed =
    currentWindow != null &&
    breaks.some(
      (b) =>
        b.window_start === currentWindow.start &&
        b.window_end === currentWindow.end
    );
  const canBreakOut = currentWindow != null && !windowAlreadyUsed;

  function openCheckIn() {
    setModalAction("check-in");
    setModalOpen(true);
  }

  function openCheckOut() {
    setModalAction("check-out");
    setModalOpen(true);
  }

  function openBreakOut() {
    setModalAction("break-out");
    setModalOpen(true);
  }

  function openBreakIn() {
    setModalAction("break-in");
    setModalOpen(true);
  }

  /** GPS → selfie pipeline shared by check-in and break-out/in. */
  async function startSelfieFlow(action: ModalAction) {
    const coords = await requestLocation();
    if (!coords) {
      toast.error(t.checkIn.toastLocationRequired, { duration: 6000 });
      return;
    }
    pendingActionRef.current = action;
    pendingCoordsRef.current = coords;
    setSelfieOpen(true);
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

      const payload = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        selfie_path: path,
      };
      const action = pendingActionRef.current;

      // ── Break-out: start a break session ──
      if (action === "break-out") {
        const result = await breakOut(payload);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        if (result?.data) {
          setSelfieOpen(false);
          setBreaks((b) => [...b, result.data as AttendanceBreakLog]);
          toast.success(t.checkIn.toastBreakOut);
          onSuccess?.();
        }
        return;
      }

      // ── Break-in: close the open break session ──
      if (action === "break-in") {
        const result = await breakIn(payload);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        if (result?.data) {
          const d = result.data as { id: string; late_return: boolean };
          const nowIso = new Date().toISOString();
          setSelfieOpen(false);
          setBreaks((b) =>
            b.map((x) =>
              x.id === d.id
                ? { ...x, break_in_at: nowIso, late_return: d.late_return }
                : x
            )
          );
          if (d.late_return) toast.warning(t.checkIn.toastBreakInLate);
          else toast.success(t.checkIn.toastBreakIn);
          onSuccess?.();
        }
        return;
      }

      // ── Default: normal check-in ──
      const result = await checkIn(payload);

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
    overrideCheckoutTime?: string | null;
  }) {
    const result = await checkOut({
      isOvertime: args.isOvertime,
      overtimeReason: args.overtimeReason,
      latitude: args.latitude,
      longitude: args.longitude,
      outsideLocationNote: args.note ?? undefined,
      overrideCheckoutTime: args.overrideCheckoutTime ?? undefined,
    });

    // Server minta konfirmasi (outside location atau late > 30 min).
    // Buka dialog pilihan jam + catatan.
    const confirmResult = result as {
      requiresConfirmation?: boolean;
      reasonCode?: "outside_location" | "late_over_threshold";
      currentTime?: string | null;
      workEndTime?: string | null;
      checkinTime?: string | null;
    };
    if (confirmResult?.requiresConfirmation) {
      setPendingCheckout({
        isOvertime: args.isOvertime,
        overtimeReason: args.overtimeReason,
        latitude: args.latitude,
        longitude: args.longitude,
      });
      setConfirmReason(confirmResult.reasonCode ?? null);
      setConfirmTimes({
        currentTime: confirmResult.currentTime ?? null,
        workEndTime: confirmResult.workEndTime ?? null,
        checkinTime: confirmResult.checkinTime ?? null,
      });
      setConfirmOpen(true);
      return;
    }

    if (result?.error) {
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

  function submitConfirmAndRetry(args: {
    note: string;
    overrideTime: string | null;
  }) {
    if (!pendingCheckout) return;
    const pending = pendingCheckout;
    startTransition(async () => {
      await submitCheckout({
        ...pending,
        note: args.note,
        overrideCheckoutTime: args.overrideTime,
      });
      setConfirmOpen(false);
      setPendingCheckout(null);
      setConfirmReason(null);
      setConfirmTimes({ currentTime: null, workEndTime: null, checkinTime: null });
    });
  }

  const locationIcon =
    geoStatus === "granted" ? (
      <MapPin size={14} className="inline-block mr-1 text-quaternary" />
    ) : geoStatus === "denied" || geoStatus === "unavailable" ? (
      <MapPinOff size={14} className="inline-block mr-1 opacity-40" />
    ) : null;

  return (
    <>
      <div className="w-full space-y-3">
        {state === "idle" && (
          <button
            className="btn-action-primary w-full pulse-primary flex items-center justify-center gap-2"
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
            {/* Istirahat — on-break: must check back in; or within a window:
                offer break-out. Advisory: never blocks the Check Out below. */}
            {breakEnabled && openBreak && (
              <button
                className="w-full h-[60px] rounded-full border-2 border-foreground bg-tertiary/40 flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wide text-sm shadow-hard-sm disabled:opacity-50"
                onClick={openBreakIn}
                disabled={isPending}
              >
                <Coffee size={18} />
                {isPending ? t.checkIn.processing : t.checkIn.breakIn}
              </button>
            )}
            {breakEnabled && !openBreak && canBreakOut && (
              <button
                className="w-full h-[60px] rounded-full border-2 border-foreground bg-tertiary/20 flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wide text-sm hover:bg-tertiary/40 disabled:opacity-50"
                onClick={openBreakOut}
                disabled={isPending}
              >
                <Coffee size={18} />
                {isPending ? t.checkIn.processing : t.checkIn.breakOut}
              </button>
            )}
            {breakEnabled && !openBreak && !canBreakOut && breakWindows.length > 0 && (
              <p className="text-xs text-center text-muted-foreground">
                <Coffee size={13} className="inline-block mr-1 opacity-60" />
                {t.checkIn.breakWindowHint.replace(
                  "{windows}",
                  breakWindows.map((w) => `${w.start}–${w.end}`).join(", ")
                )}
              </p>
            )}

            <button
              className="btn-action-secondary w-full flex items-center justify-center gap-2"
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
              <div className="space-y-2 p-4 rounded-2xl border-2 border-foreground bg-tertiary/30">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overtimeChecked}
                    onChange={(e) => {
                      setOvertimeChecked(e.target.checked);
                      if (!e.target.checked) setOvertimeReason("");
                    }}
                    className="w-5 h-5 rounded border-2 border-foreground accent-primary"
                  />
                  <span className="font-display text-sm font-bold uppercase tracking-wide">{t.checkIn.overtimeOptIn}</span>
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
          <>
            <div className="w-full h-[72px] rounded-full border-2 border-foreground bg-quaternary/30 flex items-center justify-center gap-2 shadow-hard-sm">
              <span className="size-8 rounded-full border-2 border-foreground bg-quaternary flex items-center justify-center text-base">
                ✓
              </span>
              <span className="font-display font-bold text-foreground uppercase tracking-wide text-sm">
                {t.checkIn.completeToday}
              </span>
            </div>
            {/* Recovery affordance for the "tap Check Out by mistake"
                case. Re-check-in re-opens today's log (server resets
                checked_out_at + overtime). Password modal still gates
                the action to prevent a second human-error layer. */}
            <button
              type="button"
              onClick={openCheckIn}
              disabled={isPending}
              className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 py-1 disabled:opacity-50"
            >
              Tap di sini kalau check out tadi keliru — check in ulang
            </button>
          </>
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
        action={modalAction === "check-out" ? "check-out" : "check-in"}
        onConfirm={
          modalAction === "check-out"
            ? handleCheckOutAttempt
            : () => startSelfieFlow(modalAction)
        }
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

      {/* Checkout konfirmasi: outside location atau telat > 30 menit */}
      <CheckoutConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) {
            setPendingCheckout(null);
            setConfirmReason(null);
            setConfirmTimes({ currentTime: null, workEndTime: null, checkinTime: null });
          }
        }}
        reasonCode={confirmReason}
        currentTime={confirmTimes.currentTime}
        workEndTime={confirmTimes.workEndTime}
        checkinTime={confirmTimes.checkinTime}
        submitting={isPending}
        onSubmit={submitConfirmAndRetry}
      />
    </>
  );
}
