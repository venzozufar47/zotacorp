"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  submitLeaveRequest,
  decideLeaveRequest,
  type LeaveKind,
  type LeaveRequestView,
  type ColleagueOption,
} from "@/lib/actions/leave-requests.actions";
import { LEAVE_KIND_LABEL } from "@/lib/leave/constants";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Menunggu", className: "text-amber-600" },
  approved: { label: "Disetujui", className: "text-success" },
  rejected: { label: "Ditolak", className: "text-destructive" },
};

function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RequestRow({ r }: { r: LeaveRequestView }) {
  const status = STATUS_LABEL[r.status];
  return (
    <div className="rounded-xl border-2 border-border p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{LEAVE_KIND_LABEL[r.kind]}</span>
        <span className={`text-xs font-semibold ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{dateTimeLabel(r.createdAt)}</p>
      <p className="text-sm">{r.reason}</p>
      {r.plannedReturn && (
        <p className="text-xs text-muted-foreground">Perkiraan kembali: {r.plannedReturn}</p>
      )}
      {r.kind === "tukar_shift" && (
        <p className="text-xs text-muted-foreground">
          Tukar dengan {r.swapWithName ?? "—"} pada {r.swapDate ?? "—"}
        </p>
      )}
      {r.status !== "pending" && (
        <p className="text-xs text-muted-foreground">
          {status.label} oleh {r.approverName ?? "—"}
          {r.approverNote ? ` — ${r.approverNote}` : ""}
          {r.backupName ? `. Pengganti: ${r.backupName}` : ""}
        </p>
      )}
    </div>
  );
}

function ApprovalRow({
  r,
  colleagues,
  onDecided,
}: {
  r: LeaveRequestView;
  colleagues: ColleagueOption[];
  onDecided: () => void;
}) {
  const [note, setNote] = useState("");
  const [backup, setBackup] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
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
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {r.userName} · {LEAVE_KIND_LABEL[r.kind]}
        </span>
        <span className="text-xs text-muted-foreground">{dateTimeLabel(r.createdAt)}</span>
      </div>
      <p className="text-sm">{r.reason}</p>
      {r.plannedReturn && (
        <p className="text-xs text-muted-foreground">Perkiraan kembali: {r.plannedReturn}</p>
      )}
      {r.kind === "tukar_shift" && (
        <p className="text-xs text-muted-foreground">
          Tukar dengan {r.swapWithName ?? "—"} pada {r.swapDate ?? "—"}
        </p>
      )}
      {r.kind !== "tukar_shift" && (
        <div>
          <Label className="text-xs">Pengganti (opsional)</Label>
          <Select value={backup} onValueChange={(v) => v && setBackup(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih pengganti" />
            </SelectTrigger>
            <SelectContent>
              {colleagues.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Input placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" loading={busy} onClick={() => decide("approved")}>
          Setujui
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          loading={busy}
          onClick={() => decide("rejected")}
        >
          Tolak
        </Button>
      </div>
    </div>
  );
}

export function LeaveClient({
  myRequests,
  approvalQueue,
  colleagues,
}: {
  myRequests: LeaveRequestView[];
  approvalQueue: LeaveRequestView[];
  colleagues: ColleagueOption[];
}) {
  const router = useRouter();
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
      const res = await submitLeaveRequest({
        kind,
        reason,
        plannedReturn: plannedReturn || null,
        swapDate: kind === "tukar_shift" ? swapDate : null,
        swapWithUserId: kind === "tukar_shift" ? swapWith : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengajuan terkirim ke atasanmu");
      setReason("");
      setPlannedReturn("");
      setSwapDate("");
      setSwapWith("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {approvalQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Menunggu persetujuanmu ({approvalQueue.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvalQueue.map((r) => (
              <ApprovalRow key={r.id} r={r} colleagues={colleagues} onDecided={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ajukan izin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Jenis</Label>
            <Select value={kind} onValueChange={(v) => v && setKind(v as LeaveKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LEAVE_KIND_LABEL) as LeaveKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {LEAVE_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="reason">Alasan</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          {kind !== "tukar_shift" && (
            <div>
              <Label htmlFor="plannedReturn">Perkiraan kembali</Label>
              <Input
                id="plannedReturn"
                placeholder="Mis. besok pagi, 30 menit"
                value={plannedReturn}
                onChange={(e) => setPlannedReturn(e.target.value)}
              />
            </div>
          )}

          {kind === "tukar_shift" && (
            <>
              <div>
                <Label htmlFor="swapDate">Tanggal yang ditukar</Label>
                <Input
                  id="swapDate"
                  type="date"
                  value={swapDate}
                  onChange={(e) => setSwapDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Tukar dengan</Label>
                <Select value={swapWith} onValueChange={(v) => v && setSwapWith(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih rekan" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagues.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button onClick={handleSubmit} loading={saving} className="w-full">
            Kirim ke atasan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pengajuanku</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengajuan.</p>
          ) : (
            myRequests.map((r) => <RequestRow key={r.id} r={r} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
