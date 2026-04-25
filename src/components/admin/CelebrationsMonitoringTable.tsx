"use client";

import { useMemo, useState } from "react";
import {
  Cake,
  Sparkles,
  Flame,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";
import type { EmployeeMonitoringRow } from "@/lib/actions/employee-monitoring.actions";

interface Props {
  rows: EmployeeMonitoringRow[];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relativeDays(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days === 0) return "Hari ini";
  if (days === 1) return "Besok";
  if (days < 0) return `${-days} hari lalu`;
  return `${days} hari lagi`;
}

function pickName(r: EmployeeMonitoringRow): string {
  return r.nickname || r.fullName || "(tanpa nama)";
}

/**
 * Tab admin monitoring perayaan, di-organisir per KATEGORI (Notice,
 * Streak, Ulang Tahun, Anniversary, Log WA) — bukan per-karyawan.
 * Setiap kategori punya rangkingnya sendiri sehingga admin bisa scan
 * "siapa yang streaknya paling tinggi", "siapa ulang tahun terdekat",
 * dst dalam satu pandangan.
 */
export function CelebrationsMonitoringTable({ rows }: Props) {
  const noticeRows = rows.filter((r) => r.notices.length > 0);
  const [waQuery, setWaQuery] = useState("");

  const streakRows = useMemo(
    () =>
      [...rows]
        .filter((r) => r.streakCurrent > 0 || r.streakPersonalBest > 0)
        .sort((a, b) => {
          if (a.streakCurrent !== b.streakCurrent) {
            return b.streakCurrent - a.streakCurrent;
          }
          return b.streakPersonalBest - a.streakPersonalBest;
        }),
    [rows]
  );

  const birthdayRows = useMemo(
    () =>
      [...rows]
        .filter((r) => r.dateOfBirth)
        .sort((a, b) => (a.daysToBirthday ?? 365) - (b.daysToBirthday ?? 365)),
    [rows]
  );

  const anniversaryRows = useMemo(
    () =>
      [...rows]
        .filter((r) => r.firstDayOfWork)
        .sort(
          (a, b) =>
            (a.daysToAnniversary ?? 365) - (b.daysToAnniversary ?? 365)
        ),
    [rows]
  );

  const waLog = useMemo(() => {
    const flat: Array<{
      employeeId: string;
      employeeName: string;
      log: EmployeeMonitoringRow["recentWa"][number];
    }> = [];
    for (const r of rows) {
      for (const log of r.recentWa) {
        flat.push({
          employeeId: r.id,
          employeeName: pickName(r),
          log,
        });
      }
    }
    flat.sort((a, b) => (a.log.sentAt < b.log.sentAt ? 1 : -1));
    return flat;
  }, [rows]);

  const waLogFiltered = useMemo(() => {
    const q = waQuery.trim().toLowerCase();
    if (!q) return waLog;
    return waLog.filter((entry) => {
      if (entry.employeeName.toLowerCase().includes(q)) return true;
      if (entry.log.body?.toLowerCase().includes(q)) return true;
      if (eventBadgeLabel(entry.log.eventType).toLowerCase().includes(q)) return true;
      if (entry.log.eventType.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [waLog, waQuery]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Belum ada karyawan terdaftar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {noticeRows.length > 0 && <NoticeSection rows={noticeRows} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryCard
          title="Streak presensi"
          icon={<Flame size={14} />}
          accent="bg-emerald-50/60 border-emerald-300"
          countLabel={`${streakRows.length} karyawan`}
        >
          {streakRows.length === 0 ? (
            <Empty>Belum ada streak aktif.</Empty>
          ) : (
            <ul className="divide-y divide-border/60">
              {streakRows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs hover:bg-accent/10"
                >
                  <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                    {pickName(r)}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">
                    {r.streakCurrent} hari
                  </span>
                  <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                    best {r.streakPersonalBest} · ms{" "}
                    {r.streakLastMilestone || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CategoryCard>

        <CategoryCard
          title="Ulang tahun"
          icon={<Cake size={14} />}
          accent="bg-pink-50/60 border-pink-300"
          countLabel={`${birthdayRows.length} karyawan`}
        >
          {birthdayRows.length === 0 ? (
            <Empty>Belum ada tanggal lahir terisi.</Empty>
          ) : (
            <ul className="divide-y divide-border/60">
              {birthdayRows.map((r) => {
                const soon =
                  r.daysToBirthday != null && r.daysToBirthday <= 7;
                return (
                  <li
                    key={r.id}
                    className={
                      "flex items-baseline justify-between gap-3 px-3 py-2 text-xs hover:bg-accent/10 " +
                      (soon ? "bg-pink-50/40" : "")
                    }
                  >
                    <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                      {pickName(r)}
                    </span>
                    <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                      {formatDate(r.birthdayThisYear)}
                    </span>
                    <span
                      className={
                        "text-[10px] whitespace-nowrap font-semibold " +
                        (soon ? "text-pink-700" : "text-muted-foreground")
                      }
                    >
                      {relativeDays(r.daysToBirthday)}
                    </span>
                    <span className="text-[9px] text-muted-foreground italic whitespace-nowrap">
                      {r.birthdayLastGreeted
                        ? `greet ${formatDate(r.birthdayLastGreeted)}`
                        : "blm greet"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CategoryCard>

        <CategoryCard
          title="Anniversary tahun kerja"
          icon={<Sparkles size={14} />}
          accent="bg-amber-50/60 border-amber-300"
          countLabel={`${anniversaryRows.length} karyawan`}
        >
          {anniversaryRows.length === 0 ? (
            <Empty>Belum ada tanggal mulai kerja terisi.</Empty>
          ) : (
            <ul className="divide-y divide-border/60">
              {anniversaryRows.map((r) => {
                const soon =
                  r.daysToAnniversary != null && r.daysToAnniversary <= 7;
                return (
                  <li
                    key={r.id}
                    className={
                      "flex items-baseline justify-between gap-3 px-3 py-2 text-xs hover:bg-accent/10 " +
                      (soon ? "bg-amber-50/40" : "")
                    }
                  >
                    <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                      {pickName(r)}
                    </span>
                    <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                      {formatDate(r.anniversaryThisYear)}
                    </span>
                    <span
                      className={
                        "text-[10px] whitespace-nowrap font-semibold " +
                        (soon ? "text-amber-700" : "text-muted-foreground")
                      }
                    >
                      {relativeDays(r.daysToAnniversary)}
                    </span>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                      {r.yearsOfService}th
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CategoryCard>

        <CategoryCard
          title="Riwayat WA perayaan"
          icon={<MessageCircle size={14} />}
          accent="bg-indigo-50/60 border-indigo-300"
          countLabel={
            waQuery
              ? `${waLogFiltered.length} / ${waLog.length} pesan`
              : `${waLog.length} pesan`
          }
        >
          <div className="px-3 pt-2 pb-1">
            <input
              type="search"
              value={waQuery}
              onChange={(e) => setWaQuery(e.target.value)}
              placeholder="Cari nama, isi pesan, atau jenis (notif/streak/broadcast)…"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          {waLog.length === 0 ? (
            <Empty>Belum ada log WA perayaan.</Empty>
          ) : waLogFiltered.length === 0 ? (
            <Empty>Tidak ada hasil untuk &quot;{waQuery}&quot;.</Empty>
          ) : (
            <ul className="divide-y divide-border/60 max-h-[420px] overflow-y-auto">
              {waLogFiltered.map((entry) => (
                <li
                  key={entry.log.id}
                  className="px-3 py-2 text-xs hover:bg-accent/10"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground truncate">
                      {entry.employeeName}
                    </span>
                    <span
                      className={
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
                        eventBadgeClass(entry.log.eventType)
                      }
                    >
                      {eventBadgeLabel(entry.log.eventType)}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(entry.log.sentAt).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {entry.log.status === "failed" && (
                      <span className="text-[9px] font-bold text-destructive uppercase">
                        Gagal
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap line-clamp-3">
                    {entry.log.body}
                  </p>
                  {entry.log.errorMessage && (
                    <p className="mt-0.5 text-[10px] text-destructive">
                      {entry.log.errorMessage}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CategoryCard>
      </div>
    </div>
  );
}

function NoticeSection({ rows }: { rows: EmployeeMonitoringRow[] }) {
  const [open, setOpen] = useState(true);
  const totalNotices = rows.reduce((s, r) => s + r.notices.length, 0);
  return (
    <section className="rounded-2xl border-2 border-warning/40 bg-warning/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-warning/15 transition"
      >
        <span className="flex items-center gap-2 text-warning font-semibold">
          <AlertTriangle size={14} />
          {totalNotices} notice di {rows.length} karyawan
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Klik untuk tutup" : "Klik untuk lihat"}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-warning/20 bg-card">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2 text-xs">
              <div className="font-medium text-foreground mb-0.5">
                {pickName(r)}
              </div>
              <ul className="space-y-0.5 text-[11px]">
                {r.notices.map((n, i) => (
                  <li key={i} className="flex items-baseline gap-1.5">
                    <span className="text-warning">•</span>
                    <span>{n.message}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CategoryCard({
  title,
  icon,
  accent,
  countLabel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  countLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border-2 overflow-hidden ${accent}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-card border-b border-border">
        <h2 className="font-display text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <span className="text-[10px] text-muted-foreground">{countLabel}</span>
      </div>
      <div className="bg-card">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-xs text-muted-foreground italic text-center">
      {children}
    </p>
  );
}

function eventBadgeLabel(eventType: string): string {
  switch (eventType) {
    case "birthday":
      return "Birthday";
    case "anniversary":
      return "Anniversary";
    case "streak_milestone":
      return "Streak";
    case "celebration_greeting_notification":
      return "Notif";
    case "other":
      return "Broadcast";
    default:
      return eventType;
  }
}

function eventBadgeClass(eventType: string): string {
  switch (eventType) {
    case "birthday":
      return "bg-pink-100 text-pink-700";
    case "anniversary":
      return "bg-amber-100 text-amber-700";
    case "streak_milestone":
      return "bg-emerald-100 text-emerald-700";
    case "celebration_greeting_notification":
      return "bg-purple-100 text-purple-700";
    case "other":
      return "bg-indigo-100 text-indigo-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}
