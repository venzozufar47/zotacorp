"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Lock,
  Power,
  Pencil,
  Clock,
  Check,
  Repeat,
  ArrowUp,
  ArrowDown,
  X,
  CalendarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  WEEKDAY_LABELS_ID,
  WORKDAYS_DEFAULT,
  isWorkdayFor,
  setWorkdayBit,
  type Weekday,
} from "@/lib/utils/workdays";
import {
  buildRotationPreview,
  type RotationMode,
} from "@/lib/utils/cleaning-rotation";
import {
  assignChecklist,
  assignRotation,
  updateAssignment,
  updateRotation,
  setRotationMembers,
  deleteAssignment,
  deleteRotation,
  type CleaningChecklist,
  type CleaningAssignmentRow,
} from "@/lib/actions/cleaning.actions";
import type { CleaningEmployee } from "./CleaningAdmin";
import { useRunAction } from "./useRunAction";

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sat, Sun last

const ROTATION_MODES: { value: RotationMode; label: string }[] = [
  { value: "daily", label: "Harian (gantian tiap hari)" },
  { value: "weekly", label: "Mingguan (gantian tiap minggu)" },
];

const shortName = (name: string) => name.trim().split(/\s+/)[0] || name;

function WeekdayPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {DAYS.map((d) => {
        const on = isWorkdayFor(value, d);
        return (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => onChange(setWorkdayBit(value, d, !on))}
            className={cn(
              "size-8 rounded-lg text-xs font-bold border transition disabled:opacity-50",
              on
                ? "bg-primary text-primary-foreground border-foreground"
                : "bg-card text-muted-foreground border-border"
            )}
          >
            {WEEKDAY_LABELS_ID[d]}
          </button>
        );
      })}
    </div>
  );
}

function weekdaySummary(weekdays: number): string {
  return DAYS.filter((d) => isWorkdayFor(weekdays, d))
    .map((d) => WEEKDAY_LABELS_ID[d])
    .join(", ");
}

const WINDOW_MODES: { value: string; label: string }[] = [
  { value: "anytime", label: "Kapan saja" },
  { value: "before", label: "Sebelum jam" },
  { value: "after", label: "Setelah jam" },
  { value: "between", label: "Antara jam" },
];

function windowSummary(mode: string, start: string | null, end: string | null): string {
  if (mode === "before" && end) return `Sebelum ${end}`;
  if (mode === "after" && start) return `Setelah ${start}`;
  if (mode === "between" && start && end) return `${start}–${end}`;
  return "Kapan saja";
}

/** Mode selector + conditional time inputs for the assignment time window. */
function WindowFields({
  mode,
  start,
  end,
  onChange,
  disabled,
}: {
  mode: string;
  start: string;
  end: string;
  onChange: (mode: string, start: string, end: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Clock size={14} className="text-muted-foreground shrink-0" />
      <select
        value={mode}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value, start, end)}
        className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
      >
        {WINDOW_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      {(mode === "after" || mode === "between") && (
        <Input
          type="time"
          value={start}
          disabled={disabled}
          onChange={(e) => onChange(mode, e.target.value, end)}
          className="w-32"
        />
      )}
      {mode === "between" && <span className="text-muted-foreground text-sm">–</span>}
      {(mode === "before" || mode === "between") && (
        <Input
          type="time"
          value={end}
          disabled={disabled}
          onChange={(e) => onChange(mode, start, e.target.value)}
          className="w-32"
        />
      )}
    </div>
  );
}

/** Per-assignment window editor with local state + explicit save. */
function WindowEditor({
  windowMode,
  windowStart,
  windowEnd,
  disabled,
  onSave,
}: {
  windowMode: string;
  windowStart: string | null;
  windowEnd: string | null;
  disabled?: boolean;
  onSave: (mode: string, start: string, end: string) => void;
}) {
  const [mode, setMode] = useState(windowMode);
  const [start, setStart] = useState(windowStart ?? "");
  const [end, setEnd] = useState(windowEnd ?? "");
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">Jam pengerjaan</span>
      <div className="flex items-center gap-2 flex-wrap">
        <WindowFields
          mode={mode}
          start={start}
          end={end}
          disabled={disabled}
          onChange={(m, s, e) => {
            setMode(m);
            setStart(s);
            setEnd(e);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onSave(mode, start, end)}
          className="gap-1.5"
        >
          <Check size={14} />
          Simpan jam
        </Button>
      </div>
    </div>
  );
}

/** Ordered employee picker: add via select, reorder ↑↓, remove ✕. */
function MemberPicker({
  employees,
  members,
  onChange,
  disabled,
}: {
  employees: CleaningEmployee[];
  members: string[];
  onChange: (m: string[]) => void;
  disabled?: boolean;
}) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const available = employees.filter((e) => !members.includes(e.id));

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= members.length) return;
    const next = members.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {members.length > 0 && (
        <ol className="space-y-1">
          {members.map((id, i) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5"
            >
              <span className="grid place-items-center size-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold shrink-0">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm truncate">
                {byId.get(id)?.name ?? "—"}
                {byId.get(id)?.business_unit ? (
                  <span className="text-muted-foreground"> · {byId.get(id)!.business_unit}</span>
                ) : null}
              </span>
              <button
                type="button"
                title="Naik"
                disabled={disabled || i === 0}
                onClick={() => move(i, -1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                title="Turun"
                disabled={disabled || i === members.length - 1}
                onClick={() => move(i, 1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                title="Hapus"
                disabled={disabled}
                onClick={() => onChange(members.filter((m) => m !== id))}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <select
        value=""
        disabled={disabled || available.length === 0}
        onChange={(e) => {
          if (e.target.value) onChange([...members, e.target.value]);
        }}
        className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm"
      >
        <option value="">+ tambah karyawan ke urutan…</option>
        {available.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
            {emp.business_unit ? ` · ${emp.business_unit}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Preview the next ~14 scheduled days → who is on duty. */
function RotationPreview({
  memberNames,
  weekdays,
  mode,
  anchorYmd,
}: {
  memberNames: string[];
  weekdays: number;
  mode: RotationMode;
  anchorYmd: string;
}) {
  if (memberNames.length < 2 || weekdays === 0) return null;
  const fromYmd = jakartaDateString(new Date());
  const days = buildRotationPreview({
    fromYmd,
    weekdays,
    mode,
    anchorYmd,
    memberCount: memberNames.length,
    count: 14,
  });
  if (days.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        Pratinjau giliran
      </p>
      <div className="flex flex-wrap gap-1.5">
        {days.map((d) => {
          const [, m, dd] = d.ymd.split("-");
          const name = d.ownerIndex >= 0 ? memberNames[d.ownerIndex] : "—";
          return (
            <span
              key={d.ymd}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px]"
            >
              <span className="text-muted-foreground">
                {WEEKDAY_LABELS_ID[d.dow as Weekday]} {+dd}/{+m}
              </span>
              <span className="font-semibold">{shortName(name)}</span>
            </span>
          );
        })}
      </div>
      {mode === "daily" && (
        <p className="text-[10.5px] text-muted-foreground mt-1.5">
          Mode harian: mengubah hari/urutan dapat menggeser giliran.
        </p>
      )}
    </div>
  );
}

export function AssignmentManager({
  initial,
  checklists,
  employees,
}: {
  initial: CleaningAssignmentRow[];
  checklists: CleaningChecklist[];
  employees: CleaningEmployee[];
}) {
  const { run, pending, startTransition, router } = useRunAction();
  const [assignMode, setAssignMode] = useState<"single" | "rotation">("single");
  const [checklistId, setChecklistId] = useState("");
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [rotationMode, setRotationMode] = useState<RotationMode>("daily");
  const [weekdays, setWeekdays] = useState(WORKDAYS_DEFAULT);
  const [blockCheckout, setBlockCheckout] = useState(false);
  const [skipHolidays, setSkipHolidays] = useState(false);
  const [winMode, setWinMode] = useState("anytime");
  const [winStart, setWinStart] = useState("");
  const [winEnd, setWinEnd] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  function resetForm() {
    setChecklistId("");
    setUserId("");
    setMembers([]);
    setRotationMode("daily");
    setWeekdays(WORKDAYS_DEFAULT);
    setBlockCheckout(false);
    setSkipHolidays(false);
    setWinMode("anytime");
    setWinStart("");
    setWinEnd("");
  }

  function onAssign() {
    if (!checklistId) {
      toast.error("Pilih checklist");
      return;
    }
    startTransition(async () => {
      const res =
        assignMode === "rotation"
          ? await assignRotation({
              checklist_id: checklistId,
              member_user_ids: members,
              weekdays,
              block_checkout: blockCheckout,
              skip_holidays: skipHolidays,
              rotation_mode: rotationMode,
              window_mode: winMode,
              window_start: winStart || null,
              window_end: winEnd || null,
            })
          : await assignChecklist({
              checklist_id: checklistId,
              user_id: userId,
              weekdays,
              block_checkout: blockCheckout,
              skip_holidays: skipHolidays,
              window_mode: winMode,
              window_start: winStart || null,
              window_end: winEnd || null,
            });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(assignMode === "rotation" ? "Rotasi dibuat" : "Assignment dibuat");
      resetForm();
      router.refresh();
    });
  }

  const activeChecklists = checklists.filter((c) => c.is_active);
  const memberNames = members.map(
    (id) => employees.find((e) => e.id === id)?.name ?? "—"
  );

  // Build render order: standalone rows individually; rotation rows grouped
  // (first occurrence) into one card. listAssignments orders by rotation_order.
  type Entry =
    | { type: "single"; row: CleaningAssignmentRow }
    | { type: "group"; groupId: string; rows: CleaningAssignmentRow[] };
  const entries: Entry[] = [];
  const seenGroups = new Set<string>();
  for (const a of initial) {
    if (!a.rotation_group_id) {
      entries.push({ type: "single", row: a });
    } else if (!seenGroups.has(a.rotation_group_id)) {
      seenGroups.add(a.rotation_group_id);
      entries.push({
        type: "group",
        groupId: a.rotation_group_id,
        rows: initial.filter((x) => x.rotation_group_id === a.rotation_group_id),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* New assignment / rotation */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-display text-base font-semibold">Assign checklist ke karyawan</h2>

        {/* Mode toggle */}
        <div className="flex gap-1.5">
          {(
            [
              { v: "single", label: "Satu karyawan" },
              { v: "rotation", label: "Rotasi (selang-seling)" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setAssignMode(o.v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition",
                assignMode === o.v
                  ? "bg-primary text-primary-foreground border-foreground"
                  : "bg-card text-foreground/70 border-border hover:bg-muted"
              )}
            >
              {o.v === "rotation" && <Repeat size={13} />}
              {o.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Checklist</span>
            <select
              value={checklistId}
              onChange={(e) => setChecklistId(e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm"
            >
              <option value="">— pilih —</option>
              {activeChecklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {assignMode === "single" && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Karyawan</span>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm"
              >
                <option value="">— pilih —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                    {emp.business_unit ? ` · ${emp.business_unit}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {assignMode === "rotation" && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Pola giliran</span>
              <select
                value={rotationMode}
                onChange={(e) => setRotationMode(e.target.value as RotationMode)}
                className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm"
              >
                {ROTATION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {assignMode === "rotation" && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Urutan karyawan (giliran round-robin)
            </span>
            <MemberPicker
              employees={employees}
              members={members}
              onChange={setMembers}
              disabled={pending}
            />
          </div>
        )}

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Hari wajib dikerjakan</span>
          <WeekdayPicker value={weekdays} onChange={setWeekdays} disabled={pending} />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Jam pengerjaan</span>
          <WindowFields
            mode={winMode}
            start={winStart}
            end={winEnd}
            disabled={pending}
            onChange={(m, s, e) => {
              setWinMode(m);
              setWinStart(s);
              setWinEnd(e);
            }}
          />
        </div>

        {assignMode === "rotation" && (
          <RotationPreview
            memberNames={memberNames}
            weekdays={weekdays}
            mode={rotationMode}
            anchorYmd={jakartaDateString(new Date())}
          />
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setBlockCheckout((b) => !b)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                blockCheckout
                  ? "bg-primary text-primary-foreground border-foreground"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              <Lock size={13} />
              Wajib selesai sebelum check out
            </button>
            <button
              type="button"
              onClick={() => setSkipHolidays((s) => !s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                skipHolidays
                  ? "bg-primary text-primary-foreground border-foreground"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              <CalendarOff size={13} />
              Lewati tanggal merah
            </button>
          </div>
          <Button type="button" onClick={onAssign} disabled={pending} className="gap-1.5">
            <Plus size={14} />
            {assignMode === "rotation" ? "Buat rotasi" : "Assign"}
          </Button>
        </div>
      </section>

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground italic px-1">Belum ada assignment.</p>
      )}

      <div className="space-y-2">
        {entries.map((entry) =>
          entry.type === "single" ? (
            <SingleAssignmentCard
              key={entry.row.id}
              a={entry.row}
              pending={pending}
              run={run}
              editing={editing === entry.row.id}
              onToggleEdit={() =>
                setEditing((e) => (e === entry.row.id ? null : entry.row.id))
              }
            />
          ) : (
            <RotationCard
              key={entry.groupId}
              groupId={entry.groupId}
              rows={entry.rows}
              employees={employees}
              pending={pending}
              run={run}
              editing={editing === entry.groupId}
              onToggleEdit={() =>
                setEditing((e) => (e === entry.groupId ? null : entry.groupId))
              }
            />
          )
        )}
      </div>
    </div>
  );
}

type RunFn = (
  fn: () => Promise<{ ok: true } | { error: string }>,
  ok?: string
) => void;

function SingleAssignmentCard({
  a,
  pending,
  run,
  editing,
  onToggleEdit,
}: {
  a: CleaningAssignmentRow;
  pending: boolean;
  run: RunFn;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card overflow-hidden",
        a.is_active ? "border-border" : "border-border/60 opacity-70"
      )}
    >
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {a.user_name}
            <span className="text-muted-foreground font-normal"> — {a.checklist_name}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {weekdaySummary(a.weekdays) || "Tidak ada hari"}
            {" · "}
            {windowSummary(a.window_mode, a.window_start, a.window_end)}
            {a.skip_holidays ? " · lewati libur" : ""}
            {a.business_unit ? ` · ${a.business_unit}` : ""}
          </p>
        </div>
        {a.block_checkout && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-primary text-primary-foreground">
            <Lock size={11} />
            Gate
          </span>
        )}
        <button
          type="button"
          title="Edit"
          onClick={onToggleEdit}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          title={a.is_active ? "Nonaktifkan" : "Aktifkan"}
          onClick={() => run(() => updateAssignment({ id: a.id, is_active: !a.is_active }))}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Power size={15} />
        </button>
        <button
          type="button"
          title="Hapus assignment"
          onClick={() => {
            if (confirm("Hapus assignment ini? Riwayat penyelesaiannya ikut terhapus.")) {
              run(() => deleteAssignment({ id: a.id }), "Assignment dihapus");
            }
          }}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {editing && (
        <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-3">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Hari wajib</span>
            <WeekdayPicker
              value={a.weekdays}
              onChange={(v) => run(() => updateAssignment({ id: a.id, weekdays: v }))}
              disabled={pending}
            />
          </div>
          <WindowEditor
            windowMode={a.window_mode}
            windowStart={a.window_start}
            windowEnd={a.window_end}
            disabled={pending}
            onSave={(mode, start, end) =>
              run(
                () =>
                  updateAssignment({
                    id: a.id,
                    window_mode: mode,
                    window_start: start || null,
                    window_end: end || null,
                  }),
                "Jam pengerjaan disimpan"
              )
            }
          />
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                run(() => updateAssignment({ id: a.id, block_checkout: !a.block_checkout }))
              }
              disabled={pending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                a.block_checkout
                  ? "bg-primary text-primary-foreground border-foreground"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              <Lock size={13} />
              Wajib selesai sebelum check out
            </button>
            <button
              type="button"
              onClick={() =>
                run(() => updateAssignment({ id: a.id, skip_holidays: !a.skip_holidays }))
              }
              disabled={pending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                a.skip_holidays
                  ? "bg-primary text-primary-foreground border-foreground"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              <CalendarOff size={13} />
              Lewati tanggal merah
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RotationCard({
  groupId,
  rows,
  employees,
  pending,
  run,
  editing,
  onToggleEdit,
}: {
  groupId: string;
  rows: CleaningAssignmentRow[];
  employees: CleaningEmployee[];
  pending: boolean;
  run: RunFn;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  // rows already ordered by rotation_order from listAssignments.
  const head = rows[0];
  const isActive = head.is_active;
  const memberNames = rows.map((r) => r.user_name);
  const memberIds = rows.map((r) => r.user_id);
  const modeLabel = head.rotation_mode === "weekly" ? "gantian mingguan" : "gantian harian";

  const [draftMembers, setDraftMembers] = useState<string[]>(memberIds);

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card overflow-hidden",
        isActive ? "border-primary/40" : "border-border/60 opacity-70"
      )}
    >
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-accent text-accent-foreground shrink-0">
          <Repeat size={11} />
          Rotasi
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {memberNames.map(shortName).join(" → ")}
            <span className="text-muted-foreground font-normal"> — {head.checklist_name}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {modeLabel}
            {" · "}
            {weekdaySummary(head.weekdays) || "Tidak ada hari"}
            {" · "}
            {windowSummary(head.window_mode, head.window_start, head.window_end)}
            {head.skip_holidays ? " · lewati libur" : ""}
            {head.business_unit ? ` · ${head.business_unit}` : ""}
          </p>
        </div>
        {head.block_checkout && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-primary text-primary-foreground">
            <Lock size={11} />
            Gate
          </span>
        )}
        <button
          type="button"
          title="Edit rotasi"
          onClick={onToggleEdit}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          title={isActive ? "Nonaktifkan" : "Aktifkan"}
          onClick={() =>
            run(() => updateRotation({ rotation_group_id: groupId, is_active: !isActive }))
          }
          disabled={pending}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Power size={15} />
        </button>
        <button
          type="button"
          title="Hapus rotasi"
          onClick={() => {
            if (confirm("Hapus rotasi ini? Semua anggota & riwayat penyelesaiannya ikut terhapus.")) {
              run(() => deleteRotation({ rotation_group_id: groupId }), "Rotasi dihapus");
            }
          }}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="px-4 pb-3">
        <RotationPreview
          memberNames={memberNames}
          weekdays={head.weekdays}
          mode={(head.rotation_mode as RotationMode) ?? "daily"}
          anchorYmd={head.rotation_anchor ?? jakartaDateString(new Date())}
        />
      </div>

      {editing && (
        <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-3">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Anggota & urutan</span>
            <MemberPicker
              employees={employees}
              members={draftMembers}
              onChange={setDraftMembers}
              disabled={pending}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || draftMembers.length < 2}
              onClick={() =>
                run(
                  () =>
                    setRotationMembers({
                      rotation_group_id: groupId,
                      member_user_ids: draftMembers,
                    }),
                  "Anggota rotasi disimpan"
                )
              }
              className="gap-1.5 mt-1"
            >
              <Check size={14} />
              Simpan anggota
            </Button>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Hari wajib</span>
            <WeekdayPicker
              value={head.weekdays}
              onChange={(v) => run(() => updateRotation({ rotation_group_id: groupId, weekdays: v }))}
              disabled={pending}
            />
          </div>
          <WindowEditor
            windowMode={head.window_mode}
            windowStart={head.window_start}
            windowEnd={head.window_end}
            disabled={pending}
            onSave={(mode, start, end) =>
              run(
                () =>
                  updateRotation({
                    rotation_group_id: groupId,
                    window_mode: mode,
                    window_start: start || null,
                    window_end: end || null,
                  }),
                "Jam pengerjaan disimpan"
              )
            }
          />
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                run(() =>
                  updateRotation({ rotation_group_id: groupId, block_checkout: !head.block_checkout })
                )
              }
              disabled={pending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                head.block_checkout
                  ? "bg-primary text-primary-foreground border-foreground"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              <Lock size={13} />
              Wajib selesai sebelum check out
            </button>
            <button
              type="button"
              onClick={() =>
                run(() =>
                  updateRotation({ rotation_group_id: groupId, skip_holidays: !head.skip_holidays })
                )
              }
              disabled={pending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                head.skip_holidays
                  ? "bg-primary text-primary-foreground border-foreground"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              <CalendarOff size={13} />
              Lewati tanggal merah
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
