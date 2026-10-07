"use client";

import { useMemo, useState } from "react";
import { Hourglass, ListChecks, Plus, RotateCcw } from "lucide-react";
import type { AdminTaskRow, TaskStatus } from "@/lib/tasks/types";
import { primaryBtn, smallBtn } from "@/components/admin/registry/RegistryUi";
import { TaskFormDialog } from "./TaskFormDialog";
import { TaskDetailDialog } from "./TaskDetailDialog";

export interface AssignableEmployee {
  id: string;
  name: string;
  businessUnit: string | null;
}

type Tab = "review" | "running" | "done";

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Dikerjakan",
  submitted: "Menunggu verifikasi",
  approved: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  open: "bg-warning/40",
  submitted: "bg-primary/20",
  approved: "bg-success/30",
  cancelled: "bg-muted",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function TasksManager({
  tasks,
  employees,
  loadError,
  focusId,
}: {
  tasks: AdminTaskRow[];
  employees: AssignableEmployee[];
  loadError: string | null;
  focusId: string | null;
}) {
  const reviewCount = tasks.filter((t) => t.status === "submitted").length;
  const [tab, setTab] = useState<Tab>(reviewCount > 0 || focusId ? "review" : "running");
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(focusId);

  const groups = useMemo(
    () => ({
      review: tasks.filter((t) => t.status === "submitted"),
      running: tasks.filter((t) => t.status === "open"),
      done: tasks.filter((t) => t.status === "approved" || t.status === "cancelled"),
    }),
    [tasks]
  );
  const visible = groups[tab];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "review", label: "Perlu verifikasi", count: groups.review.length },
    { key: "running", label: "Berjalan", count: groups.running.length },
    { key: "done", label: "Selesai", count: groups.done.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-2 transition " +
                (tab === t.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/50")
              }
            >
              {t.label}
              <span className="text-[11px] px-1.5 rounded-full bg-background/80 text-foreground">
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className={primaryBtn} onClick={() => setFormOpen(true)}>
          <Plus size={15} /> Tugas baru
        </button>
      </div>

      {loadError && (
        <p className="rounded-xl border-2 border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Gagal memuat tugas: {loadError}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border p-10 text-center space-y-2">
          <ListChecks size={28} className="mx-auto text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {tab === "review"
              ? "Tidak ada tugas yang menunggu verifikasi."
              : tab === "running"
                ? "Tidak ada tugas yang sedang dikerjakan."
                : "Belum ada tugas selesai."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visible.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display font-semibold truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.assigneeName}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border border-border ${STATUS_TONE[t.status]}`}
                >
                  {STATUS_LABEL[t.status]}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Foto {t.doneCount}/{t.itemCount}
                </span>
                {t.round > 1 && (
                  <span className="inline-flex items-center gap-1">
                    <RotateCcw size={11} /> Ronde ke-{t.round}
                  </span>
                )}
                {t.submittedAt && t.status === "submitted" && (
                  <span className="inline-flex items-center gap-1">
                    <Hourglass size={11} /> dikirim {fmtDate(t.submittedAt)}
                  </span>
                )}
              </div>

              {t.lastDeferral && t.status === "open" && (
                <p className="text-xs rounded-lg bg-warning/30 px-2 py-1">
                  Ditunda {t.deferralCount}× · terakhir {fmtYmd(t.lastDeferral.forDate)}:{" "}
                  “{t.lastDeferral.reason}”
                </p>
              )}

              <div className="pt-1">
                <button type="button" className={smallBtn} onClick={() => setDetailId(t.id)}>
                  {t.status === "submitted" ? "Periksa" : "Lihat"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && <TaskFormDialog employees={employees} onClose={() => setFormOpen(false)} />}
      {detailId && <TaskDetailDialog taskId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
