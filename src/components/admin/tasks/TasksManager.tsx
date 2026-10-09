"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
  Search,
  Tags,
  Users,
} from "lucide-react";
import type { AdminTaskRow, AdminTeam, TaskCategory, TaskStatus } from "@/lib/tasks/types";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { fmtStart, timeAgo } from "@/lib/tasks/format";
import { TaskFormDialog } from "./TaskFormDialog";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { TeamsDialog } from "./TeamsDialog";
import { TaskMatrix } from "./TaskMatrix";
import { CategoriesDialog } from "./CategoriesDialog";

export interface AssignableEmployee {
  id: string;
  name: string;
  businessUnit: string | null;
}

type Tab = "review" | "backlog" | "running" | "done";

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Belum ditugaskan",
  open: "Dikerjakan",
  submitted: "Perlu verifikasi",
  approved: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: "bg-muted text-muted-foreground",
  open: "bg-warning/40",
  submitted: "bg-primary text-primary-foreground",
  approved: "bg-success/40",
  cancelled: "bg-muted text-muted-foreground",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const EMPTY_COPY: Record<Tab, { title: string; hint: string }> = {
  review: {
    title: "Tidak ada yang perlu diverifikasi",
    hint: "Tugas yang sudah dikirim karyawan akan muncul di sini.",
  },
  backlog: {
    title: "Tidak ada tugas yang menunggu penugasan",
    hint: "Tugas tanpa penerima muncul di sini; tugaskan lewat tampilan Matriks.",
  },
  running: {
    title: "Tidak ada tugas yang sedang dikerjakan",
    hint: "Buat tugas baru untuk memberi pekerjaan ke karyawan.",
  },
  done: { title: "Belum ada tugas selesai", hint: "Tugas yang disetujui atau dibatalkan tampil di sini." },
};

export function TasksManager({
  tasks,
  employees,
  teams,
  categories,
  loadError,
  focusId,
}: {
  tasks: AdminTaskRow[];
  employees: AssignableEmployee[];
  teams: AdminTeam[];
  categories: TaskCategory[];
  loadError: string | null;
  focusId: string | null;
}) {
  const reviewCount = tasks.filter((t) => t.status === "submitted").length;
  const [tab, setTab] = useState<Tab>(reviewCount > 0 || focusId ? "review" : "running");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // "all" | "none" (tanpa kategori) | id kategori — hanya memfilter tampilan Daftar.
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [detailId, setDetailId] = useState<string | null>(focusId);
  const router = useRouter();
  // Matriks (helicopter view) adalah tampilan utama; Daftar untuk antrean verifikasi per status.
  const [view, setView] = useState<"matrix" | "list">("matrix");
  // Naik setiap dialog ditutup → matriks memuat ulang datanya.
  const [matrixKey, setMatrixKey] = useState(0);
  // Satu "sekarang" per render-tab agar label umur konsisten dalam satu tampilan.
  const [now] = useState(() => Date.now());
  const today = jakartaDateString(new Date(now));

  const groups = useMemo(
    () => ({
      review: tasks.filter((t) => t.status === "submitted"),
      backlog: tasks.filter((t) => t.status === "backlog"),
      running: tasks.filter((t) => t.status === "open"),
      done: tasks.filter((t) => t.status === "approved" || t.status === "cancelled"),
    }),
    [tasks]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = groups[tab].filter((t) =>
      categoryFilter === "all"
        ? true
        : categoryFilter === "none"
          ? t.categoryId === null
          : t.categoryId === categoryFilter
    );
    if (!q) return list;
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.assigneeName.toLowerCase().includes(q) ||
        (t.categoryName ?? "").toLowerCase().includes(q)
    );
  }, [groups, tab, query, categoryFilter]);

  const tabs: { key: Tab; label: string; count: number; highlight?: boolean }[] = [
    { key: "review", label: "Verifikasi", count: groups.review.length, highlight: true },
    { key: "backlog", label: "Belum ditugaskan", count: groups.backlog.length },
    { key: "running", label: "Berjalan", count: groups.running.length },
    { key: "done", label: "Selesai", count: groups.done.length },
  ];

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Toolbar: tampilan + aksi */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Tampilan"
          className="flex p-1 rounded-xl bg-muted border border-border"
        >
          {(
            [
              { key: "matrix", label: "Matriks", icon: LayoutGrid },
              { key: "list", label: "Daftar", icon: List },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={
                "h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition " +
                (view === v.key
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <v.icon size={15} />
              {v.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setCategoriesOpen(true)}
            aria-label="Kelola kategori tugas"
            title="Kategori tugas"
            className="shrink-0 h-11 px-3 rounded-xl border-2 border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted"
          >
            <Tags size={16} />
            <span className="hidden sm:inline">
              Kategori{categories.length > 0 ? ` (${categories.length})` : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTeamsOpen(true)}
            aria-label="Kelola Team leader"
            title="Team leader"
            className="shrink-0 h-11 px-3 rounded-xl border-2 border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted"
          >
            <Users size={16} />
            <span className="hidden sm:inline">Tim{teams.length > 0 ? ` (${teams.length})` : ""}</span>
          </button>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Tugas baru</span>
            <span className="sm:hidden">Baru</span>
          </button>
        </div>
      </div>

      {loadError && (
        <p className="rounded-xl border-2 border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Gagal memuat tugas: {loadError}
        </p>
      )}

      {view === "matrix" ? (
        <TaskMatrix
          onOpenTask={setDetailId}
          refreshKey={matrixKey}
          onChanged={() => router.refresh()}
        />
      ) : (
        <>
        {/* Tab segmented — ikut lebar layar, tidak membungkus di HP kecil */}
        <div
          role="tablist"
          aria-label="Status tugas"
          className="flex gap-1 p-1 rounded-2xl bg-muted border border-border overflow-x-auto"
        >
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={
                  "flex-1 min-w-0 h-11 px-2 sm:px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 sm:gap-2 transition " +
                  (active
                    ? "bg-card text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
                <span
                  className={
                    "min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center " +
                    (t.highlight && t.count > 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground border border-border")
                  }
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cari + tugas baru */}
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari judul, karyawan, atau kategori…"
              className="w-full h-11 rounded-xl border-2 border-border bg-background pl-9 pr-3 text-sm"
            />
          </label>
        </div>

        {categories.length > 0 && (
          <div
            role="group"
            aria-label="Filter kategori"
            className="flex gap-1.5 overflow-x-auto pb-0.5"
          >
            {[
              { key: "all", label: "Semua" },
              ...categories.map((c) => ({ key: c.id, label: c.name })),
              { key: "none", label: "Tanpa kategori" },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={categoryFilter === c.key}
                onClick={() => setCategoryFilter(c.key)}
                className={
                  "shrink-0 h-9 px-3 rounded-full border text-xs font-semibold whitespace-nowrap transition " +
                  (categoryFilter === c.key
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        )}


        {visible.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border p-8 text-center space-y-3">
            <ClipboardList size={28} className="mx-auto text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {query.trim() ? "Tidak ada yang cocok" : EMPTY_COPY[tab].title}
              </p>
              <p className="text-xs text-muted-foreground">
                {query.trim() ? "Coba kata kunci lain." : EMPTY_COPY[tab].hint}
              </p>
            </div>
            {tab === "running" && !query.trim() && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <Plus size={16} /> Buat tugas
              </button>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((t) => {
              const pct = t.itemCount > 0 ? Math.round((t.doneCount / t.itemCount) * 100) : 0;
              // Belum mulai: belum tampil di karyawan.
              const scheduled =
                t.status === "open" && t.startDate !== null && t.startDate > today;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(t.id)}
                    className="group w-full text-left rounded-2xl border border-border bg-card p-4 space-y-3 transition hover:border-primary/50 hover:shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="grid place-items-center size-10 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-bold"
                      >
                        {t.assigneeId ? initials(t.assigneeName) : "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-semibold leading-snug break-words">
                          {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.assigneeName}
                          {t.categoryName && (
                            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                              {t.categoryName}
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight
                        size={18}
                        className="shrink-0 mt-2 text-muted-foreground group-hover:text-foreground"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-semibold border border-border ${scheduled ? "bg-muted text-muted-foreground" : STATUS_TONE[t.status]}`}
                        >
                          {scheduled && t.startDate
                            ? `Terjadwal · mulai ${fmtStart(t.startDate)}`
                            : STATUS_LABEL[t.status]}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {t.doneCount}/{t.itemCount} foto
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={
                            "h-full transition-all " +
                            (t.status === "approved" ? "bg-success" : "bg-primary")
                          }
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {(t.round > 1 ||
                      (t.submittedAt && t.status === "submitted") ||
                      (t.lastDeferral && t.status === "open")) && (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {t.submittedAt && t.status === "submitted" && (
                          <p>Dikirim {timeAgo(t.submittedAt, now)}</p>
                        )}
                        {t.round > 1 && (
                          <p className="inline-flex items-center gap-1">
                            <RotateCcw size={11} /> Pengulangan ke-{t.round}
                          </p>
                        )}
                        {t.lastDeferral && t.status === "open" && (
                          <p className="rounded-lg bg-warning/30 px-2 py-1 text-foreground break-words">
                            Ditunda {t.deferralCount}× · {fmtStart(t.lastDeferral.forDate)}: “
                            {t.lastDeferral.reason}”
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        </>
      )}

      {categoriesOpen && (
        <CategoriesDialog categories={categories} onClose={() => setCategoriesOpen(false)} />
      )}
      {teamsOpen && (
        <TeamsDialog teams={teams} employees={employees} onClose={() => setTeamsOpen(false)} />
      )}
      {formOpen && (
        <TaskFormDialog
          employees={employees}
          categories={categories}
          onClose={() => {
            setFormOpen(false);
            setMatrixKey((k) => k + 1);
          }}
        />
      )}
      {detailId && (
        <TaskDetailDialog
          taskId={detailId}
          onClose={() => {
            setDetailId(null);
            setMatrixKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
