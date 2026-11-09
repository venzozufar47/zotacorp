"use client";

/**
 * Kontrol jadwal kerja dan status kepegawaian per karyawan, dipakai tab Kerja
 * di profil karyawan. Dipindah dari UsersTable lama (/admin/users).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Clock, Sparkles } from "lucide-react";
import {
  WEEKDAY_LABELS_ID,
  isWorkdayFor,
  setWorkdayBit,
} from "@/lib/utils/workdays";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { BreakWindow } from "@/lib/supabase/types";

/** The slice of the dictionary this component tree needs. Lets us pass
 *  a single `tu` prop to every sub-component instead of re-calling
 *  useTranslation() inside each one (which would work but keeps the
 *  translation pulls co-located with the parent for easier audit). */
export type AdminUsersT = Dictionary["adminUsers"];

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  avatar_seed: string | null;
  role: "employee" | "admin";
  business_unit: string | null;
  job_role: string | null;
  is_flexible_schedule: boolean;
  /** HH:MM, normalized server-side. */
  work_start_time: string;
  /** HH:MM, normalized server-side. */
  work_end_time: string;
  grace_period_min: number;
  /** Opt-in: when true, check-in consults the workdays bitmask and
   *  classifies non-workday entries as `bonus` (no late penalty). */
  workday_check_enabled: boolean;
  /** Bitmask: bit 0=Sun … bit 6=Sat. Default 126 = Mon-Sat. */
  workdays: number;
  /** Istirahat: kalau true, karyawan wajib check-out/in istirahat di window. */
  break_enabled: boolean;
  /** Daftar rentang jam istirahat (HH:MM). */
  break_windows: BreakWindow[];
  /** Kalau true, check-in di tanggal libur nasional dihitung bonus. */
  holiday_bonus_enabled: boolean;
  profile_complete: boolean;
  /** IDs of attendance_locations this employee is allowed to check in at.
   *  Empty array = unrestricted (can check in anywhere). */
  assigned_location_ids: string[];
  /** When true, the employee sees the "Add extra work" button on their
   *  dashboard. Toggleable from this table. */
  /** Kalau true, karyawan tidak muncul di /admin/payslips/variables. */
  payslip_excluded: boolean;
  /** Probation = invisible from coworker celebration feeds (birthday +
   *  anniversary). Self-celebration + system WA tetap nyala. */
  is_probation: boolean;
  /** Resign toggle. false = di-tag resign: tidak bisa login, tidak
   *  dapat WA notif, tidak masuk payslip generator. Reversible. */
  is_active: boolean;
  /** Saat is_active=false → timestamp resign. Dipertahankan walau
   *  admin re-activate (history audit). */
  resigned_at: string | null;
  /** Admin yang nge-tag resign. Pair dengan resigned_at. */
  resigned_by: string | null;
}


/**
 * Generic helper: POST sebuah patch ke /api/profile/update + handle
 * rollback toast. Dipakai oleh toggle Probation & Masuk penggajian.
 */
async function patchProfile(
  userId: string,
  fields: Record<string, string | boolean | null>
): Promise<boolean> {
  const res = await fetch("/api/profile/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId: userId, ...fields }),
  });
  return res.ok;
}

/** Format tanggal resign yang ringkas untuk badge — "25 Mei 2026"
 *  Indonesian style. Jatuh balik ke "—" kalau input invalid. */
/**
 * Toggle apakah karyawan masuk di payslip variables editor.
 * `payslip_excluded=true` → tersembunyi; default false (included).
 * UI menampilkan nilai inverse (Included/Excluded) supaya intuitif.
 */
export function PayslipIncludeToggle({
  userId,
  initialExcluded,
}: {
  userId: string;
  initialExcluded: boolean;
}) {
  const router = useRouter();
  const [included, setIncluded] = useState(!initialExcluded);
  const [pending, startTransition] = useTransition();

  function flip() {
    const next = !included;
    setIncluded(next);
    startTransition(async () => {
      const ok = await patchProfile(userId, {
        payslip_excluded: !next,
      });
      if (!ok) {
        toast.error("Gagal update payslip include");
        setIncluded(!next);
        return;
      }
      // Refresh untuk re-fetch /admin/payslips/variables list saat
      // user pindah ke sana — server cache sudah di-invalidate oleh
      // /api/profile/update lewat revalidatePath.
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={included}
      aria-label="Toggle include/exclude di payslip"
      disabled={pending}
      onClick={flip}
      title={included ? "Masuk di payslip editor" : "Tidak masuk di payslip editor"}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        included ? "bg-[color:var(--primary)]" : "bg-muted",
        pending && "opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
          included ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/**
 * Probation flag — when ON, karyawan ini disembunyikan dari coworker
 * celebration feeds (ulang tahun + anniversary). Self-celebration card
 * di dashboard mereka sendiri tetap muncul, dan WA otomatis dari
 * sistem ("tim Zota") tetap dikirim ke mereka.
 */
export function ProbationToggle({
  userId,
  initial,
}: {
  userId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [probation, setProbation] = useState(initial);
  const [pending, startTransition] = useTransition();

  function flip() {
    const next = !probation;
    setProbation(next);
    startTransition(async () => {
      const ok = await patchProfile(userId, { is_probation: next });
      if (!ok) {
        toast.error("Gagal update status probation");
        setProbation(!next);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={probation}
      aria-label="Toggle probation status"
      disabled={pending}
      onClick={flip}
      title={
        probation
          ? "Probation: tidak muncul di celebration feed coworker"
          : "Regular: muncul normal di feed"
      }
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        probation ? "bg-amber-500" : "bg-muted",
        pending && "opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
          probation ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/**
 * Compact schedule cell — doubles as the affordance to open the inline
 * edit dialog.
 *
 *   - ✨ Flexible                                         (dashed badge)
 *   - 🕒 09:00 – 18:00  +  +15m grace                     (stacked pair)
 *
 * The grace period sits under the time range in a subdued line so it
 * reads as metadata, not a second primary value. For flexible users the
 * grace period is preserved in the DB (it's still written to attendance
 * logs for historical context) but isn't surfaced here — lateness
 * tracking is off for them, so displaying a grace number would be noise.
 */
export function ScheduleCell({
  row,
  onEdit,
  tu,
}: {
  row: UserRow;
  onEdit: () => void;
  tu: AdminUsersT;
}) {
  const isFlexible = row.is_flexible_schedule;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "inline-flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors text-left",
        "hover:bg-muted hover:border-foreground/40",
        isFlexible
          ? "border-dashed border-muted-foreground/30 text-muted-foreground"
          : "border-border text-foreground"
      )}
      aria-label={tu.ariaEditSchedule}
    >
      {isFlexible ? (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Sparkles size={12} />
          {tu.flexible}
        </span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
            <Clock size={12} className="text-muted-foreground" />
            {row.work_start_time} – {row.work_end_time}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums pl-[18px]">
            {tu.graceSuffix.replace("{n}", String(row.grace_period_min))}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Profile completion status badge. Boolean on purpose — the admin
 * overview doesn't need a percentage here; the detail page shows which
 * specific sections are incomplete. A single yes/no cell scans faster.
 */

/**
 * Inline schedule editor.
 *
 * Invariants enforced here (also respected across attendance + payslip):
 *   - `is_flexible_schedule === true` ⇒ attendance logic ignores
 *     start/end times + grace period entirely. We still preserve those
 *     values so toggling OFF restores a sensible default instead of
 *     jumping to 00:00 / 0m.
 *   - start < end: surfaced as an inline validation error. The DB
 *     doesn't enforce this, but every consumer assumes it, so we catch
 *     it at write time rather than letting it bleed into payslip math.
 *   - grace_period_min is clamped 0–120. The DB accepts any integer,
 *     but UX-wise "2 hours grace" is already past the point where the
 *     schedule itself is misconfigured.
 */
export function ScheduleEditDialog({
  row,
  tu,
  onOpenChange,
  onSaved,
}: {
  row: UserRow | null;
  tu: AdminUsersT;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [flexible, setFlexible] = useState(row?.is_flexible_schedule ?? false);
  const [start, setStart] = useState(row?.work_start_time ?? "09:00");
  const [end, setEnd] = useState(row?.work_end_time ?? "18:00");
  const [grace, setGrace] = useState(row?.grace_period_min ?? 15);
  const [workdayCheckEnabled, setWorkdayCheckEnabled] = useState(row?.workday_check_enabled ?? false);
  const [workdays, setWorkdays] = useState(row?.workdays ?? 126); // Mon–Sat default
  const [breakEnabled, setBreakEnabled] = useState(row?.break_enabled ?? false);
  const [breakWindows, setBreakWindows] = useState<BreakWindow[]>(row?.break_windows ?? []);
  const [holidayBonusEnabled, setHolidayBonusEnabled] = useState(row?.holiday_bonus_enabled ?? false);
  const updateWindow = (i: number, field: "start" | "end", value: string) =>
    setBreakWindows((ws) =>
      ws.map((x, idx) => (idx === i ? { ...x, [field]: value } : x))
    );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State diisi dari `row` saat mount. Pemanggil memasang dialog ini hanya
  // ketika sedang mengedit (dengan `key` per karyawan), jadi tiap kali dibuka
  // nilainya selalu yang terbaru tanpa effect penyalin state.

  async function handleSave() {
    if (!row) return;
    setError(null);

    if (!flexible) {
      if (!start || !end) {
        setError(tu.errStartEndRequired);
        return;
      }
      if (start >= end) {
        setError(tu.errEndAfterStart);
        return;
      }
      if (!Number.isFinite(grace) || grace < 0 || grace > 120) {
        setError(tu.errGraceRange);
        return;
      }
    }

    if (breakEnabled) {
      for (const w of breakWindows) {
        if (!w.start || !w.end) {
          setError("Lengkapi jam istirahat (mulai & selesai).");
          return;
        }
        if (w.start >= w.end) {
          setError("Jam istirahat: jam mulai harus sebelum jam selesai.");
          return;
        }
        if (!flexible && (w.start < start || w.end > end)) {
          setError("Jam istirahat harus berada di dalam jam kerja.");
          return;
        }
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: row.id,
          is_flexible_schedule: flexible,
          // Always send the time + grace values so attendance history and
          // payslip `standardWorkingHours` keep a stable reference. When
          // flexible is on, downstream consumers short-circuit on that
          // flag and don't care what these values are.
          work_start_time: start,
          work_end_time: end,
          grace_period_min: Math.round(grace),
          workday_check_enabled: workdayCheckEnabled,
          workdays,
          break_enabled: breakEnabled,
          break_windows: breakEnabled ? breakWindows : [],
          holiday_bonus_enabled: holidayBonusEnabled,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error ?? tu.toastScheduleFailed);
        setSaving(false);
        return;
      }

      toast.success(
        flexible
          ? tu.toastScheduleFlexible.replace(
              "{name}",
              row.full_name || row.email
            )
          : tu.toastScheduleSaved
              .replace("{start}", start)
              .replace("{end}", end)
              .replace("{grace}", String(grace))
      );
      setSaving(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tu.errSomethingWrong);
      setSaving(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{tu.scheduleTitle}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {row?.full_name || row?.email}
            </span>
            {" — "}
            {tu.scheduleSubtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Flexible toggle — the governing switch. When on, time + grace
              fields are disabled so the UI matches the stored invariant. */}
          <label className="flex items-start gap-3 rounded-2xl border-2 border-foreground/30 bg-muted px-3 py-2.5 cursor-pointer hover:border-foreground transition-colors">
            <input
              type="checkbox"
              checked={flexible}
              onChange={(e) => setFlexible(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-2 border-foreground accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-bold">{tu.flexibleLabel}</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {tu.flexibleHint}
              </div>
            </div>
          </label>

          <div
            className={cn(
              "space-y-3 transition-opacity",
              flexible && "opacity-50 pointer-events-none"
            )}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start" className="text-xs">
                  {tu.signInTime}
                </Label>
                <Input
                  id="start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  disabled={flexible}
                  step={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end" className="text-xs">
                  {tu.signOutTime}
                </Label>
                <Input
                  id="end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  disabled={flexible}
                  step={60}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="grace" className="text-xs">
                {tu.graceLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="grace"
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={Number.isFinite(grace) ? grace : ""}
                  onChange={(e) => setGrace(Number(e.target.value))}
                  disabled={flexible}
                  className="w-24 tabular-nums"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {tu.graceHelperPrefix}{" "}
                  <span className="font-medium">{grace}</span>{" "}
                  {tu.graceHelperSuffix}
                </span>
              </div>
            </div>
          </div>

          {!flexible && (
            <div className="text-xs text-muted-foreground leading-relaxed">
              {tu.lateFormula}
            </div>
          )}

          {/* Workday-aware check-in (opt-in) */}
          {!flexible && (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={workdayCheckEnabled}
                  onChange={(e) => setWorkdayCheckEnabled(e.target.checked)}
                  className="size-4"
                />
                <span className="text-sm font-medium">
                  Cek hari kerja saat check-in
                </span>
              </label>
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                Jika aktif, check-in di hari di luar daftar di bawah akan
                ditandai &ldquo;Bonus&rdquo; — tidak ada penalti telat,
                dan tidak memengaruhi streak.
              </p>
              {workdayCheckEnabled && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {([0, 1, 2, 3, 4, 5, 6] as const).map((dow) => {
                    const on = isWorkdayFor(workdays, dow);
                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() =>
                          setWorkdays((w) => setWorkdayBit(w, dow, !on))
                        }
                        className={
                          "h-8 px-2.5 rounded-full text-[11.5px] font-medium border transition " +
                          (on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:bg-muted")
                        }
                      >
                        {WEEKDAY_LABELS_ID[dow]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Istirahat (break) windows — opt-in per karyawan */}
          {!flexible && (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={breakEnabled}
                  onChange={(e) => setBreakEnabled(e.target.checked)}
                  className="size-4"
                />
                <span className="text-sm font-medium">Aktifkan istirahat</span>
              </label>
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                Karyawan wajib check-out istirahat lalu kembali (password +
                selfie + lokasi) di dalam rentang jam istirahat. Bisa lebih
                dari satu rentang.
              </p>
              {breakEnabled && (
                <div className="space-y-2 pt-1">
                  {breakWindows.length === 0 && (
                    <p className="text-[11.5px] text-muted-foreground italic">
                      Belum ada rentang. Tambahkan minimal satu.
                    </p>
                  )}
                  {breakWindows.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        step={60}
                        value={w.start}
                        onChange={(e) => updateWindow(i, "start", e.target.value)}
                        className="w-28"
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        step={60}
                        value={w.end}
                        onChange={(e) => updateWindow(i, "end", e.target.value)}
                        className="w-28"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setBreakWindows((ws) => ws.filter((_, idx) => idx !== i))
                        }
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Hapus rentang"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setBreakWindows((ws) => [
                        ...ws,
                        { start: "12:00", end: "13:00" },
                      ])
                    }
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    + Tambah jam istirahat
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Hari libur nasional → bonus (opt-in; berlaku juga utk flexible) */}
          <div className="space-y-1 rounded-xl border border-border/70 bg-muted/30 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={holidayBonusEnabled}
                onChange={(e) => setHolidayBonusEnabled(e.target.checked)}
                className="size-4"
              />
              <span className="text-sm font-medium">
                Libur nasional dihitung bonus
              </span>
            </label>
            <p className="text-[11.5px] text-muted-foreground leading-snug">
              Saat check-in di tanggal merah (daftar di Settings → Hari libur
              nasional), absensi otomatis jadi <strong>bonus</strong> — tanpa
              penalti telat.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {tu.cancel}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? tu.saving : tu.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
