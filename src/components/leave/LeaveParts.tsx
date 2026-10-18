"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  submitLeaveForMember,
  decideLeaveRequest,
  type LeaveKind,
  type LeaveRequestView,
  type ColleagueOption,
} from "@/lib/actions/leave-requests.actions";
import { LEAVE_KIND_LABEL } from "@/lib/leave/constants";
import { cn } from "@/lib/utils";
import { LeaveForm, KIND_META } from "./LeaveForm";

const STATUS_META: Record<
  LeaveRequestView["status"],
  { label: string; badge: string; bar: string }
> = {
  pending: { label: "Menunggu", badge: "bg-warning/40 text-foreground", bar: "bg-warning" },
  approved: { label: "Disetujui", badge: "bg-success/20 text-success", bar: "bg-success" },
  rejected: { label: "Ditolak", badge: "bg-destructive/15 text-destructive", bar: "bg-destructive" },
};

/** Waktu "sekarang" dari server — sama di SSR dan klien, jadi tidak ada beda hydration. */
export const NowContext = createContext(0);

function useTimeAgo() {
  const now = useContext(NowContext);
  return (iso: string) => timeAgo(iso, now);
}

function timeAgo(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function KindChip({ kind }: { kind: LeaveKind }) {
  const Icon = KIND_META[kind].icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      <Icon className="size-3" />
      {LEAVE_KIND_LABEL[kind]}
    </span>
  );
}

/** Detail yang sama di kartu riwayat dan kartu persetujuan. */
function RequestDetail({ r }: { r: LeaveRequestView }) {
  return (
    <>
      <p className="text-sm">{r.reason}</p>
      {r.plannedReturn && (
        <p className="text-xs text-muted-foreground">Kembali: {r.plannedReturn}</p>
      )}
    </>
  );
}

export function HistoryRow({ r, leaderLabel, showName }: { r: LeaveRequestView; leaderLabel: string; showName?: boolean }) {
  const ago = useTimeAgo();
  const status = STATUS_META[r.status];
  return (
    <div className="flex overflow-hidden rounded-xl border-2 border-border">
      <span className={cn("w-1.5 shrink-0", status.bar)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {showName && <span className="truncate text-sm font-semibold">{r.userName}</span>}
            <KindChip kind={r.kind} />
            {r.enteredByName && (
              <span className="rounded-full bg-tertiary px-2 py-0.5 text-[10.5px] font-semibold">
                Diinput {r.enteredByName}
              </span>
            )}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", status.badge)}>
            {status.label}
          </span>
        </div>
        <RequestDetail r={r} />
        <p className="text-xs text-muted-foreground">
          {r.status === "pending"
            ? `Dikirim ${ago(r.createdAt)} · menunggu ${leaderLabel}`
            : `${status.label} oleh ${r.approverName ?? "—"} · ${ago(r.decidedAt ?? r.createdAt)}`}
          {r.approverNote ? ` — “${r.approverNote}”` : ""}
          {r.backupName ? ` · Pengganti: ${r.backupName}` : ""}
        </p>
      </div>
    </div>
  );
}

function ApprovalCard({
  r,
  colleagues,
  onDecided,
}: {
  r: LeaveRequestView;
  colleagues: ColleagueOption[];
  onDecided: () => void;
}) {
  const ago = useTimeAgo();
  const [more, setMore] = useState(false);
  const [note, setNote] = useState("");
  const [backup, setBackup] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    try {
      const res = await decideLeaveRequest({
        requestId: r.id,
        decision,
        note: note || null,
        backupUserId: backup || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(decision === "approved" ? "Disetujui" : "Ditolak");
      onDecided();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground bg-tertiary font-display text-sm font-bold"
        >
          {r.userName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-sm font-bold">{r.userName}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{ago(r.createdAt)}</span>
          </div>
          <KindChip kind={r.kind} />
          <RequestDetail r={r} />
        </div>
      </div>

      {more && (
        <div className="space-y-2 rounded-xl bg-muted/50 p-3">
          <Input
            aria-label="Catatan"
            placeholder="Catatan untuk pemohon (opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div>
            <Label className="text-xs">Pengganti selama izin (opsional)</Label>
            <Select value={backup} onValueChange={(v) => v && setBackup(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih rekan" />
              </SelectTrigger>
              <SelectContent>
                {colleagues
                  .filter((c) => c.id !== r.userId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          className="flex-1"
          loading={busy === "approved"}
          disabled={busy !== null}
          onClick={() => decide("approved")}
        >
          <Check /> Setujui
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          loading={busy === "rejected"}
          disabled={busy !== null}
          onClick={() => decide("rejected")}
        >
          <X /> Tolak
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={more ? "Sembunyikan catatan" : "Tambah catatan atau pengganti"}
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <Plus className={cn("transition-transform", more && "rotate-45")} />
        </Button>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Jalur atasan/Owner: pilih anggota lalu catat izinnya — langsung disetujui. */
function MemberInputForm({
  members,
  onDone,
}: {
  members: ColleagueOption[];
  onDone: () => void;
}) {
  const [memberId, setMemberId] = useState("");
  return (
    <LeaveForm
      canSubmit={!!memberId}
      submitLabel={
        <>
          <Check /> Catat izin (langsung disetujui)
        </>
      }
      note="Izin dicatat atas nama anggota dan ditandai sebagai diinput olehmu. Anggota menerima pemberitahuan."
      slot={
        <div className="space-y-1.5">
          <Label>Anggota</Label>
          <Select value={memberId} onValueChange={(v) => v && setMemberId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih anggota" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      onSubmit={async (v) => {
        if (!memberId) {
          toast.error("Pilih anggota dulu");
          return false;
        }
        const res = await submitLeaveForMember({ memberId, ...v });
        if (!res.ok) {
          toast.error(res.error);
          return false;
        }
        toast.success("Izin tercatat dan disetujui");
        setMemberId("");
        onDone();
        return true;
      }}
    />
  );
}

/** Kontrol tab pil — dipakai pop-up karyawan dan panel atasan. */
export function SegTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border-2 border-foreground bg-muted p-1"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition",
            value === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
          {!!t.count && (
            <span
              className={cn(
                "grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold leading-5",
                value === t.id ? "bg-primary-foreground text-primary" : "bg-destructive text-white"
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

type PanelTab = "persetujuan" | "catat" | "diputuskan";

/**
 * Izin dari sisi atasan — satu panel, dipakai di halaman Tim (atasan langsung)
 * dan di /admin/izin (Owner, untuk karyawan tanpa atasan): antrean persetujuan,
 * catat izin atas nama anggota, dan keputusan terakhir.
 */
export function LeaveApproverPanel({
  queue,
  recentDecisions,
  colleagues,
  inputMembers,
  nowMs,
}: {
  queue: LeaveRequestView[];
  recentDecisions: LeaveRequestView[];
  colleagues: ColleagueOption[];
  /** Anggota yang boleh dicatatkan izinnya; kosong = tab "Catat izin" tidak muncul. */
  inputMembers: ColleagueOption[];
  nowMs: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<PanelTab>("persetujuan");
  const tabs: { id: PanelTab; label: string; count?: number }[] = [
    { id: "persetujuan", label: "Persetujuan", count: queue.length },
    ...(inputMembers.length > 0 ? [{ id: "catat" as const, label: "Catat izin" }] : []),
    { id: "diputuskan", label: "Diputuskan" },
  ];

  return (
    <NowContext.Provider value={nowMs}>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
            <CalendarClock size={15} />
          </span>
          <h2 className="font-display text-sm font-bold">Izin anggota</h2>
        </div>
        <SegTabs tabs={tabs} value={tab} onChange={setTab} />

        {tab === "persetujuan" &&
          (queue.length === 0 ? (
            <Empty>Tidak ada pengajuan yang menunggu. 🎉</Empty>
          ) : (
            <div className="space-y-3">
              {queue.map((r) => (
                <ApprovalCard key={r.id} r={r} colleagues={colleagues} onDecided={() => router.refresh()} />
              ))}
            </div>
          ))}

        {tab === "catat" && inputMembers.length > 0 && (
          <MemberInputForm
            members={inputMembers}
            onDone={() => {
              router.refresh();
              setTab("diputuskan");
            }}
          />
        )}

        {tab === "diputuskan" &&
          (recentDecisions.length === 0 ? (
            <Empty>Belum ada keputusan dalam 14 hari terakhir.</Empty>
          ) : (
            <div className="space-y-2">
              {recentDecisions.map((r) => (
                <HistoryRow key={r.id} r={r} leaderLabel="" showName />
              ))}
            </div>
          ))}
      </section>
    </NowContext.Provider>
  );
}
