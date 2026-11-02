"use client";

import { useMemo, useState } from "react";
import {
  Cake,
  Sparkles,
  Flame,
  MessageCircle,
  AlertTriangle,
  BellRing,
  Search,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { needsPushVerification } from "@/lib/push/checkout-policy";
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

function relativeSince(iso: string | null): string {
  if (!iso) return "belum pernah";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  return `${days} hari lalu`;
}

/** Kesehatan push notification per karyawan — 0=belum subscribe (paling
 *  perlu perhatian), 1=subscribe tapi belum pernah terbukti klik,
 *  2=subscribe & pernah klik, 3=dikecualikan (push_notification_exempt). */
function pushHealthTier(r: EmployeeMonitoringRow): 0 | 1 | 2 | 3 {
  if (r.pushExempt) return 3;
  if (r.pushDeviceCount === 0) return 0;
  if (needsPushVerification(r.pushLastClickedAt, false)) return 1;
  return 2;
}

/**
 * Tab admin monitoring perayaan, di-organisir per KATEGORI (Notice,
 * Streak, Ulang Tahun, Anniversary, Riwayat notifikasi) — bukan
 * per-karyawan. Setiap kategori punya rangkingnya sendiri sehingga admin
 * bisa scan "siapa yang streaknya paling tinggi", "siapa ulang tahun
 * terdekat", dst dalam satu pandangan.
 */
export function CelebrationsMonitoringTable({ rows: allRows }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("birthday");
  const rows = useMemo(() => allRows.filter((r) =>
    `${r.fullName} ${r.nickname ?? ""}`.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id"))
  ), [allRows, query]);
  const noticeRows = rows.filter((r) => r.notices.length > 0);
  const [notifQuery, setNotifQuery] = useState("");

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

  const pushHealthRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta = pushHealthTier(a);
        const tb = pushHealthTier(b);
        if (ta !== tb) return ta - tb;
        if (ta === 2) {
          // Di antara yang sehat, klik terlama duluan — paling layak dicek.
          return (a.pushLastClickedAt ?? "").localeCompare(b.pushLastClickedAt ?? "");
        }
        return pickName(a).localeCompare(pickName(b));
      }),
    [rows]
  );

  const notifLog = useMemo(() => {
    const flat: Array<{
      employeeId: string;
      employeeName: string;
      log: EmployeeMonitoringRow["recentNotifications"][number];
    }> = [];
    for (const r of rows) {
      for (const log of r.recentNotifications) {
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

  const notifLogFiltered = useMemo(() => {
    const q = notifQuery.trim().toLowerCase();
    if (!q) return notifLog;
    return notifLog.filter((entry) => {
      if (entry.employeeName.toLowerCase().includes(q)) return true;
      if (entry.log.body?.toLowerCase().includes(q)) return true;
      if (eventBadgeLabel(entry.log.eventType).toLowerCase().includes(q)) return true;
      if (entry.log.eventType.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [notifLog, notifQuery]);

  if (allRows.length === 0) {
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Pantau karyawan</h2>
          <p className="mt-1 text-sm text-muted-foreground">{allRows.length} karyawan · Pilih kategori untuk melihat detail.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Cari karyawan" type="search" placeholder="Cari nama karyawan…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 pl-10 text-base sm:text-sm" />
        </div>
      </div>
      {noticeRows.length > 0 && <NoticeSection rows={noticeRows} />}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="Kategori monitoring">
        {[
          { id: "birthday", label: "Ulang tahun", count: birthdayRows.length, icon: Cake },
          { id: "anniversary", label: "Masa kerja", count: anniversaryRows.length, icon: Sparkles },
          { id: "streak", label: "Streak presensi", count: streakRows.length, icon: Flame },
          { id: "push", label: "Notifikasi push", count: pushHealthRows.filter((r) => pushHealthTier(r) <= 1).length, icon: BellRing },
          { id: "history", label: "Riwayat pesan", count: notifLog.length, icon: MessageCircle },
        ].map(({ id, label, count, icon: Icon }) => (
          <button key={id} type="button" aria-pressed={active === id} aria-controls={`monitoring-${id}`} onClick={() => setActive(id)} className={`min-h-20 cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active === id ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
            <span className="flex items-center justify-between gap-2"><Icon size={18} aria-hidden="true" /><span className="text-xl font-semibold tabular-nums">{count}</span></span>
            <span className="mt-2 block text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>
      {query && <p role="status" className="text-sm text-muted-foreground">{rows.length} karyawan ditemukan untuk “{query}”.</p>}
      <div>
        <CategoryCard
          id="streak" hidden={active !== "streak"}
          title="Streak presensi"
          icon={<Flame size={14} />}
          countLabel={`${streakRows.length} karyawan`}
        >
          {streakRows.length === 0 ? (
            <Empty>Belum ada streak aktif.</Empty>
          ) : (
            <ul className="divide-y divide-border/60">
              {streakRows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center flex-wrap justify-between gap-3 px-4 py-3 text-sm hover:bg-accent/10"
                >
                  <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                    {pickName(r)}
                  </span>
                  <span className="tabular-nums text-foreground">
                    {r.streakCurrent} hari
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    Terbaik {r.streakPersonalBest} · Milestone{" "}
                    {r.streakLastMilestone || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CategoryCard>

        <CategoryCard
          id="birthday" hidden={active !== "birthday"}
          title="Ulang tahun"
          icon={<Cake size={14} />}
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
                      "flex items-center flex-wrap justify-between gap-3 px-4 py-3 text-sm hover:bg-accent/10 " +
                      (soon ? "bg-primary/5" : "")
                    }
                  >
                    <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                      {pickName(r)}
                    </span>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(r.birthdayThisYear)}
                    </span>
                    <span
                      className={
                        "text-xs whitespace-nowrap font-semibold " +
                        (soon ? "text-primary" : "text-muted-foreground")
                      }
                    >
                      {relativeDays(r.daysToBirthday)}
                    </span>
                    <span className="text-xs text-muted-foreground italic whitespace-nowrap">
                      {r.birthdayLastGreeted
                        ? `Disapa ${formatDate(r.birthdayLastGreeted)}`
                        : "Belum disapa"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CategoryCard>

        <CategoryCard
          id="anniversary" hidden={active !== "anniversary"}
          title="Anniversary tahun kerja"
          icon={<Sparkles size={14} />}
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
                      "flex items-center flex-wrap justify-between gap-3 px-4 py-3 text-sm hover:bg-accent/10 " +
                      (soon ? "bg-primary/5" : "")
                    }
                  >
                    <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                      {pickName(r)}
                    </span>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(r.anniversaryThisYear)}
                    </span>
                    <span
                      className={
                        "text-xs whitespace-nowrap font-semibold " +
                        (soon ? "text-warning" : "text-muted-foreground")
                      }
                    >
                      {relativeDays(r.daysToAnniversary)}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.yearsOfService} tahun
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CategoryCard>

        <CategoryCard
          id="push" hidden={active !== "push"}
          title="Kesehatan push notification"
          icon={<BellRing size={14} />}
          countLabel={`${pushHealthRows.filter((r) => pushHealthTier(r) <= 1).length} perlu dicek`}
        >
          <p className="px-3 pt-2 pb-1 text-sm text-muted-foreground">
            Server tidak bisa menanyakan browser &quot;izin notifikasi
            masih aktif?&quot; secara langsung — bukti terkuat adalah
            karyawan pernah benar-benar mengetuk sebuah notifikasi.
          </p>
          <ul className="divide-y divide-border/60 ">
            {pushHealthRows.map((r) => {
              const tier = pushHealthTier(r);
              return (
                <li
                  key={r.id}
                  className="flex items-center flex-wrap justify-between gap-3 px-4 py-3 text-sm hover:bg-accent/10"
                >
                  <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                    {pickName(r)}
                  </span>
                  <span
                    className={
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap " +
                      (tier === 0
                        ? "bg-destructive/15 text-destructive"
                        : tier === 1
                          ? "bg-warning/10 text-warning"
                          : tier === 2
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground")
                    }
                  >
                    {tier === 0
                      ? "Belum subscribe"
                      : tier === 1
                          ? (r.pushLastClickedAt ? "Perlu verifikasi" : "Belum pernah klik")
                        : tier === 2
                          ? "Aktif"
                          : "Dikecualikan"}
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {r.pushDeviceCount} perangkat
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap w-20 text-right">
                    {r.pushLastClickedAt ? relativeSince(r.pushLastClickedAt) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </CategoryCard>

        <CategoryCard
          id="history" hidden={active !== "history"}
          title="Riwayat notifikasi perayaan"
          icon={<MessageCircle size={14} />}
          countLabel={
            notifQuery
              ? `${notifLogFiltered.length} / ${notifLog.length} notif`
              : `${notifLog.length} notif`
          }
        >
          <div className="px-3 pt-2 pb-1">
            <input
              type="search"
              value={notifQuery}
              onChange={(e) => setNotifQuery(e.target.value)}
              placeholder="Cari nama, isi pesan, atau jenis (ulang tahun/anniversary/streak)…"
              className="w-full rounded-lg border border-border bg-background px-2.5 min-h-11 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {notifLog.length === 0 ? (
            <Empty>Belum ada log notifikasi perayaan.</Empty>
          ) : notifLogFiltered.length === 0 ? (
            <Empty>Tidak ada hasil untuk &quot;{notifQuery}&quot;.</Empty>
          ) : (
            <ul className="divide-y divide-border/60 ">
              {notifLogFiltered.map((entry) => (
                <li
                  key={entry.log.id}
                  className="px-4 py-3 text-sm hover:bg-accent/10"
                >
                  <div className="flex items-center flex-wrap justify-between gap-2">
                    <span className="font-medium text-foreground truncate">
                      {entry.employeeName}
                    </span>
                    <span
                      className={
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider " +
                        eventBadgeClass(entry.log.eventType)
                      }
                    >
                      {eventBadgeLabel(entry.log.eventType)}
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.log.sentAt).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {entry.log.status === "failed" && (
                      <span className="text-xs font-bold text-destructive uppercase">
                        Gagal
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                    {entry.log.body}
                  </p>
                  {entry.log.errorMessage && (
                    <p className="mt-0.5 text-xs text-destructive">
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
  const [open, setOpen] = useState(false);
  const totalNotices = rows.reduce((s, r) => s + r.notices.length, 0);
  return (
    <section className="rounded-2xl border border-warning/30 bg-warning/10 overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="monitoring-notices"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 min-h-14 cursor-pointer px-4 py-3 hover:bg-warning/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-foreground font-semibold">
          <AlertTriangle size={14} />
          {totalNotices} catatan pada {rows.length} karyawan
        </span>
        <span className="text-xs text-muted-foreground">
          <ChevronDown aria-hidden="true" size={18} className={open ? "rotate-180" : ""} />
        </span>
      </button>
      {open && (
        <ul id="monitoring-notices" className="divide-y divide-warning/20 bg-card">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2 text-xs">
              <div className="font-medium text-foreground mb-0.5">
                {pickName(r)}
              </div>
              <ul className="space-y-0.5 text-sm">
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
  id,
  hidden,
  title,
  icon,
  countLabel,
  children,
}: {
  id: string;
  hidden: boolean;
  title: string;
  icon: React.ReactNode;
  countLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`monitoring-${id}`} hidden={hidden} className="rounded-2xl border border-border overflow-hidden bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-4 bg-card border-b border-border">
        <h2 className="font-display text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{countLabel}</span>
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
    case "birthday_morning":
      return "Birthday";
    case "anniversary_morning":
      return "Anniversary";
    case "birthday_broadcast":
      return "Broadcast ulang tahun";
    case "anniversary_broadcast":
      return "Broadcast masa kerja";
    case "streak_milestone":
      return "Streak";
    case "greeting_notified":
      return "Notif";
    default:
      return eventType;
  }
}

function eventBadgeClass(eventType: string): string {
  switch (eventType) {
    case "birthday_morning":
      return "bg-primary/10 text-primary";
    case "anniversary_morning":
      return "bg-warning/10 text-warning";
    case "birthday_broadcast":
      return "bg-primary/10 text-primary";
    case "anniversary_broadcast":
      return "bg-warning/10 text-warning";
    case "streak_milestone":
      return "bg-success/10 text-success";
    case "greeting_notified":
      return "bg-primary/10 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}
