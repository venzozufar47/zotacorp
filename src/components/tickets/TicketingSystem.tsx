"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ticket as TicketIcon,
  Inbox,
  CheckCircle2,
  Archive,
  ChevronDown,
} from "lucide-react";
import { TicketForm } from "./TicketForm";
import { TicketCard } from "./TicketCard";
import {
  formatDuration,
  isTicketOpen,
  isStudioQueueStatus,
  needsFilerConfirmation,
  type Ticket,
  type TicketViewerRole,
} from "@/lib/tickets/types";
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
  const [showArchive, setShowArchive] = useState(false);
  const isManager = viewerRole === "head" || viewerRole === "owner";
  const activeQueue = studioQueue.filter((t) => isTicketOpen(t.status));
  const escalationList = escalated.filter((t) => isTicketOpen(t.status));

  // Owner's "Antrian studio" is monitoring-only, not a working queue —
  // they act on escalations in "Perlu keputusan owner" instead (see
  // requireStudioHead: starting/escalating a regular ticket is exclusively
  // the Kepala Studio's job). To cut the repetition this used to cause:
  // drop escalated/owner_handling tickets (already shown, actionable, in
  // "Perlu keputusan owner") and tickets the owner filed themselves
  // (already shown, actionable, in "Tiket saya" below).
  // "Tiket saya": yang sudah selesai (dan sudah dikonfirmasi pelapor) atau
  // dibatalkan disembunyikan ke arsip. Tiket selesai yang MASIH menunggu
  // konfirmasi pelapor tetap tampil — tombol Konfirmasi/Belum beres ada di sana.
  const isArchived = (t: Ticket) =>
    t.status === "cancelled" || (t.status === "resolved" && !needsFilerConfirmation(t));
  const myActive = myTickets.filter((t) => !isArchived(t));
  const myArchived = myTickets.filter(isArchived);

  const ownerMonitorQueue = activeQueue.filter(
    (t) => isStudioQueueStatus(t.status) && t.createdBy !== uid
  );

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
            hint="Hanya tiket yang diselesaikan Kepala Studio. Tiket yang eskalasinya di-ACC owner tidak dihitung."
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

      {/* Antrian studio — aksi penuh untuk Kepala Studio; pemantauan
          read-only untuk owner (aksi owner ada di section eskalasi). */}
      {isManager && (
        <Section
          icon={<TicketIcon size={16} />}
          title={viewerRole === "owner" ? "Antrian studio (pemantauan)" : "Antrian studio"}
          count={viewerRole === "owner" ? ownerMonitorQueue.length : activeQueue.length}
          empty="Antrian bersih — tidak ada tiket aktif. 🎉"
        >
          {(viewerRole === "owner" ? ownerMonitorQueue : activeQueue).map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              viewerRole={viewerRole}
              context={viewerRole === "owner" ? "monitor" : "queue"}
            />
          ))}
        </Section>
      )}

      {/* Tiket saya (semua peran yang bisa membuat) */}
      <Section
        icon={<CheckCircle2 size={16} />}
        title="Tiket saya"
        count={myActive.length}
        empty={
          myArchived.length > 0
            ? "Tidak ada tiket aktif."
            : "Belum ada tiket. Ketuk “Buat Tiket” untuk melapor."
        }
      >
        {myActive.map((t) => (
          <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="mine" />
        ))}
      </Section>

      {myArchived.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="text-muted-foreground">
              <Archive size={16} />
            </span>
            <h2 className="font-display font-bold text-base">Arsip tiket selesai</h2>
            <span className="text-xs font-semibold text-muted-foreground rounded-full bg-muted px-2 py-0.5">
              {myArchived.length}
            </span>
            <ChevronDown
              size={16}
              className={`ml-auto text-muted-foreground transition-transform ${showArchive ? "rotate-180" : ""}`}
            />
          </button>
          {showArchive && (
            <div className="space-y-3">
              {myArchived.map((t) => (
                <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="mine" />
              ))}
            </div>
          )}
        </section>
      )}
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
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "good";
  /** Tooltip penjelas cakupan angka (native title). */
  hint?: string;
}) {
  return (
    <div
      className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm"
      title={hint}
    >
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
