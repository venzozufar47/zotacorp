"use client";

import { useState } from "react";
import {
  Cake,
  Sparkles,
  Flame,
  Trophy,
  MessageCircle,
  ChevronDown,
  ChevronRight,
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

export function CelebrationsMonitoringTable({ rows }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between">
        <h2 className="font-display text-base font-semibold">
          {rows.length} karyawan
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Diurutkan: perayaan terdekat dulu
        </p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const expanded = expandedId === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : r.id)}
                className="w-full text-left px-4 py-3 hover:bg-accent/20 transition flex items-start gap-3"
              >
                <span className="shrink-0 mt-0.5">
                  {expanded ? (
                    <ChevronDown size={14} className="text-muted-foreground" />
                  ) : (
                    <ChevronRight size={14} className="text-muted-foreground" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">
                      {r.fullName || "(tanpa nama)"}
                    </span>
                    {r.nickname ? (
                      <span className="text-[11px] text-muted-foreground">
                        {r.nickname}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px]">
                    <Pill
                      icon={<Flame size={11} />}
                      label="Streak"
                      value={`${r.streakCurrent} hari`}
                      tone={r.streakCurrent >= 5 ? "success" : "muted"}
                    />
                    <Pill
                      icon={<Trophy size={11} />}
                      label="Best"
                      value={`${r.streakPersonalBest} hari`}
                    />
                    <Pill
                      icon={<Cake size={11} />}
                      label="Ultah"
                      value={
                        r.dateOfBirth
                          ? `${formatDate(r.birthdayThisYear)} · ${relativeDays(r.daysToBirthday)}`
                          : "—"
                      }
                      tone={
                        r.daysToBirthday != null && r.daysToBirthday <= 7
                          ? "warning"
                          : undefined
                      }
                    />
                    <Pill
                      icon={<Sparkles size={11} />}
                      label="Anniv"
                      value={
                        r.firstDayOfWork
                          ? `${formatDate(r.anniversaryThisYear)} · ${relativeDays(r.daysToAnniversary)} · ${r.yearsOfService}th`
                          : "—"
                      }
                      tone={
                        r.daysToAnniversary != null && r.daysToAnniversary <= 7
                          ? "warning"
                          : undefined
                      }
                    />
                    <Pill
                      icon={<MessageCircle size={11} />}
                      label="WA log"
                      value={`${r.recentWa.length}`}
                    />
                    {r.notices.length > 0 && (
                      <Pill
                        icon={<AlertTriangle size={11} />}
                        label="Notice"
                        value={`${r.notices.length}`}
                        tone="warning"
                      />
                    )}
                  </div>
                </div>
              </button>
              {expanded && (
                <div className="px-4 pb-4 pt-0 space-y-3 bg-muted/20">
                  {r.notices.length > 0 && (
                    <div className="rounded-md border-2 border-warning/40 bg-warning/10 p-2.5 space-y-1.5 mt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-warning flex items-center gap-1">
                        <AlertTriangle size={11} />
                        Perhatian
                      </p>
                      <ul className="space-y-1 text-[11px] text-foreground">
                        {r.notices.map((n, i) => (
                          <li key={i} className="flex items-baseline gap-1.5">
                            <span className="text-warning">•</span>
                            <span>{n.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
                    <DetailBlock title="Streak presensi">
                      <DetailRow label="Saat ini" value={`${r.streakCurrent} hari`} />
                      <DetailRow label="Personal best" value={`${r.streakPersonalBest} hari`} />
                      <DetailRow
                        label="Milestone terakhir"
                        value={
                          r.streakLastMilestone > 0
                            ? `${r.streakLastMilestone} hari`
                            : "Belum"
                        }
                      />
                    </DetailBlock>
                    <DetailBlock title="Ulang tahun">
                      <DetailRow
                        label="Tanggal lahir"
                        value={r.dateOfBirth ? formatDate(r.dateOfBirth) : "—"}
                      />
                      <DetailRow
                        label="Ulang tahun mendatang"
                        value={
                          r.birthdayThisYear
                            ? `${formatDate(r.birthdayThisYear)} (${relativeDays(r.daysToBirthday)})`
                            : "—"
                        }
                      />
                      <DetailRow
                        label="Terakhir di-greet"
                        value={
                          r.birthdayLastGreeted
                            ? formatDate(r.birthdayLastGreeted)
                            : "Belum pernah"
                        }
                      />
                    </DetailBlock>
                    <DetailBlock title="Anniversary tahun kerja">
                      <DetailRow
                        label="Mulai kerja"
                        value={
                          r.firstDayOfWork ? formatDate(r.firstDayOfWork) : "—"
                        }
                      />
                      <DetailRow
                        label="Anniversary mendatang"
                        value={
                          r.anniversaryThisYear
                            ? `${formatDate(r.anniversaryThisYear)} (${relativeDays(r.daysToAnniversary)})`
                            : "—"
                        }
                      />
                      <DetailRow
                        label="Tahun kerja saat ini"
                        value={`${r.yearsOfService} tahun`}
                      />
                      <DetailRow
                        label="Terakhir di-greet"
                        value={
                          r.anniversaryLastGreeted
                            ? formatDate(r.anniversaryLastGreeted)
                            : "Belum pernah"
                        }
                      />
                    </DetailBlock>
                    <DetailBlock title="Kontak">
                      <DetailRow
                        label="WhatsApp"
                        value={r.whatsappNumber ?? "—"}
                      />
                    </DetailBlock>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Riwayat WA perayaan
                    </h3>
                    {r.recentWa.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">
                        Belum ada pesan WA perayaan terkirim ke karyawan ini.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {r.recentWa.map((log) => (
                          <li
                            key={log.id}
                            className="rounded-md border border-border bg-background p-2.5"
                          >
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <span
                                className={
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
                                  (log.eventType === "birthday"
                                    ? "bg-pink-100 text-pink-700"
                                    : log.eventType === "anniversary"
                                    ? "bg-amber-100 text-amber-700"
                                    : log.eventType === "streak_milestone"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : log.eventType === "celebration_greeting_notification"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-muted text-muted-foreground")
                                }
                              >
                                {log.eventType === "birthday"
                                  ? "Birthday"
                                  : log.eventType === "anniversary"
                                  ? "Anniversary"
                                  : log.eventType === "streak_milestone"
                                  ? "Streak"
                                  : log.eventType === "celebration_greeting_notification"
                                  ? "Notif"
                                  : log.eventType}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                {new Date(log.sentAt).toLocaleString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {log.status === "failed" && (
                                <span className="text-[10px] text-destructive font-bold uppercase">
                                  Gagal
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 text-[11px] text-foreground whitespace-pre-wrap leading-snug">
                              {log.body}
                            </p>
                            {log.errorMessage && (
                              <p className="mt-1 text-[10px] text-destructive">
                                {log.errorMessage}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "warning" | "muted";
}) {
  const cls =
    tone === "success"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "warning"
      ? "border-warning/40 bg-warning/10 text-foreground"
      : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${cls}`}
    >
      {icon}
      <span className="uppercase tracking-wider font-semibold">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5 space-y-1">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium tabular-nums">{value}</span>
    </div>
  );
}
