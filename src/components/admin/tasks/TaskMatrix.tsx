"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Hourglass,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  assignEmployeesToTask,
  getTaskMatrix,
  moveTaskStart,
  reassignCopyToTask,
} from "@/lib/actions/task-matrix.actions";
import { cancelAssignedTask, deleteAssignedTaskRow } from "@/lib/actions/assigned-tasks.actions";
import {
  MATRIX_DAY_OPTIONS,
  type MatrixCopy,
  type MatrixEmployee,
  type MatrixRow,
  type TaskMatrixData,
} from "@/lib/tasks/matrix-types";
import { jakartaDateMinusDays, jakartaDateString } from "@/lib/utils/jakarta";
import { Shell, inputCls } from "@/components/admin/registry/RegistryUi";
import { categoryStyle, type CategoryStyle } from "@/lib/tasks/category-colors";

type Drag =
  | { kind: "employee"; employeeId: string }
  | { kind: "copy"; copy: MatrixCopy; rowId: string; rowTitle: string };

const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function parts(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

function isScheduled(c: MatrixCopy, today: string) {
  return c.status === "open" && c.startDate > today;
}

/** Boleh ditarik kembali (dibatalkan) dengan menyeret ke daftar karyawan. */
function isWithdrawable(c: MatrixCopy) {
  return c.status === "open" || c.status === "submitted";
}

/** Boleh dipindah ke tugas lain: belum dikerjakan sama sekali (tanpa foto/riwayat). */
function isMovable(c: MatrixCopy) {
  return c.status === "open" && c.round === 1 && c.doneCount === 0;
}

/** Warna chip menurut keadaan — satu bahasa visual di seluruh matriks. */
function chipTone(c: MatrixCopy, today: string): string {
  if (c.status === "submitted") return "bg-primary text-primary-foreground border-primary";
  if (c.status === "approved") return "bg-success/25 border-success/60 text-foreground";
  if (isScheduled(c, today)) return "bg-muted border-dashed border-foreground/40 text-muted-foreground";
  if (c.round > 1) return "bg-destructive/15 border-destructive/50 text-foreground";
  if (c.deferredToday) return "bg-warning/20 border-warning/60 text-foreground";
  return "bg-warning/40 border-warning text-foreground";
}

export function TaskMatrix({
  onOpenTask,
  refreshKey,
  onChanged,
}: {
  /** Buka panel verifikasi/detail satu tugas. */
  onOpenTask: (taskId: string) => void;
  /** Naik tiap kali daftar di luar matriks berubah (mis. dialog ditutup) → muat ulang. */
  refreshKey: number;
  /** Dipanggil setelah matriks mengubah data (agar tampilan Daftar ikut segar). */
  onChanged: () => void;
}) {
  const todayNow = jakartaDateString(new Date());
  const [from, setFrom] = useState(() => jakartaDateMinusDays(jakartaDateString(new Date()), 3));
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<TaskMatrixData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ rowId: string; date: string } | null>(null);
  const [query, setQuery] = useState("");
  // "all" | "none" (tanpa kategori) | id kategori — memfilter baris matriks.
  const [categoryFilter, setCategoryFilter] = useState("all");
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  // Cermin state dari dragRef untuk dipakai saat render (ref tak boleh dibaca di render).
  const [withdrawOk, setWithdrawOk] = useState(false);
  const reqRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const id = ++reqRef.current;
    getTaskMatrix(from, days).then((res) => {
      if (id !== reqRef.current) return; // jawaban usang
      if (res.ok && res.data) {
        setData(res.data);
        setError(null);
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }, [from, days, version, refreshKey]);

  const loading = !data || data.from !== from || data.days !== days;

  // Di layar sempit kolom hari ini bisa di luar layar → gulirkan ke sana
  // setiap rentang baru termuat (di desktop semua kolom muat, tidak ada efek).
  const loadedFrom = loading ? null : data?.from;
  useEffect(() => {
    if (!loadedFrom) return;
    const box = scrollerRef.current;
    const todayCell = box?.querySelector<HTMLElement>("[data-today='1']");
    if (!box || !todayCell) return;
    const label = box.querySelector<HTMLElement>("[data-label-col='1']");
    const left =
      todayCell.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollLeft = Math.max(0, left - (label?.offsetWidth ?? 0) - 4);
  }, [loadedFrom]);
  const today = data?.today ?? todayNow;
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => jakartaDateMinusDays(from, -i)),
    [from, days]
  );

  // Chip → kolom: tanggal mulai, atau kolom pertama bila mulai sebelum jendela.
  const placed = useMemo(() => {
    const m = new Map<string, MatrixCopy[]>();
    for (const row of data?.rows ?? []) {
      for (const c of row.copies) {
        const col = c.startDate < from ? from : c.startDate;
        const key = `${row.rowId}|${col}`;
        const list = m.get(key) ?? [];
        list.push(c);
        m.set(key, list);
      }
    }
    return m;
  }, [data, from]);

  const visibleRows = useMemo(
    () =>
      (data?.rows ?? []).filter((r) =>
        categoryFilter === "all"
          ? true
          : categoryFilter === "none"
            ? r.categoryId === null
            : r.categoryId === categoryFilter
      ),
    [data, categoryFilter]
  );

  const totals = useMemo(() => {
    const all = (data?.rows ?? []).flatMap((r) => r.copies);
    return {
      unassigned: (data?.rows ?? []).filter((r) => r.backlogTaskId).length,
      review: all.filter((c) => c.status === "submitted").length,
      running: all.filter((c) => c.status === "open" && c.startDate <= today).length,
      scheduled: all.filter((c) => isScheduled(c, today)).length,
      done: all.filter((c) => c.status === "approved").length,
    };
  }, [data, today]);

  function canDrop(rowId: string, date: string): boolean {
    const d = dragRef.current;
    if (!d || date < today) return false;
    if (d.kind === "employee") return true;
    // Baris yang sama: hanya geser tanggal tugas terjadwal. Baris lain: pindah tugas.
    if (d.rowId === rowId) return isScheduled(d.copy, today) && d.copy.startDate !== date;
    return isMovable(d.copy);
  }

  /** Seret chip ke daftar karyawan = tarik kembali penugasannya. */
  function canWithdraw(): boolean {
    const d = dragRef.current;
    return d !== null && d.kind === "copy" && isWithdrawable(d.copy);
  }

  async function handleWithdraw() {
    const d = dragRef.current;
    const allowed = canWithdraw();
    dragRef.current = null;
    setDragging(false);
    setHover(null);
    if (!d || d.kind !== "copy" || !allowed) return;
    const c = d.copy;
    const risky = c.status === "submitted" || c.doneCount > 0;
    if (
      risky &&
      !window.confirm(
        `Tarik ${c.assigneeName} dari "${d.rowTitle}"? ${
          c.status === "submitted"
            ? "Tugasnya sudah dikirim dan menunggu verifikasi."
            : `Sudah ada ${c.doneCount} foto yang dikerjakan.`
        } Tugas ini dibatalkan untuknya.`
      )
    )
      return;
    setBusy(true);
    const res = await cancelAssignedTask(c.taskId);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else toast.success(`${c.assigneeName} ditarik dari "${d.rowTitle}"`);
    reload();
    onChanged();
  }

  async function runAssign(rowId: string, ids: string[], date: string) {
    setBusy(true);
    const res = await assignEmployeesToTask({ rowId, assigneeIds: ids, startDate: date });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const created = res.data?.created ?? [];
    const skipped = res.data?.skipped.length ?? 0;
    toast.success(
      `${created.length} karyawan ditugaskan mulai ${parts(date).d} ${MONTH[parts(date).m - 1]}` +
        (skipped ? ` · ${skipped} dilewati (sudah punya tugas ini)` : ""),
      {
        action: {
          label: "Urungkan",
          onClick: async () => {
            await Promise.all(created.map((c) => cancelAssignedTask(c.taskId)));
            reload();
            onChanged();
          },
        },
      }
    );
    reload();
    onChanged();
  }

  async function handleDelete(row: MatrixRow) {
    const active = row.copies.filter((c) => c.status === "open" || c.status === "submitted").length;
    const done = row.copies.filter((c) => c.status === "approved").length;
    const parts: string[] = [];
    if (row.copies.length > 0) parts.push(`${row.copies.length} penerima`);
    if (active > 0) parts.push(`${active} masih berjalan/menunggu verifikasi`);
    if (done > 0) parts.push(`${done} sudah selesai`);
    const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    if (
      !window.confirm(
        `Hapus permanen tugas "${row.title}"${detail}?\n\nSemua salinan, foto bukti, dan riwayat verifikasinya ikut terhapus dan tidak bisa dikembalikan.${
          active > 0 ? " Tugas yang masih berjalan hilang dari karyawan." : ""
        }`
      )
    )
      return;
    setBusy(true);
    const res = await deleteAssignedTaskRow(row.rowId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Tugas dihapus");
    reload();
    onChanged();
  }

  async function handleDrop(rowId: string, date: string) {
    const d = dragRef.current;
    // Periksa SEBELUM dragRef dikosongkan — canDrop membacanya.
    const allowed = d !== null && canDrop(rowId, date);
    dragRef.current = null;
    setDragging(false);
    setHover(null);
    if (!d || !allowed) return;
    if (d.kind === "employee") {
      await runAssign(rowId, [d.employeeId], date);
    } else if (d.rowId !== rowId) {
      setBusy(true);
      const res = await reassignCopyToTask({
        taskId: d.copy.taskId,
        targetRowId: rowId,
        startDate: date,
      });
      setBusy(false);
      if (!res.ok) toast.error(res.error);
      else
        toast.success(
          `${d.copy.assigneeName} dipindah dari "${d.rowTitle}" ke tugas lain, mulai ${parts(date).d} ${MONTH[parts(date).m - 1]}`
        );
      reload();
      onChanged();
    } else {
      setBusy(true);
      const res = await moveTaskStart({ taskId: d.copy.taskId, startDate: date });
      setBusy(false);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Jadwal dipindah ke ${parts(date).d} ${MONTH[parts(date).m - 1]}`);
      reload();
      onChanged();
    }
  }

  const employees = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.employees ?? [];
    return q ? list.filter((e) => e.name.toLowerCase().includes(q)) : list;
  }, [data, query]);

  const gridCols = `clamp(108px, 22vw, 220px) repeat(${days}, minmax(92px, 1fr))`;
  const rangeLabel = `${parts(from).d} ${MONTH[parts(from).m - 1]} – ${parts(dates[dates.length - 1]).d} ${MONTH[parts(dates[dates.length - 1]).m - 1]} ${parts(dates[dates.length - 1]).y}`;

  return (
    <div className="space-y-3">
      {/* Ringkasan helicopter — hanya tugas pada rentang yang sedang ditampilkan */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Belum ditugaskan" value={totals.unassigned} tone="bg-card" />
        <Stat label="Perlu verifikasi" value={totals.review} tone="bg-primary text-primary-foreground" />
        <Stat label="Dikerjakan" value={totals.running} tone="bg-warning/40" />
        <Stat label="Terjadwal (rentang ini)" value={totals.scheduled} tone="bg-muted" />
        <Stat label="Selesai" value={totals.done} tone="bg-success/30" />
      </div>

      {/* Navigasi rentang */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mundur 7 hari"
            onClick={() => setFrom((f) => jakartaDateMinusDays(f, 7))}
            className="size-10 grid place-items-center rounded-xl border border-border hover:bg-muted"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setFrom(jakartaDateMinusDays(todayNow, 3))}
            className="h-10 px-3 rounded-xl border border-border text-sm font-medium hover:bg-muted"
          >
            Hari ini
          </button>
          <button
            type="button"
            aria-label="Maju 7 hari"
            onClick={() => setFrom((f) => jakartaDateMinusDays(f, -7))}
            className="size-10 grid place-items-center rounded-xl border border-border hover:bg-muted"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <p className="text-sm font-semibold">{rangeLabel}</p>
        <div className="ml-auto flex items-center gap-2">
          {(busy || loading) && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
          <select
            aria-label="Rentang hari"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-10 rounded-xl border border-border bg-background px-2 text-sm"
          >
            {MATRIX_DAY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} hari
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Muat ulang"
            onClick={reload}
            className="size-10 grid place-items-center rounded-xl border border-border hover:bg-muted"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border-2 border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Legenda kategori — sekaligus filter (ketuk untuk menyaring baris) */}
      {(data?.categories.length ?? 0) > 0 && (
        <div role="group" aria-label="Filter kategori" className="flex flex-wrap gap-1.5">
          {[
            ...(data?.categories ?? []).map((c) => ({ key: c.id, label: c.name, id: c.id as string | null })),
            { key: "none", label: "Tanpa kategori", id: null as string | null },
          ].map((c) => {
            const st = categoryStyle(data?.categories ?? [], c.id);
            const count = (data?.rows ?? []).filter((r) => r.categoryId === c.id).length;
            if (c.key === "none" && count === 0) return null;
            const active = categoryFilter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => setCategoryFilter(active ? "all" : c.key)}
                className={
                  "h-8 pl-2 pr-2.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition " +
                  (active
                    ? "border-foreground " + st.soft
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")
                }
              >
                <span className={"size-2.5 rounded-full shrink-0 " + st.dot} aria-hidden />
                {c.label}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <span className="hidden md:inline">
          Seret nama karyawan dari panel kanan ke sel (tugas × tanggal) untuk menugaskan mulai
          tanggal itu — termasuk baris “Belum ditugaskan” yang belum punya penerima. Seret chip
          nama ke tanggal lain untuk menggeser jadwal (tugas terjadwal), ke baris tugas lain untuk
          memindahkan (belum dikerjakan), atau ke daftar karyawan untuk menarik kembali.{" "}
        </span>
        Ketuk sel kosong atau tombol + di baris untuk menugaskan. Ketuk chip untuk membuka tugas.
      </p>

      <div className="flex gap-3 items-start">
        {/* Matriks */}
        <div
          ref={scrollerRef}
          className="flex-1 min-w-0 rounded-2xl border border-border bg-card overflow-auto max-h-[70vh]"
        >
          <div className="grid min-w-max" style={{ gridTemplateColumns: gridCols }}>
            {/* Header tanggal */}
            <div
              data-label-col="1"
              className="sticky top-0 left-0 z-30 bg-card border-b border-r border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
            >
              Tugas
            </div>
            {dates.map((d) => {
              const p = parts(d);
              const isToday = d === today;
              const weekend = p.dow === 0 || p.dow === 6;
              return (
                <div
                  key={d}
                  data-today={isToday ? "1" : undefined}
                  className={
                    "sticky top-0 z-20 border-b border-border px-1 py-1.5 text-center leading-tight " +
                    (isToday ? "bg-primary text-primary-foreground" : weekend ? "bg-muted" : "bg-card")
                  }
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                    {DOW[p.dow]}
                  </p>
                  <p className="text-sm font-bold tabular-nums">
                    {p.d}
                    {(p.d === 1 || d === dates[0]) && (
                      <span className="text-[10px] font-medium opacity-80"> {MONTH[p.m - 1]}</span>
                    )}
                  </p>
                </div>
              );
            })}

            {/* Baris tugas */}
            {visibleRows.length === 0 && !loading && (
              <div
                className="col-span-full px-4 py-10 text-center text-sm text-muted-foreground"
                style={{ gridColumn: `1 / -1` }}
              >
                Tidak ada tugas pada rentang ini.
              </div>
            )}
            {visibleRows.map((row) => (
              <MatrixRowView
                key={row.rowId}
                row={row}
                dates={dates}
                today={today}
                placed={placed}
                from={from}
                hover={hover}
                dragging={dragging}
                onHover={setHover}
                canDrop={canDrop}
                onDrop={handleDrop}
                onCopyDragStart={(c) => {
                  dragRef.current = {
                    kind: "copy",
                    copy: c,
                    rowId: row.rowId,
                    rowTitle: row.title,
                  };
                  setWithdrawOk(isWithdrawable(c));
                  setDragging(true);
                }}
                onDragEnd={() => {
                  dragRef.current = null;
                  setDragging(false);
                  setHover(null);
                }}
                onOpenTask={onOpenTask}
                onPick={(date) => setPicker({ rowId: row.rowId, date })}
                onDelete={() => void handleDelete(row)}
                catStyle={categoryStyle(data?.categories ?? [], row.categoryId)}
              />
            ))}
          </div>
        </div>

        {/* Panel karyawan (desktop): sumber seret */}
        <aside
          onDragOver={(e) => {
            if (!canWithdraw()) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (hover !== "panel") setHover("panel");
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            if (hover === "panel") setHover(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            void handleWithdraw();
          }}
          className={
            "hidden md:flex flex-col w-56 shrink-0 rounded-2xl border bg-card sticky top-20 max-h-[70vh] transition-colors " +
            (hover === "panel" && dragging && withdrawOk
              ? "border-destructive ring-2 ring-destructive bg-destructive/5"
              : "border-border")
          }
        >
          <div className="p-2 border-b border-border">
            <p className="px-1 pb-1.5 text-xs font-semibold">Karyawan · seret ke sel</p>
            <p className="px-1 pb-1.5 text-[10px] text-muted-foreground">
              {dragging && withdrawOk
                ? "Lepas di sini untuk menarik penugasan"
                : "Seret nama dari sel ke sini untuk menarik kembali penugasan"}
            </p>
            <label className="relative block">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari…"
                className="w-full h-9 rounded-lg border border-border bg-background pl-8 pr-2 text-sm"
              />
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto p-2 space-y-1">
            {employees.map((e) => (
              <EmployeeChip
                key={e.id}
                employee={e}
                onDragStart={() => {
                  dragRef.current = { kind: "employee", employeeId: e.id };
                  setWithdrawOk(false);
                  setDragging(true);
                }}
                onDragEnd={() => {
                  dragRef.current = null;
                  setDragging(false);
                  setHover(null);
                }}
              />
            ))}
            {employees.length === 0 && (
              <li className="px-1 py-3 text-xs text-muted-foreground">Tidak ada karyawan.</li>
            )}
          </ul>
        </aside>
      </div>

      {picker && data && (
        <AssignPicker
          row={data.rows.find((r) => r.rowId === picker.rowId)}
          employees={data.employees}
          initialDate={picker.date}
          today={today}
          onClose={() => setPicker(null)}
          onSubmit={async (ids, date) => {
            setPicker(null);
            await runAssign(picker.rowId, ids, date);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl border border-border px-3 py-2 ${tone}`}>
      <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-medium mt-1 opacity-90">{label}</p>
    </div>
  );
}

function EmployeeChip({
  employee,
  onDragStart,
  onDragEnd,
}: {
  employee: MatrixEmployee;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const load = employee.openCount;
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", employee.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-primary/60 select-none"
    >
      <GripVertical size={14} className="text-muted-foreground shrink-0" aria-hidden />
      <span className="grid place-items-center size-6 shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
        {initials(employee.name)}
      </span>
      <span className="flex-1 min-w-0 truncate text-sm">{employee.name}</span>
      <span
        title={`${load} tugas sedang berjalan`}
        className={
          "shrink-0 min-w-5 h-5 px-1 rounded-full text-[11px] font-bold grid place-items-center " +
          (load >= 5
            ? "bg-destructive text-white"
            : load >= 3
              ? "bg-warning text-foreground"
              : load > 0
                ? "bg-muted"
                : "text-muted-foreground")
        }
      >
        {load}
      </span>
    </li>
  );
}

function MatrixRowView({
  row,
  dates,
  today,
  placed,
  from,
  hover,
  dragging,
  onHover,
  canDrop,
  onDrop,
  onCopyDragStart,
  onDragEnd,
  onOpenTask,
  onPick,
  onDelete,
  catStyle,
}: {
  row: MatrixRow;
  dates: string[];
  today: string;
  placed: Map<string, MatrixCopy[]>;
  from: string;
  hover: string | null;
  dragging: boolean;
  onHover: (key: string | null) => void;
  canDrop: (rowId: string, date: string) => boolean;
  onDrop: (rowId: string, date: string) => void;
  onCopyDragStart: (c: MatrixCopy) => void;
  onDragEnd: () => void;
  onOpenTask: (taskId: string) => void;
  onPick: (date: string) => void;
  onDelete: () => void;
  catStyle: CategoryStyle;
}) {
  const doneN = row.copies.filter((c) => c.status === "approved").length;
  const reviewN = row.copies.filter((c) => c.status === "submitted").length;

  return (
    <>
      {/* Label baris (menempel di kiri saat digulir) */}
      <div
        className={
          "sticky left-0 z-10 bg-card border-b border-r border-border border-l-4 px-3 py-2 flex flex-col gap-1 min-h-16 " +
          catStyle.bar
        }
      >
        <div className="flex items-start gap-1">
          {row.backlogTaskId ? (
            <button
              type="button"
              onClick={() => onOpenTask(row.backlogTaskId as string)}
              title="Buka / edit tugas ini"
              className="flex-1 min-w-0 text-left text-sm font-semibold leading-snug line-clamp-2 break-words hover:underline"
            >
              {row.title}
            </button>
          ) : (
            <p className="flex-1 min-w-0 text-sm font-semibold leading-snug line-clamp-2 break-words">
              {row.title}
            </p>
          )}
          <button
            type="button"
            aria-label={`Tugaskan karyawan ke ${row.title}`}
            onClick={() => onPick(today)}
            className="shrink-0 size-7 grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            aria-label={`Hapus tugas ${row.title}`}
            title="Hapus tugas"
            onClick={onDelete}
            className="shrink-0 size-7 grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:bg-muted"
          >
            <Trash2 size={13} />
          </button>
        </div>
        {row.categoryName && (
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground min-w-0">
            <span className={"size-2 rounded-full shrink-0 " + catStyle.dot} aria-hidden />
            <span className="truncate">{row.categoryName}</span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {row.backlogTaskId ? (
            <span className="rounded-full border border-dashed border-foreground/40 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              Belum ditugaskan
            </span>
          ) : (
            <>
              {row.copies.length} penerima · {doneN} selesai
            </>
          )}
          {reviewN > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {reviewN} verifikasi
            </span>
          )}
        </p>
      </div>

      {dates.map((date) => {
        const key = `${row.rowId}|${date}`;
        const copies = placed.get(key) ?? [];
        const past = date < today;
        const isToday = date === today;
        const droppable = dragging && canDrop(row.rowId, date);
        const active = hover === key && droppable;
        return (
          <div
            key={date}
            onDragOver={(e) => {
              if (!canDrop(row.rowId, date)) return;
              e.preventDefault();
              // Harus sama dengan effectAllowed sumber seretan (karyawan = copy,
              // chip = move) — kalau beda, browser membatalkan drop diam-diam
              // walau sel sudah menyala.
              e.dataTransfer.dropEffect =
                e.dataTransfer.effectAllowed === "move" ? "move" : "copy";
              if (hover !== key) onHover(key);
            }}
            onDragLeave={(e) => {
              // Pindah ke elemen anak (chip) bukan "keluar dari sel".
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (hover === key) onHover(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(row.rowId, date);
            }}
            className={
              "group relative border-b border-border p-1 flex flex-col gap-1 min-h-16 transition-colors " +
              (active
                ? "bg-primary/20 ring-2 ring-inset ring-primary"
                : droppable
                  ? "bg-primary/5"
                  : isToday
                    ? "bg-primary/5"
                    : past
                      ? "bg-muted/30"
                      : "")
            }
          >
            {copies.map((c) => (
              <CopyChip
                key={c.taskId}
                copy={c}
                today={today}
                beforeWindow={c.startDate < from}
                onDragStart={() => onCopyDragStart(c)}
                onDragEnd={onDragEnd}
                onOpen={() => onOpenTask(c.taskId)}
              />
            ))}
            {!past && !dragging && (
              <button
                type="button"
                onClick={() => onPick(date)}
                aria-label={`Tugaskan ke ${row.title} mulai ${date}`}
                className={
                  "rounded-md text-muted-foreground/0 group-hover:text-muted-foreground hover:bg-muted grid place-items-center " +
                  (copies.length === 0 ? "flex-1 min-h-10" : "h-5")
                }
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function CopyChip({
  copy,
  today,
  beforeWindow,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  copy: MatrixCopy;
  today: string;
  beforeWindow: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const scheduled = isScheduled(copy, today);
  const canDrag = isWithdrawable(copy);
  const age = copy.status === "open" && !scheduled ? dayDiff(today, copy.startDate) : 0;
  const statusText =
    copy.status === "submitted"
      ? "Perlu verifikasi"
      : copy.status === "approved"
        ? "Selesai"
        : scheduled
          ? `Terjadwal · mulai ${copy.startDate}`
          : copy.round > 1
            ? `Pengulangan ke-${copy.round}`
            : copy.deferredToday
              ? "Ditunda hari ini"
              : age >= 1
                ? `Dikerjakan · sudah ${age} hari`
                : "Dikerjakan";
  return (
    <button
      type="button"
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", copy.taskId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title={`${copy.assigneeName} — ${statusText} (${copy.doneCount}/${copy.itemCount} foto)`}
      className={
        "w-full text-left rounded-lg border px-1.5 py-1 text-[11px] leading-tight " +
        chipTone(copy, today) +
        (canDrag ? " cursor-grab active:cursor-grabbing" : "")
      }
    >
      <span className="flex items-center gap-1">
        {copy.status === "submitted" && <Hourglass size={10} className="shrink-0" />}
        <span className="font-semibold truncate">{firstName(copy.assigneeName)}</span>
        {age >= 1 && (
          <span className="ml-auto shrink-0 rounded bg-foreground/10 px-1 text-[10px] font-bold">
            {age}h
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-1 opacity-80">
        <span>
          {copy.doneCount}/{copy.itemCount}
        </span>
        {beforeWindow && <span title={`Mulai ${copy.startDate}`}>◂</span>}
        {copy.round > 1 && copy.status === "open" && <span>↺{copy.round}</span>}
      </span>
    </button>
  );
}

function AssignPicker({
  row,
  employees,
  initialDate,
  today,
  onClose,
  onSubmit,
}: {
  row: MatrixRow | undefined;
  employees: MatrixEmployee[];
  initialDate: string;
  today: string;
  onClose: () => void;
  onSubmit: (ids: string[], date: string) => void | Promise<void>;
}) {
  const [date, setDate] = useState(initialDate < today ? today : initialDate);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const taken = new Set(
    (row?.copies ?? [])
      .filter((c) => c.status === "open" || c.status === "submitted")
      .map((c) => c.assigneeId)
  );
  const shown = employees.filter((e) => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(id: string) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <Shell title={row ? `Tugaskan: ${row.title}` : "Tugaskan"} onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-xs font-semibold">
          Mulai tanggal
          <input
            type="date"
            className={inputCls + " h-11"}
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value || today)}
          />
          <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
            {date > today
              ? "Muncul di karyawan dan dipush pada tanggal ini."
              : "Hari ini — langsung muncul dan dipush sekarang."}
          </span>
        </label>

        <div className="space-y-2">
          <input
            type="search"
            className={inputCls + " !mt-0 h-11"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama…"
          />
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {shown.map((e) => {
              const isTaken = taken.has(e.id);
              return (
                <label
                  key={e.id}
                  className={
                    "flex items-center gap-3 px-3 min-h-12 text-sm " +
                    (isTaken ? "opacity-50" : "cursor-pointer hover:bg-muted/50")
                  }
                >
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    disabled={isTaken}
                    checked={picked.has(e.id)}
                    onChange={() => toggle(e.id)}
                  />
                  <span className="flex-1 min-w-0 truncate">{e.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {isTaken ? "sudah ada" : `${e.openCount} tugas`}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="sticky -bottom-4 -mx-4 -mb-4 px-4 py-3 bg-card border-t border-border flex gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={() => void onSubmit([...picked], date)}
            className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {picked.size > 1 ? `Tugaskan ${picked.size} karyawan` : "Tugaskan"}
          </button>
        </div>
      </div>
    </Shell>
  );
}
