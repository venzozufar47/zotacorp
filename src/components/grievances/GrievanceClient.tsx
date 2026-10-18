"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  submitGrievance,
  confirmGrievance,
  decideGrievance,
  addTrustedContact,
  removeTrustedContact,
  type GrievanceView,
} from "@/lib/actions/grievances.actions";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Baru masuk",
  confirmed: "Dikonfirmasi",
  investigating: "Diproses",
  decided: "Selesai",
};

function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function InboxRow({ r, onChanged }: { r: GrievanceView; onChanged: () => void }) {
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await confirmGrievance(r.id);
      if (!res.ok) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!decision.trim()) {
      toast.error("Isi keputusannya dulu");
      return;
    }
    setBusy(true);
    try {
      const res = await decideGrievance({ id: r.id, decision });
      if (!res.ok) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        "rounded-xl border p-3 text-sm space-y-1.5 " +
        (r.isHarassmentOrViolence ? "border-destructive/50 bg-destructive/5" : "border-border bg-card")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Tingkat {r.tier}</span>
        <span className="text-xs text-muted-foreground">{STATUS_LABEL[r.status]}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {dateTimeLabel(r.createdAt)} · pelapor {r.isAnonymous ? "anonim" : r.reporterName ?? "—"}
        {r.reportedAboutName ? ` · tentang ${r.reportedAboutName}` : ""}
      </p>
      <p>{r.description}</p>
      {r.witnesses && (
        <p className="text-xs text-muted-foreground">Saksi: {r.witnesses}</p>
      )}
      {r.desiredOutcome && (
        <p className="text-xs text-muted-foreground">Diharapkan: {r.desiredOutcome}</p>
      )}
      {r.status === "decided" ? (
        <p className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
          <span className="font-semibold">Keputusan:</span> {r.decision}
        </p>
      ) : (
        <div className="space-y-2">
          {r.status === "submitted" && (
            <Button size="sm" variant="outline" className="w-full" loading={busy} onClick={confirm}>
              Konfirmasi diterima
            </Button>
          )}
          <Textarea placeholder="Tulis keputusan" value={decision} onChange={(e) => setDecision(e.target.value)} />
          <Button size="sm" className="w-full" loading={busy} onClick={decide}>
            Simpan keputusan
          </Button>
        </div>
      )}
    </div>
  );
}

function MyReportRow({ r }: { r: GrievanceView }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Tingkat {r.tier}</span>
        <span className="text-xs text-muted-foreground">{STATUS_LABEL[r.status]}</span>
      </div>
      <p className="text-xs text-muted-foreground">{dateTimeLabel(r.createdAt)}</p>
      <p>{r.description}</p>
      {r.decision && (
        <p className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
          <span className="font-semibold">Keputusan:</span> {r.decision}
        </p>
      )}
    </div>
  );
}

function TrustedContactsAdmin({
  contacts,
  employees,
}: {
  contacts: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await addTrustedContact(pick);
      if (!res.ok) toast.error(res.error);
      else {
        setPick("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await removeTrustedContact(id);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pihak tepercaya alternatif</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {contacts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Belum ada — laporan tingkat 4 jatuh ke Owner.
          </p>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-sm">
              {c.name}
              <Button size="xs" variant="ghost" loading={busy} onClick={() => remove(c.id)}>
                Hapus
              </Button>
            </div>
          ))
        )}
        <div className="flex gap-2">
          <Select value={pick} onValueChange={(v) => v && setPick(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tambah orang" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" loading={busy} onClick={add}>
            Tambah
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function GrievanceClient({
  myReports,
  inbox,
  employees,
  isAdmin,
  trustedContacts,
}: {
  myReports: GrievanceView[];
  inbox: GrievanceView[];
  employees: { id: string; name: string }[];
  isAdmin: boolean;
  trustedContacts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [reportedAbout, setReportedAbout] = useState("");
  const [isHarassment, setIsHarassment] = useState(false);
  const [description, setDescription] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!description.trim()) {
      toast.error("Ceritakan kejadiannya dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await submitGrievance({
        isAnonymous,
        reportedAboutUserId: reportedAbout || null,
        isHarassmentOrViolence: isHarassment,
        description,
        witnesses: witnesses || null,
        desiredOutcome: desiredOutcome || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Laporan terkirim");
      setReportedAbout("");
      setIsHarassment(false);
      setDescription("");
      setWitnesses("");
      setDesiredOutcome("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {inbox.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldQuestion size={16} /> Masuk untukmu ({inbox.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inbox.map((r) => (
              <InboxRow key={r.id} r={r} onChanged={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>
      )}

      {isAdmin && <TrustedContactsAdmin contacts={trustedContacts} employees={employees} />}

      <Card>
        <CardHeader>
          <CardTitle>Buat laporan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
            Kirim tanpa nama
          </label>
          <div>
            <Label>Pihak yang dilaporkan (opsional)</Label>
            <Select value={reportedAbout} onValueChange={(v) => setReportedAbout(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tidak menyebut nama" />
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isHarassment}
              onChange={(e) => setIsHarassment(e.target.checked)}
            />
            Dugaan pelecehan atau kekerasan
          </label>
          {isHarassment && (
            <p className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
              Langsung ke tingkat 4 (pihak tepercaya alternatif / Owner).
            </p>
          )}
          <div>
            <Label htmlFor="desc">Apa yang terjadi</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="witnesses">Saksi (opsional)</Label>
            <Input id="witnesses" value={witnesses} onChange={(e) => setWitnesses(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="outcome">Yang kamu harapkan (opsional)</Label>
            <Input id="outcome" value={desiredOutcome} onChange={(e) => setDesiredOutcome(e.target.value)} />
          </div>
          <Button onClick={submit} loading={saving} className="w-full">
            Kirim
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Laporanku</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {myReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada laporan.</p>
          ) : (
            myReports.map((r) => <MyReportRow key={r.id} r={r} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
