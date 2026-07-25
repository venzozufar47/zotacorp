"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Lock,
  Power,
  Pencil,
  Clock,
  X,
  ArrowUp,
  ArrowDown,
  MapPin,
  Users,
  CalendarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  WEEKDAY_LABELS_ID,
  isWorkdayFor,
  setWorkdayBit,
  type Weekday,
} from "@/lib/utils/workdays";
import { buildBranchDutyPreview } from "@/lib/utils/cleaning-branch-duty";
import {
  saveBranchDuty,
  setBranchDutyPool,
  deleteBranchDuty,
  type CleaningChecklist,
  type BranchDutyRow,
  type CleaningLocation,
} from "@/lib/actions/cleaning.actions";
import type { CleaningEmployee } from "./CleaningAdmin";
import type { HolidayRow } from "@/lib/actions/holidays.actions";
import { useRunAction } from "./useRunAction";

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sat, Sun last
const DEFAULT_WEEKDAYS = 126; // Mon–Sat

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

interface DraftState {
  location_id: string;
  checklist_ids: string[];
  pool_ids: string[];
  weekdays: number;
  block_checkout: boolean;
  skip_holidays: boolean;
  is_active: boolean;
  window_mode: string;
  window_start: string;
  window_end: string;
}

function emptyDraft(location_id = ""): DraftState {
  return {
    location_id,
    checklist_ids: [],
    pool_ids: [],
    weekdays: DEFAULT_WEEKDAYS,
    block_checkout: true,
    skip_holidays: true,
    is_active: true,
    // Studio cleanliness is judged at closing, so the default window opens late.
    window_mode: "after",
    window_start: "19:00",
    window_end: "",
  };
}

function draftFrom(row: BranchDutyRow): DraftState {
  return {
    location_id: row.location_id,
    checklist_ids: row.slots
      .slice()
      .sort((a, b) => a.duty_slot - b.duty_slot)
      .map((s) => s.checklist_id),
    pool_ids: row.pool
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => p.user_id),
    weekdays: row.weekdays,
    block_checkout: row.block_checkout,
    skip_holidays: row.skip_holidays,
    is_active: row.is_active,
    window_mode: row.window_mode,
    window_start: row.window_start ?? "",
    window_end: row.window_end ?? "",
  };
}

/**
 * Branch duty admin: a branch owns N checklists, and whoever from its pool
 * checked in there that day picks them up (swapping daily). Nothing here binds
 * a checklist to a person — the pool only says who is *allowed* to draw one.
 */
export function BranchDutyManager({
  initial,
  checklists,
  locations,
  employees,
  holidays,
}: {
  initial: BranchDutyRow[];
  checklists: CleaningChecklist[];
  locations: CleaningLocation[];
  employees: CleaningEmployee[];
  holidays: HolidayRow[];
}) {
  const { run, pending } = useRunAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [creating, setCreating] = useState(false);

  const activeChecklists = checklists.filter((c) => c.is_active);
  const usedLocations = new Set(initial.map((r) => r.location_id));
  const freeLocations = locations.filter((l) => !usedLocations.has(l.id));

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setDraft(emptyDraft(freeLocations[0]?.id ?? ""));
  }
  function startEdit(row: BranchDutyRow) {
    setCreating(false);
    setEditing(row.location_id);
    setDraft(draftFrom(row));
  }
  function cancel() {
    setCreating(false);
    setEditing(null);
    setDraft(null);
  }

  function save(d: DraftState) {
    run(async () => {
      const res = await saveBranchDuty({
        location_id: d.location_id,
        checklist_ids: d.checklist_ids,
        weekdays: d.weekdays,
        block_checkout: d.block_checkout,
        skip_holidays: d.skip_holidays,
        is_active: d.is_active,
        window_mode: d.window_mode,
        window_start: d.window_start || null,
        window_end: d.window_end || null,
      });
      if ("error" in res) return res;
      const poolRes = await setBranchDutyPool({
        location_id: d.location_id,
        user_ids: d.pool_ids,
      });
      if ("error" in poolRes) return poolRes;
      cancel();
      return { ok: true as const };
    }, "Duty cabang disimpan");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="max-w-2xl">
            <h3 className="font-display font-bold text-[15px]">Duty per Cabang</h3>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Checklist menempel pada <strong>cabang</strong>, bukan orang. Siapa pun
              anggota pool yang absen di cabang itu hari tersebut akan kebagian —
              dan checklistnya bertukar setiap hari. Jika yang hadir lebih banyak
              dari jumlah checklist, hanya sebanyak checklist yang kebagian.
            </p>
          </div>
          <Button
            size="sm"
            onClick={startCreate}
            disabled={pending || freeLocations.length === 0}
          >
            <Plus size={14} /> Tambah cabang
          </Button>
        </div>
      </div>

      {creating && draft && (
        <DutyForm
          draft={draft}
          setDraft={setDraft}
          checklists={activeChecklists}
          locations={freeLocations}
          employees={employees}
          holidays={holidays}
          lockLocation={false}
          pending={pending}
          onCancel={cancel}
          onSave={() => save(draft)}
        />
      )}

      {initial.length === 0 && !creating && (
        <p className="text-[13px] text-muted-foreground px-1">
          Belum ada duty cabang. Klik “Tambah cabang” untuk membuat.
        </p>
      )}

      {initial.map((row) => {
        const isEditing = editing === row.location_id;
        return (
          <div
            key={row.location_id}
            className="rounded-2xl border border-border bg-card overflow-hidden"
          >
            <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <MapPin size={15} className="text-primary shrink-0" />
                  <span className="font-display font-bold text-[15px]">
                    {row.location_name}
                  </span>
                  {!row.is_active && (
                    <span className="text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                      nonaktif
                    </span>
                  )}
                  {row.block_checkout && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-destructive/10 text-destructive">
                      <Lock size={10} /> blokir pulang
                    </span>
                  )}
                  {row.skip_holidays && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                      <CalendarOff size={10} /> skip libur
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[12.5px] text-muted-foreground space-y-0.5">
                  <div>
                    Hari:{" "}
                    {DAYS.filter((d) => isWorkdayFor(row.weekdays, d))
                      .map((d) => WEEKDAY_LABELS_ID[d])
                      .join(", ") || "—"}
                    {row.window_mode === "after" && row.window_start && (
                      <>
                        {" · "}
                        <Clock size={11} className="inline -mt-0.5" /> setelah{" "}
                        {row.window_start}
                      </>
                    )}
                    {row.window_mode === "before" && row.window_end && (
                      <>
                        {" · "}
                        <Clock size={11} className="inline -mt-0.5" /> sebelum{" "}
                        {row.window_end}
                      </>
                    )}
                    {row.window_mode === "between" &&
                      row.window_start &&
                      row.window_end && (
                        <>
                          {" · "}
                          <Clock size={11} className="inline -mt-0.5" />{" "}
                          {row.window_start}–{row.window_end}
                        </>
                      )}
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Users size={12} className="mt-0.5 shrink-0" />
                    <span>
                      Pool:{" "}
                      {row.pool.length
                        ? row.pool
                            .slice()
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((p) => shortName(p.name))
                            .join(", ")
                        : "— (belum ada, duty tidak akan muncul)"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => (isEditing ? cancel() : startEdit(row))}
                  disabled={pending}
                >
                  {isEditing ? <X size={14} /> : <Pencil size={14} />}
                  {isEditing ? "Batal" : "Ubah"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (
                      !confirm(
                        `Hapus duty cabang ${row.location_name}? Riwayat pengerjaan ikut terhapus.`
                      )
                    )
                      return;
                    run(
                      () => deleteBranchDuty({ location_id: row.location_id }),
                      "Duty cabang dihapus"
                    );
                  }}
                  disabled={pending}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>

            <div className="px-4 pb-4 grid gap-2 sm:grid-cols-2">
              {row.slots
                .slice()
                .sort((a, b) => a.duty_slot - b.duty_slot)
                .map((s) => (
                  <div
                    key={s.assignment_id}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      Checklist {s.duty_slot + 1}
                    </div>
                    <div className="text-[13px] font-medium">{s.checklist_name}</div>
                  </div>
                ))}
            </div>

            {isEditing && draft && (
              <div className="border-t border-border">
                <DutyForm
                  draft={draft}
                  setDraft={setDraft}
                  checklists={activeChecklists}
                  locations={locations.filter((l) => l.id === row.location_id)}
                  employees={employees}
                  holidays={holidays}
                  lockLocation
                  pending={pending}
                  onCancel={cancel}
                  onSave={() => save(draft)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DutyForm({
  draft,
  setDraft,
  checklists,
  locations,
  employees,
  holidays,
  lockLocation,
  pending,
  onCancel,
  onSave,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  checklists: CleaningChecklist[];
  locations: CleaningLocation[];
  employees: CleaningEmployee[];
  holidays: HolidayRow[];
  lockLocation: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const patch = (p: Partial<DraftState>) => setDraft({ ...draft, ...p });

  const holidayMap = useMemo(
    () => new Map(holidays.map((h) => [h.date, h.name])),
    [holidays]
  );
  const preview = useMemo(
    () =>
      buildBranchDutyPreview({
        fromYmd: jakartaDateString(new Date()),
        anchorYmd: jakartaDateString(new Date()),
        weekdays: draft.weekdays,
        slotCount: draft.checklist_ids.length,
        count: 6,
        holidays: holidayMap,
        skipHolidays: draft.skip_holidays,
      }),
    [draft.weekdays, draft.checklist_ids.length, draft.skip_holidays, holidayMap]
  );

  function toggleChecklist(id: string) {
    patch({
      checklist_ids: draft.checklist_ids.includes(id)
        ? draft.checklist_ids.filter((x) => x !== id)
        : [...draft.checklist_ids, id],
    });
  }
  function moveChecklist(i: number, dir: -1 | 1) {
    const next = [...draft.checklist_ids];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ checklist_ids: next });
  }
  function togglePool(id: string) {
    patch({
      pool_ids: draft.pool_ids.includes(id)
        ? draft.pool_ids.filter((x) => x !== id)
        : [...draft.pool_ids, id],
    });
  }

  const nameById = new Map(checklists.map((c) => [c.id, c.name]));
  const canSave =
    !!draft.location_id && draft.checklist_ids.length > 0 && !pending;

  return (
    <div className="p-4 space-y-4 bg-muted/30">
      {!lockLocation && (
        <div>
          <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Cabang
          </label>
          <select
            value={draft.location_id}
            onChange={(e) => patch({ location_id: e.target.value })}
            className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
          >
            {locations.length === 0 && <option value="">— tidak ada —</option>}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          Checklist ({draft.checklist_ids.length} dipilih) — urutan = urutan tukar
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {checklists.map((c) => {
            const on = draft.checklist_ids.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChecklist(c.id)}
                disabled={pending}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] border transition text-left",
                  on
                    ? "bg-primary text-primary-foreground border-foreground"
                    : "bg-card text-foreground/70 border-border hover:bg-muted"
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        {draft.checklist_ids.length > 0 && (
          <ol className="mt-2 space-y-1">
            {draft.checklist_ids.map((id, i) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
              >
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">
                  Slot {i + 1}
                </span>
                <span className="text-[12.5px] flex-1 min-w-0 truncate">
                  {nameById.get(id) ?? id}
                </span>
                <button
                  type="button"
                  onClick={() => moveChecklist(i, -1)}
                  disabled={pending || i === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveChecklist(i, 1)}
                  disabled={pending || i === draft.checklist_ids.length - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"
                >
                  <ArrowDown size={13} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          Pool karyawan cabang ({draft.pool_ids.length}) — hanya mereka yang bisa
          kebagian
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {employees.map((e) => {
            const on = draft.pool_ids.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => togglePool(e.id)}
                disabled={pending}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] border transition",
                  on
                    ? "bg-primary text-primary-foreground border-foreground"
                    : "bg-card text-foreground/70 border-border hover:bg-muted"
                )}
              >
                {e.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Hari
          </label>
          <div className="mt-1.5">
            <WeekdayPicker
              value={draft.weekdays}
              onChange={(v) => patch({ weekdays: v })}
              disabled={pending}
            />
          </div>
        </div>
        <div>
          <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Jam pengerjaan
          </label>
          <div className="mt-1.5 flex gap-2 items-center flex-wrap">
            <select
              value={draft.window_mode}
              onChange={(e) => patch({ window_mode: e.target.value })}
              className="h-10 rounded-xl border border-border bg-card px-2.5 text-[13px]"
            >
              <option value="anytime">Kapan saja</option>
              <option value="after">Setelah jam…</option>
              <option value="before">Sebelum jam…</option>
              <option value="between">Antara…</option>
            </select>
            {(draft.window_mode === "after" ||
              draft.window_mode === "between") && (
              <Input
                type="time"
                value={draft.window_start}
                onChange={(e) => patch({ window_start: e.target.value })}
                className="w-32"
              />
            )}
            {(draft.window_mode === "before" ||
              draft.window_mode === "between") && (
              <Input
                type="time"
                value={draft.window_end}
                onChange={(e) => patch({ window_end: e.target.value })}
                className="w-32"
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => patch({ block_checkout: !draft.block_checkout })}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] border transition",
            draft.block_checkout
              ? "bg-destructive/10 text-destructive border-destructive"
              : "bg-card text-muted-foreground border-border"
          )}
        >
          <Lock size={12} /> Blokir check-out
        </button>
        <button
          type="button"
          onClick={() => patch({ skip_holidays: !draft.skip_holidays })}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] border transition",
            draft.skip_holidays
              ? "bg-primary text-primary-foreground border-foreground"
              : "bg-card text-muted-foreground border-border"
          )}
        >
          <CalendarOff size={12} /> Lewati libur nasional
        </button>
        <button
          type="button"
          onClick={() => patch({ is_active: !draft.is_active })}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] border transition",
            draft.is_active
              ? "bg-primary text-primary-foreground border-foreground"
              : "bg-card text-muted-foreground border-border"
          )}
        >
          <Power size={12} /> {draft.is_active ? "Aktif" : "Nonaktif"}
        </button>
      </div>

      {preview.length > 0 && draft.checklist_ids.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Pratinjau pergantian
          </div>
          <div className="mt-1.5 space-y-1">
            {preview.map((d) => (
              <div key={d.ymd} className="text-[12px] flex gap-2 flex-wrap">
                <span className="font-mono tabular-nums text-muted-foreground w-24 shrink-0">
                  {d.ymd}
                </span>
                {d.slotByRank === null ? (
                  <span className="text-muted-foreground italic">
                    {d.holiday ?? "dilewati"}
                  </span>
                ) : (
                  d.slotByRank.map((slot, rank) => (
                    <span key={rank} className="text-foreground/80">
                      Orang {rank + 1} → Slot {slot + 1}
                    </span>
                  ))
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            “Orang 1/2” = urutan anggota pool yang hadir hari itu, bukan nama tetap.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          Simpan
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          Batal
        </Button>
      </div>
    </div>
  );
}
