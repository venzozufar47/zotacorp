"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  postHuddle,
  postWeeklyMinutes,
  ackMinutes,
  type HuddleView,
  type WeeklyMinutesView,
  type MinutesBranch,
} from "@/lib/actions/team-minutes.actions";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Senin minggu ini, format YYYY-MM-DD (lokal browser — hanya default form). */
function thisMonday(): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function AckButton({
  kind,
  id,
  ackNames,
}: {
  kind: "huddle" | "weekly";
  id: string;
  ackNames: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>{ackNames.length > 0 ? `Dibaca: ${ackNames.join(", ")}` : "Belum ada yang ack"}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await ackMinutes(kind, id);
            if (!res.ok) toast.error(res.error);
            else router.refresh();
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 font-semibold text-foreground hover:bg-muted disabled:opacity-50"
      >
        <Check size={11} /> Sudah baca
      </button>
    </div>
  );
}

function HuddleSection({
  branch,
  huddle,
  canPost,
}: {
  branch: MinutesBranch;
  huddle: HuddleView | null;
  canPost: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [blocker, setBlocker] = useState("");
  const [holds, setHolds] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!target.trim()) {
      toast.error("Isi target hari ini");
      return;
    }
    setSaving(true);
    try {
      const res = await postHuddle({
        branch,
        targetToday: target,
        yesterdayBlocker: blocker || null,
        whoHoldsWhat: holds || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Huddle tercatat");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Huddle hari ini</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {huddle ? (
          <div className="space-y-1.5 text-sm">
            <p>
              <span className="font-semibold">Target:</span> {huddle.targetToday}
            </p>
            {huddle.yesterdayBlocker && (
              <p>
                <span className="font-semibold">Kendala kemarin:</span> {huddle.yesterdayBlocker}
              </p>
            )}
            {huddle.whoHoldsWhat && (
              <p>
                <span className="font-semibold">Siapa pegang apa:</span> {huddle.whoHoldsWhat}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Dicatat {huddle.postedByName ?? "—"}
            </p>
            <AckButton kind="huddle" id={huddle.id} ackNames={huddle.ackNames} />
          </div>
        ) : canPost ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Belum dicatat hari ini.</p>
            <div>
              <Label htmlFor="huddle-target">Target hari ini</Label>
              <Input id="huddle-target" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="huddle-blocker">Kendala kemarin (opsional)</Label>
              <Input id="huddle-blocker" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="huddle-holds">Siapa pegang apa (opsional)</Label>
              <Input id="huddle-holds" value={holds} onChange={(e) => setHolds(e.target.value)} />
            </div>
            <Button onClick={submit} loading={saving} className="w-full">
              Catat huddle
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum dicatat hari ini.</p>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyForm({
  branch,
  employees,
}: {
  branch: MinutesBranch;
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(thisMonday());
  const [scorecardNote, setScorecardNote] = useState("");
  const [problem, setProblem] = useState("");
  const [fixDescription, setFixDescription] = useState("");
  const [fixOwnerId, setFixOwnerId] = useState("");
  const [fixDeadline, setFixDeadline] = useState("");
  const [requests, setRequests] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await postWeeklyMinutes({
        branch,
        weekStart,
        scorecardNote: scorecardNote || null,
        problemAnalyzed: problem || null,
        fixDescription: fixDescription || null,
        fixOwnerId: fixOwnerId || null,
        fixDeadline: fixDeadline || null,
        requestsToOwner: requests || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Notulen mingguan tersimpan");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catat notulen minggu ini</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="week-start">Minggu (Senin)</Label>
          <Input id="week-start" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="scorecard-note">Scorecard minggu lalu</Label>
          <Textarea id="scorecard-note" value={scorecardNote} onChange={(e) => setScorecardNote(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="problem">Satu masalah, dikupas sampai sebab</Label>
          <Textarea id="problem" value={problem} onChange={(e) => setProblem(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="fix-desc">Perbaikan</Label>
          <Textarea id="fix-desc" value={fixDescription} onChange={(e) => setFixDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Pemilik perbaikan</Label>
            <Select value={fixOwnerId} onValueChange={(v) => v && setFixOwnerId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fix-deadline">Tenggat</Label>
            <Input id="fix-deadline" type="date" value={fixDeadline} onChange={(e) => setFixDeadline(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="requests">Permintaan untuk Owner</Label>
          <Textarea id="requests" value={requests} onChange={(e) => setRequests(e.target.value)} />
        </div>
        <Button onClick={submit} loading={saving} className="w-full">
          Simpan notulen
        </Button>
      </CardContent>
    </Card>
  );
}

function WeeklyRow({ m }: { m: WeeklyMinutesView }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm space-y-1.5">
      <p className="font-semibold">Minggu {dateLabel(m.weekStart)}</p>
      {m.scorecardNote && (
        <p>
          <span className="font-semibold">Scorecard:</span> {m.scorecardNote}
        </p>
      )}
      {m.problemAnalyzed && (
        <p>
          <span className="font-semibold">Masalah:</span> {m.problemAnalyzed}
        </p>
      )}
      {m.fixDescription && (
        <p>
          <span className="font-semibold">Perbaikan:</span> {m.fixDescription}
          {m.fixOwnerName ? ` (${m.fixOwnerName}` : ""}
          {m.fixDeadline ? `, tenggat ${dateLabel(m.fixDeadline)})` : m.fixOwnerName ? ")" : ""}
        </p>
      )}
      {m.requestsToOwner && (
        <p>
          <span className="font-semibold">Ke Owner:</span> {m.requestsToOwner}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Dicatat {m.postedByName ?? "—"}</p>
      <AckButton kind="weekly" id={m.id} ackNames={m.ackNames} />
    </div>
  );
}

export function NotulenClient({
  branch,
  huddle,
  weeklyMinutes,
  canPost,
  employees,
}: {
  branch: MinutesBranch;
  huddle: HuddleView | null;
  weeklyMinutes: WeeklyMinutesView[];
  canPost: boolean;
  employees: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      <HuddleSection branch={branch} huddle={huddle} canPost={canPost} />
      {canPost && <WeeklyForm branch={branch} employees={employees} />}
      <Card>
        <CardHeader>
          <CardTitle>Notulen mingguan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {weeklyMinutes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada notulen.</p>
          ) : (
            weeklyMinutes.map((m) => <WeeklyRow key={m.id} m={m} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
