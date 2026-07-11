"use client";

import Link from "next/link";
import { ArrowLeft, Ticket as TicketIcon, Inbox, CheckCircle2 } from "lucide-react";
import { TicketForm } from "./TicketForm";
import { TicketCard } from "./TicketCard";
import { formatDuration, isTicketOpen, type Ticket, type TicketViewerRole } from "@/lib/tickets/types";
import type { StudioHeadKpi } from "@/lib/actions/tickets.actions";

/**
 * Halaman "Ticketing System" role-adaptive. Dipakai route employee
 * (/tickets) & admin (/admin/tickets) dengan komponen sama.
 */
export function TicketingSystem({
  viewerRole,
  uid,
  myTickets,
  studioQueue = [],
  escalated = [],
  kpi = null,
  backHref,
}: {
  viewerRole: TicketViewerRole;
  uid: string;
  myTickets: Ticket[];
  studioQueue?: Ticket[];
  escalated?: Ticket[];
  kpi?: StudioHeadKpi | null;
  backHref?: string;
}) {
  const isManager = viewerRole === "head" || viewerRole === "owner";
  const activeQueue = studioQueue.filter((t) => isTicketOpen(t.status));
  const escalationList = escalated.filter((t) => isTicketOpen(t.status));

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
            >
              <ArrowLeft size={13} /> Kembali
            </Link>
          )}
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <TicketIcon size={22} /> Ticketing System
          </h1>
          <p className="text-sm text-muted-foreground">
            {viewerRole === "filer"
              ? "Laporkan kebutuhan barang, kerusakan, atau masalah studio ke Kepala Studio."
              : viewerRole === "head"
                ? "Tindaklanjuti laporan tim studio. Eskalasi ke owner jika di luar kendali."
                : "Antrian eskalasi & pemantauan tiket studio Yeobo Space."}
          </p>
        </div>
        <TicketForm uid={uid} />
      </div>

      {/* KPI Kepala Studio */}
      {isManager && kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Kpi label="Belum selesai" value={kpi.openCount + kpi.inProgressCount + kpi.escalatedCount + kpi.ownerHandlingCount} tone="warn" />
          <Kpi label="Selesai (bln ini)" value={kpi.resolvedThisMonth} tone="good" />
          <Kpi label="Total selesai" value={kpi.resolvedCount} />
          <Kpi
            label="Rata-rata pengerjaan"
            value={kpi.avgResolutionMs != null ? formatDuration(kpi.avgResolutionMs) : "—"}
          />
        </div>
      )}

      {/* Owner: perlu keputusan */}
      {viewerRole === "owner" && (
        <Section
          icon={<Inbox size={16} />}
          title="Perlu keputusan owner"
          count={escalationList.length}
          empty="Tidak ada eskalasi yang menunggu."
        >
          {escalationList.map((t) => (
            <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="escalation" />
          ))}
        </Section>
      )}

      {/* Antrian studio (head & owner) */}
      {isManager && (
        <Section
          icon={<TicketIcon size={16} />}
          title="Antrian studio"
          count={activeQueue.length}
          empty="Antrian bersih — tidak ada tiket aktif. 🎉"
        >
          {activeQueue.map((t) => (
            <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="queue" />
          ))}
        </Section>
      )}

      {/* Tiket saya (semua peran yang bisa membuat) */}
      <Section
        icon={<CheckCircle2 size={16} />}
        title="Tiket saya"
        count={myTickets.length}
        empty="Belum ada tiket. Ketuk “Buat Tiket” untuk melapor."
      >
        {myTickets.map((t) => (
          <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="mine" />
        ))}
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-display font-bold text-base">{title}</h2>
        <span className="text-xs font-semibold text-muted-foreground rounded-full bg-muted px-2 py-0.5">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-[13px] text-muted-foreground py-4 text-center rounded-2xl border border-dashed border-border">
          {empty}
        </p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "good";
}) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm">
      <div
        className={
          "font-display font-bold text-xl tabular-nums " +
          (tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : "text-foreground")
        }
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
