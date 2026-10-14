"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCheck,
  Eye,
  Gauge,
  MessageSquareWarning,
  Settings,
  UserX,
} from "lucide-react";
import { resolveItemIssue, type ItemIssueRow } from "@/lib/actions/cleaning-governance.actions";
import { reviewDue, RUSHED_MAX_SEC_PER_PHOTO, RUSHED_MIN_PHOTOS } from "@/lib/cleaning/governance";
import { jakartaDateString } from "@/lib/utils/jakarta";
import type { CleaningChecklist } from "@/lib/actions/cleaning.actions";
import type { GalleryFilter } from "./PhotoReviewGallery";
import type { CleaningRangeReportWithNames } from "@/lib/actions/cleaning-range.actions";

function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function Card({
  icon,
  title,
  hint,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  count: number;
  tone: "bad" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span
          className={
            "grid size-7 shrink-0 place-items-center rounded-full " +
            (tone === "bad"
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
          }
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-[13.5px] font-bold">{title}</h3>
            <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">
              {count}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Zona "Tata kelola SOP": empat sinyal yang membuat SOP diperbaiki, bukan hanya
 * diaudit — kendala dari karyawan, SOP yang waktunya ditinjau, sesi foto yang
 * terlalu cepat, dan titik yang paling sering gagal. Semuanya tampil hanya bila
 * ada isinya; bila semuanya kosong zona ini tidak muncul sama sekali.
 */
export function SopGovernanceZone({
  report,
  checklists,
  issues,
  onOpenSetup,
  onOpenGallery,
}: {
  report: CleaningRangeReportWithNames;
  checklists: CleaningChecklist[];
  issues: ItemIssueRow[];
  onOpenSetup: () => void;
  onOpenGallery: (filter?: GalleryFilter) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = jakartaDateString(new Date());

  // SOP aktif yang jatuh tempo ≤ 7 hari ke depan (atau sudah lewat).
  const reviews = useMemo(
    () =>
      checklists
        .filter((c) => c.is_active)
        .map((c) => ({ c, due: reviewDue(c, today) }))
        .filter((x): x is { c: CleaningChecklist; due: NonNullable<typeof x.due> } =>
          x.due !== null && x.due.daysLeft <= 7
        )
        .sort((a, b) => a.due.daysLeft - b.due.daysLeft),
    [checklists, today]
  );
  const ownerless = useMemo(
    () => checklists.filter((c) => c.is_active && !c.owner_id).length,
    [checklists]
  );

  const rushed = report.rushed.slice(0, 8);

  // Titik yang paling sering gagal 14 hari terakhir. `miss_absent` tidak
  // dihitung — shift-nya tidak masuk, bukan kelemahan SOP-nya.
  const problem = useMemo(() => {
    const rows = report.points
      .map((p) => {
        const cells = p.cells.slice(-14).filter((c) => c.status !== "off" && c.status !== "pending");
        const scheduled = cells.length;
        const bad = cells.filter(
          (c) => c.status === "miss" || c.status === "late" || c.status === "redo"
        ).length;
        return { p, scheduled, bad, rate: scheduled ? bad / scheduled : 0 };
      })
      .filter((x) => x.scheduled >= 3 && x.bad >= 2)
      .sort((a, b) => b.rate - a.rate || b.bad - a.bad);
    return rows.slice(0, 5);
  }, [report.points]);

  const branchName = (key: string) => report.branches.find((b) => b.key === key)?.name ?? "—";

  function resolve(id: string) {
    start(async () => {
      const res = await resolveItemIssue({ id });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Kendala ditandai selesai");
      router.refresh();
    });
  }

  if (issues.length === 0 && reviews.length === 0 && rushed.length === 0 && problem.length === 0 && ownerless === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-[15px] font-bold">Tata kelola SOP</h2>
        <span className="text-[11.5px] text-muted-foreground">
          Bahan untuk memperbaiki SOP — bukan untuk menghukum
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {issues.length > 0 && (
          <Card
            icon={<MessageSquareWarning size={15} />}
            title="Kendala dari karyawan"
            hint="Titik yang sulit dikerjakan atau standarnya kurang jelas"
            count={issues.length}
            tone="warn"
          >
            <ul className="divide-y divide-border">
              {issues.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-start gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">
                      {i.item_title}{" "}
                      <span className="font-normal text-muted-foreground">— {i.checklist_name}</span>
                    </div>
                    <p className="text-[12px]">{i.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {i.user_name} · {fmtYmd(i.date)}
                      {i.owner_name ? ` · pemilik SOP: ${i.owner_name}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resolve(i.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    <CheckCheck size={12} /> Selesai
                  </button>
                </li>
              ))}
              {issues.length > 6 && (
                <li className="px-4 py-2 text-[11.5px] text-muted-foreground">
                  +{issues.length - 6} lagi — selesaikan yang di atas dulu.
                </li>
              )}
            </ul>
          </Card>
        )}

        {(reviews.length > 0 || ownerless > 0) && (
          <Card
            icon={<Settings size={15} />}
            title="SOP perlu ditinjau ulang"
            hint="SOP usang lebih berbahaya daripada tidak ada SOP"
            count={reviews.length}
            tone={reviews.some((r) => r.due.daysLeft < 0) ? "bad" : "warn"}
          >
            <ul className="divide-y divide-border">
              {reviews.map(({ c, due }) => (
                <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">{c.name}</div>
                    <p className="text-[11px] text-muted-foreground">
                      {due.daysLeft < 0
                        ? `Lewat ${-due.daysLeft} hari`
                        : due.daysLeft === 0
                          ? "Jatuh tempo hari ini"
                          : `${due.daysLeft} hari lagi`}{" "}
                      · {c.owner_name ? `pemilik: ${c.owner_name}` : "belum ada pemilik"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenSetup}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                  >
                    <Settings size={12} /> Buka
                  </button>
                </li>
              ))}
              {ownerless > 0 && (
                <li className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] text-muted-foreground">
                  <UserX size={13} className="shrink-0" />
                  {ownerless} SOP aktif belum punya pemilik — atur di Pengaturan SOP.
                </li>
              )}
            </ul>
          </Card>
        )}

        {rushed.length > 0 && (
          <Card
            icon={<Gauge size={15} />}
            title="Foto masuk terlalu cepat"
            hint={`≥ ${RUSHED_MIN_PHOTOS} foto dengan rata-rata < ${RUSHED_MAX_SEC_PER_PHOTO} detik per foto — sinyal untuk dilihat, bukan bukti`}
            count={report.rushed.length}
            tone="warn"
          >
            <ul className="divide-y divide-border">
              {rushed.map((r) => (
                <li
                  key={`${r.userId}|${r.date}|${r.checklistId}`}
                  className="flex items-center gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">
                      {report.names[r.userId] ?? "—"}{" "}
                      <span className="font-normal text-muted-foreground">
                        — {r.checklistName}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtYmd(r.date)} · {r.photos} foto dalam {r.minutes} menit ({r.secPerPhoto}{" "}
                      dtk/foto) · {branchName(r.branchKey)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenGallery({
                        userId: r.userId,
                        checklistId: r.checklistId,
                        date: r.date,
                      })
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                  >
                    <Eye size={12} /> Foto
                  </button>
                </li>
              ))}
              {report.rushed.length > rushed.length && (
                <li className="px-4 py-2 text-[11.5px] text-muted-foreground">
                  +{report.rushed.length - rushed.length} sesi lain.
                </li>
              )}
            </ul>
          </Card>
        )}

        {problem.length > 0 && (
          <Card
            icon={<AlertTriangle size={15} />}
            title="Titik yang paling sering gagal"
            hint="14 hari terakhir — terlewat, telat, atau perlu ulang. Tinjau SOP-nya sebelum menegur orangnya"
            count={problem.length}
            tone="bad"
          >
            <ul className="divide-y divide-border">
              {problem.map(({ p, scheduled, bad }) => (
                <li key={p.itemId} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">
                      {p.title}{" "}
                      <span className="font-normal text-muted-foreground">— {p.checklistName}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {bad} dari {scheduled} hari bermasalah · {branchName(p.branchKey)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenGallery({ itemId: p.itemId })}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                  >
                    <Eye size={12} /> Foto
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </section>
  );
}
