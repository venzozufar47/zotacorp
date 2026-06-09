"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Lock, Power, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_LABELS_ID,
  WORKDAYS_DEFAULT,
  isWorkdayFor,
  setWorkdayBit,
  type Weekday,
} from "@/lib/utils/workdays";
import {
  assignChecklist,
  updateAssignment,
  deleteAssignment,
  type CleaningChecklist,
  type CleaningAssignmentRow,
} from "@/lib/actions/cleaning.actions";
import type { CleaningEmployee } from "./CleaningAdmin";

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sat, Sun last

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

export function AssignmentManager({
  initial,
  checklists,
  employees,
}: {
  initial: CleaningAssignmentRow[];
  checklists: CleaningChecklist[];
  employees: CleaningEmployee[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checklistId, setChecklistId] = useState("");
  const [userId, setUserId] = useState("");
  const [weekdays, setWeekdays] = useState(WORKDAYS_DEFAULT);
  const [blockCheckout, setBlockCheckout] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: true } | { error: string }>, ok?: string) {
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  function onAssign() {
    if (!checklistId || !userId) {
      toast.error("Pilih checklist dan karyawan");
      return;
    }
    startTransition(async () => {
      const res = await assignChecklist({
        checklist_id: checklistId,
        user_id: userId,
        weekdays,
        block_checkout: blockCheckout,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Assignment dibuat");
      setChecklistId("");
      setUserId("");
      setWeekdays(WORKDAYS_DEFAULT);
      setBlockCheckout(false);
      router.refresh();
    });
  }

  const activeChecklists = checklists.filter((c) => c.is_active);

  return (
    <div className="space-y-4">
      {/* New assignment */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-display text-base font-semibold">Assign checklist ke karyawan</h2>
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
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Hari wajib dikerjakan</span>
          <WeekdayPicker value={weekdays} onChange={setWeekdays} disabled={pending} />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
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
          <Button type="button" onClick={onAssign} disabled={pending} className="gap-1.5">
            <Plus size={14} />
            Assign
          </Button>
        </div>
      </section>

      {initial.length === 0 && (
        <p className="text-sm text-muted-foreground italic px-1">
          Belum ada assignment.
        </p>
      )}

      <div className="space-y-2">
        {initial.map((a) => (
          <section
            key={a.id}
            className={cn(
              "rounded-2xl border bg-card overflow-hidden",
              a.is_active ? "border-border" : "border-border/60 opacity-70"
            )}
          >
            <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {a.user_name}
                  <span className="text-muted-foreground font-normal">
                    {" "}— {a.checklist_name}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {weekdaySummary(a.weekdays) || "Tidak ada hari"}
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
                onClick={() => setEditing((e) => (e === a.id ? null : a.id))}
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

            {editing === a.id && (
              <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Hari wajib</span>
                  <WeekdayPicker
                    value={a.weekdays}
                    onChange={(v) => run(() => updateAssignment({ id: a.id, weekdays: v }))}
                    disabled={pending}
                  />
                </div>
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
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
