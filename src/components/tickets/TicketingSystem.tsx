"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TicketForm } from "./TicketForm";
import { StatusChip, TicketCard, type TicketContext } from "./TicketCard";
import { BranchQueueCard } from "./BranchQueueCard";
import {
  agoLabel,
  formatDuration,
  isTicketOpen,
  needsFilerConfirmation,
  TICKET_CATEGORY_LABELS,
  type Ticket,
  type TicketQueueSummary,
  type TicketViewerRole,
} from "@/lib/tickets/types";
import { OWNER_LEVEL } from "@/lib/tickets/chain-logic";
import { useIsDesktop } from "@/lib/tickets/use-desktop";
import { cn } from "@/lib/utils";
import type { StudioHeadKpi, TicketFormOptions } from "@/lib/actions/tickets.actions";

type Person = { id: string; name: string };
type Tab = "perlu" | "saya" | "pantau";

interface Entry {
  t: Ticket;
  ctx: TicketContext;
  sup?: Person[];
  team?: Person[];
  /** Judul kelompok kecil di dalam tab "Perlu saya". */
  group?: string;
}

/**
 * Halaman Tiket untuk karyawan, atasan, dan owner (komponen sama di /tickets dan /admin/tickets).
 *
 * Tiga tab: "Perlu saya" (yang menunggu tindakanku), "Tiket saya", dan "Pantau" (tiket di cabang yang dipegang
 * orang lain; untuk karyawan: antrean rekan sekantor, baca-saja). Baris hanya memuat judul, status, dan siapa;
 * isi lengkap dan tombol aksi terbuka saat baris diketuk. Di layar lebar (>= 1024px) detail tampil di panel kanan.
 *
 * Penanggung jawab sebuah tiket = penerima langsung (orang) atau owner; tiket di cabangku yang dipegang orang lain
 * hanya dipantau.
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
  const isDesktop = useIsDesktop();
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
  // Tiket 'turun' untukku sudah tampil di "Perlu saya", jadi tidak diulang di Pantau.
  const assignedIds = new Set(assignedToMe.map((t) => t.id));
  const monitor = open.filter((t) => !heldByMe(t) && t.createdBy !== uid && !assignedIds.has(t.id));
  const urgentFirst = (a: Ticket, b: Ticket) => Number(b.priority === "urgent") - Number(a.priority === "urgent");
  // Cabang hanya ditampilkan di baris bila tiket yang terlihat berasal dari lebih dari satu cabang.
  const multiBranch = new Set([...myTickets, ...assignedToMe, ...studioQueue].map((t) => t.branchId)).size > 1;
  const assignedActive = assignedToMe.filter((t) => isTicketOpen(t.status) || (t.status === "resolved" && !t.confirmedAt));

  // "Tiket saya": yang sudah selesai (dan dikonfirmasi pembuat) atau dibatalkan masuk arsip. Tiket selesai yang MASIH
  // menunggu konfirmasi pembuat tetap tampil.
  const isArchived = (t: Ticket) => t.status === "cancelled" || (t.status === "resolved" && !needsFilerConfirmation(t));
  const myActive = myTickets.filter((t) => !isArchived(t));
  const myArchived = myTickets.filter(isArchived);

  const perlu: Entry[] = [
    ...[...toDecide].sort(urgentFirst).map((t) => ({ t, ctx: "escalation" as const, sup: formOptions.mySuperiors[t.branchId], group: "Keputusan eskalasi" })),
    ...myActive.filter(needsFilerConfirmation).map((t) => ({ t, ctx: "mine" as const, group: "Perlu kamu konfirmasi" })),
    ...[...assignedActive]
      .filter((t) => t.status !== "resolved")
      .sort(urgentFirst)
      .map((t) => ({ t, ctx: "assigned" as const, team: formOptions.myTeam[t.branchId], group: "Dari owner" })),
    ...[...toAct].sort(urgentFirst).map((t) => ({
      t,
      ctx: "queue" as const,
      sup: formOptions.mySuperiors[t.branchId],
      team: formOptions.forwardTargets?.[t.branchId],
      group: "Perlu ditindak",
    })),
    // Sudah kukerjakan, menunggu owner mengonfirmasi: tidak butuh tindakanku, jadi tidak dihitung di lencana.
    ...assignedActive
      .filter((t) => t.status === "resolved")
      .map((t) => ({ t, ctx: "assigned" as const, group: "Menunggu konfirmasi owner" })),
  ];
  const perluCount = perlu.filter((e) => e.group !== "Menunggu konfirmasi owner").length;
  const saya: Entry[] = myActive.map((t) => ({ t, ctx: "mine" as const }));
  const arsip: Entry[] = myArchived.map((t) => ({ t, ctx: "mine" as const }));
  const pantau: Entry[] = monitor.map((t) => ({ t, ctx: "monitor" as const }));

  const showPerlu = isManager || perlu.length > 0;
  const showPantau = isManager ? true : branchQueue.length > 0;
  const [tab, setTab] = useState<Tab>(perluCount > 0 ? "perlu" : "saya");
  const [openId, setOpenId] = useState<string | null>(null);
  const activeTab: Tab = (tab === "perlu" && !showPerlu) || (tab === "pantau" && !showPantau) ? "saya" : tab;

  const entries = activeTab === "perlu" ? perlu : activeTab === "saya" ? [...saya, ...arsip] : pantau;
  const found = entries.find((e) => e.t.id === openId) ?? null;
  // Di desktop panel detail selalu terisi (tiket pertama bila belum ada yang dipilih).
  const selected = found ?? (isDesktop ? entries[0] ?? null : null);

  function pick(id: string) {
    setOpenId((cur) => (isDesktop ? id : cur === id ? null : id));
  }

  const tabs: { id: Tab; label: string; count: number; urgent?: boolean }[] = [
    ...(showPerlu ? [{ id: "perlu" as const, label: "Perlu saya", count: perluCount, urgent: true }] : []),
    { id: "saya", label: "Tiket saya", count: saya.length },
    ...(showPantau ? [{ id: "pantau" as const, label: isManager ? "Pantau" : "Cabang", count: isManager ? pantau.length : branchQueue.length }] : []),
  ];

  const summary =
    isManager && kpi ? (
      <p className="text-sm text-muted-foreground tabular-nums">
        <b className="text-foreground">{kpi.openCount + kpi.inProgressCount + kpi.escalatedCount + kpi.ownerHandlingCount}</b> aktif
        {" · "}
        <b className="text-foreground">{kpi.resolvedThisMonth}</b> selesai bulan ini
        {" · "}
        rata-rata <b className="text-foreground">{kpi.avgResolutionMs != null ? formatDuration(kpi.avgResolutionMs) : "—"}</b>
      </p>
    ) : (
      <p className="text-sm text-muted-foreground tabular-nums">
        <b className="text-foreground">{myActive.length}</b> tiket aktif
      </p>
    );

  const list = (
    <div className="space-y-3">
      <div role="tablist" aria-label="Daftar tiket" className={cn("grid gap-1 rounded-xl bg-muted p-1", tabs.length === 3 ? "grid-cols-[1.25fr_1.25fr_1fr]" : "grid-cols-2")}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => {
              setTab(t.id);
              setOpenId(null);
            }}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13px] font-semibold transition-colors",
              activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums",
                  t.urgent ? "bg-destructive text-white" : "bg-foreground/10 text-foreground"
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "pantau" && !isManager ? (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {branchQueue.map((t) => (
            <BranchQueueCard key={t.id} ticket={t} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {activeTab === "perlu"
            ? "Tidak ada yang menunggu tindakanmu."
            : activeTab === "saya"
              ? "Belum ada tiket. Ketuk Buat Tiket untuk melapor."
              : "Tidak ada tiket lain yang dipantau."}
        </p>
      ) : (
        <>
          <Rows
            entries={activeTab === "saya" ? saya : entries}
            selectedId={selected?.t.id ?? null}
            openId={isDesktop ? null : openId}
            onPick={pick}
            viewerRole={viewerRole}
            showBranch={multiBranch}
            groups={activeTab === "perlu"}
          />
          {activeTab === "saya" && arsip.length > 0 && (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-1 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown size={16} className="-rotate-90 transition-transform group-open:rotate-0" aria-hidden />
                Arsip ({arsip.length})
              </summary>
              <Rows
                entries={arsip}
                selectedId={selected?.t.id ?? null}
                openId={isDesktop ? null : openId}
                onPick={pick}
                viewerRole={viewerRole}
                showBranch={multiBranch}
              />
            </details>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">{summary}</div>
        <TicketForm uid={uid} options={formOptions} isOwner={isOwner} />
      </div>

      {isDesktop ? (
        <div className="grid grid-cols-[minmax(340px,420px)_minmax(0,1fr)] items-start gap-6">
          {list}
          <div className="sticky top-20">
            {selected && !(activeTab === "pantau" && !isManager) ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <TicketCard
                  key={selected.t.id}
                  ticket={selected.t}
                  viewerRole={viewerRole}
                  context={selected.ctx}
                  mySuperiors={selected.sup}
                  myTeam={selected.team}
                  embedded
                />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                {activeTab === "pantau" && !isManager
                  ? "Antrean rekan hanya untuk dilihat; detailnya tidak dibuka."
                  : "Pilih tiket di sebelah kiri untuk melihat detailnya."}
              </p>
            )}
          </div>
        </div>
      ) : (
        list
      )}
    </div>
  );
}

/** Daftar baris ringkas. Di layar kecil baris yang diketuk membuka detail tepat di bawahnya. */
function Rows({
  entries,
  selectedId,
  openId,
  onPick,
  viewerRole,
  showBranch,
  groups = false,
}: {
  entries: Entry[];
  selectedId: string | null;
  openId: string | null;
  onPick: (id: string) => void;
  viewerRole: TicketViewerRole;
  showBranch: boolean;
  groups?: boolean;
}) {
  let lastGroup: string | undefined;
  const nodes: React.ReactNode[] = [];
  let current: React.ReactNode[] = [];
  const flush = () => {
    if (current.length === 0) return;
    nodes.push(
      <div key={`g-${nodes.length}`} className="space-y-1.5">
        {groups && lastGroup && <p className="px-1 text-xs font-semibold text-muted-foreground">{lastGroup}</p>}
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{current}</ul>
      </div>
    );
    current = [];
  };
  for (const e of entries) {
    if (groups && e.group !== lastGroup) {
      flush();
      lastGroup = e.group;
    }
    const expanded = openId === e.t.id;
    current.push(
      <li key={e.t.id} className={cn(selectedId === e.t.id && "bg-accent/40")}>
        <TicketRow ticket={e.t} ctx={e.ctx} expanded={expanded} showBranch={showBranch} onClick={() => onPick(e.t.id)} />
        {expanded && (
          <div className="border-t border-border bg-muted/20">
            <TicketCard
              ticket={e.t}
              viewerRole={viewerRole}
              context={e.ctx}
              mySuperiors={e.sup}
              myTeam={e.team}
              embedded
              showHeader={false}
            />
          </div>
        )}
      </li>
    );
  }
  flush();
  return <div className="space-y-3">{nodes}</div>;
}

function TicketRow({
  ticket,
  ctx,
  expanded,
  showBranch,
  onClick,
}: {
  ticket: Ticket;
  ctx: TicketContext;
  expanded: boolean;
  showBranch: boolean;
  onClick: () => void;
}) {
  const who =
    ticket.direction === "down"
      ? `Untuk ${ticket.assigneeName ?? "seluruh cabang"}`
      : ctx !== "mine" && ticket.createdByName
        ? ticket.createdByName
        : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-start gap-2">
          {ticket.priority === "urgent" && (
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" title="Mendesak" aria-label="Mendesak" />
          )}
          <span className={cn("break-words text-sm font-semibold leading-snug", !expanded && "line-clamp-2")}>{ticket.title}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <StatusChip ticket={ticket} />
          {showBranch && <span className="truncate">{ticket.branch}</span>}
          <span>{TICKET_CATEGORY_LABELS[ticket.category]}</span>
          {who && (
            <>
              <span className="truncate">{who}</span>
            </>
          )}
          <span>{agoLabel(ticket.createdAt)}</span>
        </span>
      </span>
      <ChevronDown
        size={16}
        className={cn("mt-1 shrink-0 text-muted-foreground transition-transform lg:hidden", expanded && "rotate-180")}
        aria-hidden
      />
    </button>
  );
}
