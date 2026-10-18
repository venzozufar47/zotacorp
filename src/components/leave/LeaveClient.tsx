"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Check,
  DoorOpen,
  Plus,
  Send,
  Thermometer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  submitLeaveRequest,
  submitLeaveForMember,
  decideLeaveRequest,
  type LeaveKind,
  type LeaveRequestView,
  type ColleagueOption,
} from "@/lib/actions/leave-requests.actions";
import { LEAVE_KIND_LABEL } from "@/lib/leave/constants";
import { cn } from "@/lib/utils";

type Tab = "ajukan" | "input" | "riwayat" | "persetujuan";

const KIND_META: Record<
  LeaveKind,
  { short: string; icon: ComponentType<{ className?: string }>; reasonHint: string }
> = {
  sakit: { short: "Sakit", icon: Thermometer, reasonHint: "Mis. demam, sakit perut" },
  izin_keluar_toko: {
    short: "Keluar toko",
    icon: DoorOpen,
    reasonHint: "Mis. ke bank, antar barang",
  },
  tukar_shift: { short: "Tukar shift", icon: ArrowLeftRight, reasonHint: "Mis. ada acara keluarga" },
};

const RETURN_CHIPS = ["30 menit", "1 jam", "2 jam", "Besok"];

const STATUS_META: Record<
  LeaveRequestView["status"],
  { label: string; badge: string; bar: string }
> = {
  pending: { label: "Menunggu", badge: "bg-warning/40 text-foreground", bar: "bg-warning" },
  approved: { label: "Disetujui", badge: "bg-success/20 text-success", bar: "bg-success" },
  rejected: { label: "Ditolak", badge: "bg-destructive/15 text-destructive", bar: "bg-destructive" },
};

/** Waktu "sekarang" dari server — sama di SSR dan klien, jadi tidak ada beda hydration. */
const NowContext = createContext(0);

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

/** "2026-10-24" → "Sab, 24 Okt". Tanggal murni, tanpa jam, jadi aman di SSR. */
function dateLabel(ymd: string | null): string {
  if (!ymd) return "—";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
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
      {r.kind === "tukar_shift" && (
        <p className="text-xs text-muted-foreground">
          Tukar dengan {r.swapWithName ?? "—"} · {dateLabel(r.swapDate)}
        </p>
      )}
    </>
  );
}

function HistoryRow({ r, leaderLabel, showName }: { r: LeaveRequestView; leaderLabel: string; showName?: boolean }) {
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
  const canPickBackup = r.kind !== "tukar_shift";

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
          {canPickBackup && (
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
          )}
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

type LeaveFormValues = {
  kind: LeaveKind;
  reason: string;
  plannedReturn: string | null;
  swapDate: string | null;
  swapWithUserId: string | null;
};

/**
 * Form izin yang dipakai DUA jalur: karyawan mengajukan, dan atasan/Owner
 * mencatatkan atas nama anggota. `onSubmit` mengembalikan true bila berhasil
 * (form dikosongkan). `slot` = isian tambahan di atas form (pemilih anggota).
 */
function LeaveForm({
  colleagues,
  excludeId,
  submitLabel,
  note,
  slot,
  canSubmit = true,
  onSubmit,
}: {
  colleagues: ColleagueOption[];
  /** Orang yang tak boleh jadi rekan tukar shift (pemohon sendiri). */
  excludeId?: string;
  submitLabel: React.ReactNode;
  note?: React.ReactNode;
  slot?: React.ReactNode;
  canSubmit?: boolean;
  onSubmit: (v: LeaveFormValues) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<LeaveKind>("sakit");
  const [reason, setReason] = useState("");
  const [plannedReturn, setPlannedReturn] = useState("");
  const [swapDate, setSwapDate] = useState("");
  const [swapWith, setSwapWith] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) {
      toast.error("Isi alasan dulu");
      return;
    }
    if (kind === "tukar_shift" && (!swapDate || !swapWith)) {
      toast.error("Isi tanggal dan rekan tukar shift");
      return;
    }
    setSaving(true);
    try {
      const ok = await onSubmit({
        kind,
        reason,
        plannedReturn: kind === "tukar_shift" ? null : plannedReturn || null,
        swapDate: kind === "tukar_shift" ? swapDate : null,
        swapWithUserId: kind === "tukar_shift" ? swapWith : null,
      });
      if (ok) {
        setReason("");
        setPlannedReturn("");
        setSwapDate("");
        setSwapWith("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {slot}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Jenis izin">
        {(Object.keys(KIND_META) as LeaveKind[]).map((k) => {
          const Icon = KIND_META[k].icon;
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(k)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-xs font-bold transition",
                on
                  ? "border-foreground bg-primary text-primary-foreground shadow-hard-sm"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/60"
              )}
            >
              <Icon className="size-5" />
              {KIND_META[k].short}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reason">Alasan</Label>
        <Textarea
          id="reason"
          rows={3}
          placeholder={KIND_META[kind].reasonHint}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {kind !== "tukar_shift" ? (
        <div className="space-y-1.5">
          <Label htmlFor="plannedReturn">Perkiraan kembali (opsional)</Label>
          <div className="flex flex-wrap gap-1.5">
            {RETURN_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPlannedReturn(plannedReturn === c ? "" : c)}
                className={cn(
                  "rounded-full border-2 px-3 py-1 text-xs font-semibold transition",
                  plannedReturn === c
                    ? "border-foreground bg-tertiary"
                    : "border-border text-muted-foreground hover:border-foreground/60"
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <Input
            id="plannedReturn"
            placeholder="Atau tulis sendiri"
            value={plannedReturn}
            onChange={(e) => setPlannedReturn(e.target.value)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="swapDate">Tanggal ditukar</Label>
            <Input id="swapDate" type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tukar dengan</Label>
            <Select value={swapWith} onValueChange={(v) => v && setSwapWith(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih rekan" />
              </SelectTrigger>
              <SelectContent>
                {colleagues
                  .filter((c) => c.id !== excludeId)
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

      <div className="space-y-2">
        <Button onClick={handleSubmit} loading={saving} disabled={!canSubmit} size="lg" className="w-full">
          {submitLabel}
        </Button>
        {note && <p className="text-center text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

/** Jalur atasan/Owner: pilih anggota lalu catat izinnya — langsung disetujui. */
function MemberInputForm({
  members,
  colleagues,
  onDone,
}: {
  members: ColleagueOption[];
  colleagues: ColleagueOption[];
  onDone: () => void;
}) {
  const [memberId, setMemberId] = useState("");
  return (
    <LeaveForm
      colleagues={colleagues}
      excludeId={memberId}
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

export function LeaveClient({
  myRequests,
  approvalQueue,
  recentDecisions,
  colleagues,
  inputMembers,
  leaderNames,
  canApprove,
  nowMs,
}: {
  myRequests: LeaveRequestView[];
  approvalQueue: LeaveRequestView[];
  recentDecisions: LeaveRequestView[];
  colleagues: ColleagueOption[];
  /** Anggota yang boleh dicatatkan izinnya oleh pemanggil (atasan / Owner). Kosong = tab Input tidak muncul. */
  inputMembers: ColleagueOption[];
  /** Atasan langsung pemanggil; kosong = pengajuan jatuh ke Owner. */
  leaderNames: string[];
  canApprove: boolean;
  /** Date.now() dari server, untuk label "x jam lalu". */
  nowMs: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(approvalQueue.length > 0 ? "persetujuan" : "ajukan");

  const leaderLabel = leaderNames.length > 0 ? leaderNames.join(" / ") : "Owner";
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "ajukan", label: "Ajukan" },
    ...(inputMembers.length > 0 ? [{ id: "input" as const, label: "Input" }] : []),
    { id: "riwayat", label: "Riwayat" },
    ...(canApprove
      ? [{ id: "persetujuan" as const, label: "Persetujuan", count: approvalQueue.length }]
      : []),
  ];

  return (
    <NowContext.Provider value={nowMs}>
      <div className="space-y-4">
        <div
          role="tablist"
          className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border-2 border-foreground bg-muted p-1"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition",
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {!!t.count && (
                <span
                  className={cn(
                    "grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold leading-5",
                    tab === t.id ? "bg-primary-foreground text-primary" : "bg-destructive text-white"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "ajukan" && (
          <LeaveForm
            colleagues={colleagues}
            submitLabel={
              <>
                <Send /> Kirim ke {leaderLabel}
              </>
            }
            note={
              leaderNames.length === 0
                ? "Kamu belum punya atasan langsung tercatat, jadi pengajuan masuk ke Owner."
                : undefined
            }
            onSubmit={async (v) => {
              const res = await submitLeaveRequest(v);
              if (!res.ok) {
                toast.error(res.error);
                return false;
              }
              toast.success(`Terkirim ke ${leaderLabel}`);
              setTab("riwayat");
              router.refresh();
              return true;
            }}
          />
        )}

        {tab === "input" && inputMembers.length > 0 && (
          <MemberInputForm
            members={inputMembers}
            colleagues={colleagues}
            onDone={() => {
              router.refresh();
            }}
          />
        )}

        {tab === "riwayat" && (
          <div className="space-y-2">
            {myRequests.length === 0 ? (
              <Empty>Belum ada pengajuan.</Empty>
            ) : (
              myRequests.map((r) => <HistoryRow key={r.id} r={r} leaderLabel={leaderLabel} />)
            )}
          </div>
        )}

        {tab === "persetujuan" && canApprove && (
          <div className="space-y-4">
            {approvalQueue.length === 0 ? (
              <Empty>Tidak ada pengajuan yang menunggu. 🎉</Empty>
            ) : (
              <div className="space-y-3">
                {approvalQueue.map((r) => (
                  <ApprovalCard key={r.id} r={r} colleagues={colleagues} onDecided={() => router.refresh()} />
                ))}
              </div>
            )}
            {recentDecisions.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-display text-sm font-bold text-muted-foreground">
                  Sudah diputuskan (14 hari)
                </h2>
                {recentDecisions.map((r) => (
                  <HistoryRow key={r.id} r={r} leaderLabel={leaderLabel} showName />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </NowContext.Provider>
  );
}
