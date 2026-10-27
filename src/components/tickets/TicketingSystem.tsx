"use client";

import { useState } from "react";
import { Ticket as TicketIcon, Inbox, CheckCircle2, Archive, ChevronDown, Users, ClipboardCheck, Eye } from "lucide-react";
import { TicketForm } from "./TicketForm";
import { TicketCard } from "./TicketCard";
import { BranchQueueCard } from "./BranchQueueCard";
import {
  formatDuration,
  isTicketOpen,
  needsFilerConfirmation,
  type Ticket,
  type TicketQueueSummary,
  type TicketViewerRole,
} from "@/lib/tickets/types";
import { OWNER_LEVEL } from "@/lib/tickets/chain-logic";
import type { StudioHeadKpi, TicketFormOptions } from "@/lib/actions/tickets.actions";

/**
 * Halaman "Ticketing System" role-adaptive, dua arah dengan hierarki per cabang. Dipakai route employee (/tickets)
 * & admin (/admin/tickets) dengan komponen sama.
 *
 * Penanggung jawab sebuah tiket = anggota tingkat `handlerLevel` di cabangnya (owner untuk level 99). Tiket di
 * cabang saya yang dipegang tingkat lain hanya dipantau.
 */
export function TicketingSystem({
  viewerRole,
  uid,
  myTickets,
  assignedToMe = [],
  studioQueue = [],
  branchQueue = [],
  kpi = null,
  formOptions,
}: {
  viewerRole: TicketViewerRole;
  uid: string;
  myTickets: Ticket[];
  /** Tiket 'turun' dari owner untuk saya (atau untuk seluruh cabang saya). */
  assignedToMe?: Ticket[];
  /** Semua tiket di cabang yang saya pegang (owner: semua cabang). */
  studioQueue?: Ticket[];
  branchQueue?: TicketQueueSummary[];
  kpi?: StudioHeadKpi | null;
  formOptions: TicketFormOptions;
}) {
  const [showArchive, setShowArchive] = useState(false);
  const isOwner = viewerRole === "owner";
  const isManager = viewerRole === "head" || isOwner;

  /** Apakah tiket ini sedang menunggu SAYA sebagai penanggung jawab tingkat? */
  const heldByMe = (t: Ticket) => {
    if (t.direction === "down" && t.handlerLevel === 0) return false; // milik penerima
    if (t.handlerLevel >= OWNER_LEVEL) return isOwner;
    return t.handlerId === uid;
  };

  const open = studioQueue.filter((t) => isTicketOpen(t.status));
  const toDecide = open.filter((t) => heldByMe(t) && (t.status === "escalated" || t.status === "owner_handling"));
  const toAct = open.filter((t) => heldByMe(t) && (t.status === "open" || t.status === "in_progress"));
  // Pantau saja: dipegang tingkat lain / penerima tiket 'turun'; tiket yang saya buat sudah ada di "Tiket saya".
  const monitor = open.filter((t) => !heldByMe(t) && t.createdBy !== uid);

  const assignedActive = assignedToMe.filter((t) => isTicketOpen(t.status) || (t.status === "resolved" && !t.confirmedAt));

  // "Tiket saya": yang sudah selesai (dan sudah dikonfirmasi pembuat) atau dibatalkan disembunyikan ke arsip. Tiket
  // selesai yang MASIH menunggu konfirmasi pembuat tetap tampil.
  const isArchived = (t: Ticket) => t.status === "cancelled" || (t.status === "resolved" && !needsFilerConfirmation(t));
  const myActive = myTickets.filter((t) => !isArchived(t));
  const myArchived = myTickets.filter(isArchived);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {viewerRole === "filer"
              ? "Laporkan kebutuhan barang, kerusakan, atau masalah ke atasan di cabangmu. Tiket dari owner untukmu juga muncul di sini."
              : viewerRole === "head"
                ? "Tindaklanjuti laporan tim cabangmu. Eskalasi ke tingkat di atasmu jika di luar kendali."
                : "Keputusan eskalasi, tiket ke bawah, dan pemantauan semua cabang."}
          </p>
        </div>
        <TicketForm uid={uid} options={formOptions} isOwner={isOwner} />
      </div>

      {/* KPI penanganan */}
      {isManager && kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Kpi label="Belum selesai" value={kpi.openCount + kpi.inProgressCount + kpi.escalatedCount + kpi.ownerHandlingCount} tone="warn" />
          <Kpi label="Selesai (bln ini)" value={kpi.resolvedThisMonth} tone="good" />
          <Kpi label="Total selesai" value={kpi.resolvedCount} />
          <Kpi
            label="Rata-rata pengerjaan"
            value={kpi.avgResolutionMs != null ? formatDuration(kpi.avgResolutionMs) : "—"}
            hint="Hanya tiket laporan karyawan yang diselesaikan di rantai cabang. Tiket yang eskalasinya di-ACC atasan tidak dihitung."
          />
        </div>
      )}

      {/* Eskalasi yang menunggu keputusan saya */}
      {isManager && (toDecide.length > 0 || isOwner) && (
        <Section
          icon={<Inbox size={16} />}
          title={isOwner ? "Perlu keputusan owner" : "Perlu keputusan saya"}
          count={toDecide.length}
          empty="Tidak ada eskalasi yang menunggu."
        >
          {toDecide.map((t) => (
            <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="escalation" mySuperiors={formOptions.mySuperiors[t.branchId]} />
          ))}
        </Section>
      )}

      {/* Tiket 'turun' dari owner untuk saya */}
      {assignedActive.length > 0 && (
        <Section icon={<ClipboardCheck size={16} />} title="Untuk saya (dari owner)" count={assignedActive.length} empty="">
          {assignedActive.map((t) => (
            <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="assigned" />
          ))}
        </Section>
      )}

      {/* Tiket yang sedang saya pegang */}
      {isManager && (
        <Section icon={<TicketIcon size={16} />} title="Perlu ditindak" count={toAct.length} empty="Antrian bersih — tidak ada tiket menunggu tindakanmu. 🎉">
          {toAct.map((t) => (
            <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="queue" mySuperiors={formOptions.mySuperiors[t.branchId]} />
          ))}
        </Section>
      )}

      {/* Pemantauan */}
      {isManager && monitor.length > 0 && (
        <Section
          icon={<Eye size={16} />}
          title={isOwner ? "Pemantauan semua cabang" : "Pemantauan cabang"}
          count={monitor.length}
          empty=""
        >
          {monitor.map((t) => (
            <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="monitor" />
          ))}
        </Section>
      )}

      {/* Antrian sesama cabang — karyawan biasa; atasan/owner sudah melihat lewat bagian di atas. Read-only. */}
      {viewerRole === "filer" && (
        <Section
          icon={<Users size={16} />}
          title="Antrian sesama cabang"
          count={branchQueue.length}
          empty="Belum ada tiket aktif dari rekan sekantor."
        >
          {branchQueue.map((t) => (
            <BranchQueueCard key={t.id} ticket={t} />
          ))}
        </Section>
      )}

      {/* Tiket saya (semua peran yang bisa membuat) */}
      <Section
        icon={<CheckCircle2 size={16} />}
        title="Tiket saya"
        count={myActive.length}
        empty={myArchived.length > 0 ? "Tidak ada tiket aktif." : "Belum ada tiket. Ketuk “Buat Tiket” untuk melapor."}
      >
        {myActive.map((t) => (
          <TicketCard key={t.id} ticket={t} viewerRole={viewerRole} context="mine" />
        ))}
      </Section>

      {myArchived.length > 0 && (
        <section className="space-y-3">
          <button type="button" onClick={() => setShowArchive((v) => !v)} aria-expanded={showArchive} className="flex w-full items-center gap-2 text-left">
            <span className="text-muted-foreground">
              <Archive size={16} />
            </span>
            <h2 className="font-display font-bold text-base">Arsip tiket selesai</h2>
            <span className="text-xs font-semibold text-muted-foreground rounded-full bg-muted px-2 py-0.5">{myArchived.length}</span>
            <ChevronDown size={16} className={`ml-auto text-muted-foreground transition-transform ${showArchive ? "rotate-180" : ""}`} />
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
        <span className="text-xs font-semibold text-muted-foreground rounded-full bg-muted px-2 py-0.5">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-[13px] text-muted-foreground py-4 text-center rounded-2xl border border-dashed border-border">{empty}</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string | number; tone?: "warn" | "good"; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm" title={hint}>
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
