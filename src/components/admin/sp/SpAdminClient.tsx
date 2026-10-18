"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createCoachingNote,
  type SpLevel,
  type SpOverviewRow,
} from "@/lib/actions/cleaning-review.actions";
import { PLAIN_NOTE_LABEL, SP_LEVEL_LABEL } from "@/lib/coaching/constants";

const STATUS_LABEL: Record<string, string> = {
  menerima: "Menerima",
  menerima_keberatan: "Menerima dengan keberatan",
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function EntryRow({ r }: { r: SpOverviewRow }) {
  const isSanction = r.spLevel === "sp1" || r.spLevel === "sp2" || r.spLevel === "sp3";
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{r.userName}</span>
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold " +
            (isSanction ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")
          }
        >
          {isSanction && <ShieldAlert size={10} />}
          {r.spLevel ? SP_LEVEL_LABEL[r.spLevel] : PLAIN_NOTE_LABEL}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {dateLabel(r.createdAt)} · oleh {r.authorName ?? "—"}
        {r.validUntil ? ` · berlaku sampai ${dateLabel(r.validUntil)}` : ""}
        {r.acknowledgedAt ? ` · dibaca ${dateLabel(r.acknowledgedAt)}` : " · belum dibaca"}
      </p>
      <p>{r.body}</p>
      {r.sopReference && <p className="text-xs text-muted-foreground">Rujukan: {r.sopReference}</p>}
      {r.employeeAcceptance && (
        <p className="text-xs">
          <span className="font-semibold">{STATUS_LABEL[r.employeeAcceptance]}</span>
          {r.employeeResponse ? ` — ${r.employeeResponse}` : ""}
        </p>
      )}
    </div>
  );
}

export function SpAdminClient({
  active,
  recent,
  employees,
}: {
  active: SpOverviewRow[];
  recent: SpOverviewRow[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [spLevel, setSpLevel] = useState<SpLevel>("teguran");
  const [body, setBody] = useState("");
  const [sopReference, setSopReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!userId) {
      toast.error("Pilih karyawan dulu");
      return;
    }
    if (!body.trim()) {
      toast.error("Isi fakta/isi catatan dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await createCoachingNote({
        userId,
        body,
        context: "sp",
        spLevel,
        sopReference: sopReference || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tersimpan dan dikirim ke karyawan");
      setBody("");
      setSopReference("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Terbitkan teguran / SP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Karyawan</Label>
            <Select value={userId} onValueChange={(v) => v && setUserId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih karyawan" />
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
            <Label>Tingkat</Label>
            <Select value={spLevel} onValueChange={(v) => v && setSpLevel(v as SpLevel)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SP_LEVEL_LABEL) as SpLevel[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SP_LEVEL_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {spLevel !== "teguran" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Sanksi — berlaku 6 bulan sejak diterbitkan, dan menggugurkan kelayakan bonus selama
                aktif.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="sp-body">Fakta kejadian</Label>
            <Textarea id="sp-body" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sp-ref">Rujukan SOP (opsional)</Label>
            <Input
              id="sp-ref"
              placeholder="Mis. SOP bagian 6.8 / Perjanjian Kerja Pasal 9"
              value={sopReference}
              onChange={(e) => setSopReference(e.target.value)}
            />
          </div>
          <Button onClick={submit} loading={saving} className="w-full">
            Terbitkan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SP aktif saat ini ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada SP aktif.</p>
          ) : (
            active.map((r) => <EntryRow key={r.id} r={r} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat catatan pembinaan (1 tahun)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada catatan.</p>
          ) : (
            recent.map((r) => <EntryRow key={r.id} r={r} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
