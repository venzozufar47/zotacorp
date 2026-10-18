"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRp } from "@/lib/cashflow/format";
import {
  submitApprovalRequest,
  decideApprovalRequest,
  type ApprovalCategory,
  type ApprovalRequestView,
  type PatternAlert,
} from "@/lib/actions/approval-requests.actions";
import { APPROVAL_CATEGORY_LABEL } from "@/lib/approvals/constants";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Menunggu", className: "text-amber-600" },
  approved: { label: "Disetujui", className: "text-success" },
  rejected: { label: "Ditolak", className: "text-destructive" },
  changed: { label: "Diubah Owner", className: "text-primary" },
  auto_approved: { label: "Berjalan otomatis", className: "text-success" },
};

function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RequestRow({ r, isAdmin, onDecided }: { r: ApprovalRequestView; isAdmin: boolean; onDecided: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | "changed" | null>(null);
  const status = STATUS_LABEL[r.status];

  async function decide(decision: "approved" | "rejected" | "changed") {
    setBusy(decision);
    try {
      const res = await decideApprovalRequest({ id: r.id, decision, note: note || null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tersimpan");
      onDecided();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{APPROVAL_CATEGORY_LABEL[r.category]}</span>
        <span className={`text-xs font-semibold ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {dateTimeLabel(r.createdAt)} · {r.requestedByName ?? "—"}
        {r.status === "pending" ? ` · ${r.ageBusinessDays} hari kerja` : ""}
      </p>
      <p>
        <span className="font-semibold">Usul:</span> {r.proposal}
      </p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Alasan:</span> {r.reason}
      </p>
      {r.alternative && (
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">Alternatif:</span> {r.alternative}
        </p>
      )}
      {r.nominal != null && (
        <p>
          <span className="font-semibold">Nominal:</span> {formatRp(r.nominal)}
        </p>
      )}
      {r.status !== "pending" && r.ownerNote && (
        <p className="text-xs text-muted-foreground">Catatan: {r.ownerNote}</p>
      )}

      {isAdmin && r.status === "pending" && (
        <div className="space-y-2 pt-1">
          <Input placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" loading={busy === "approved"} onClick={() => decide("approved")}>
              Ya
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              loading={busy === "rejected"}
              onClick={() => decide("rejected")}
            >
              Tidak
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              loading={busy === "changed"}
              onClick={() => decide("changed")}
            >
              Ubah
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApprovalClient({
  isAdmin,
  requests,
  patternAlerts,
}: {
  isAdmin: boolean;
  requests: ApprovalRequestView[];
  patternAlerts: PatternAlert[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState<ApprovalCategory>("lainnya");
  const [proposal, setProposal] = useState("");
  const [reason, setReason] = useState("");
  const [alternative, setAlternative] = useState("");
  const [nominal, setNominal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [safetyImpact, setSafetyImpact] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!proposal.trim() || !reason.trim()) {
      toast.error("Isi usulan dan alasan dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await submitApprovalRequest({
        category,
        proposal,
        reason,
        alternative: alternative || null,
        nominal: nominal ? Number(nominal.replace(/\D/g, "")) : null,
        hasSafetyOrSanctionImpact: safetyImpact,
        deadlineAt: deadline ? new Date(deadline).toISOString() : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Terkirim ke Owner");
      setProposal("");
      setReason("");
      setAlternative("");
      setNominal("");
      setDeadline("");
      setSafetyImpact(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-4">
      {isAdmin && patternAlerts.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-warning/60 bg-warning/10 px-3 py-2.5 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">Batas wewenang mungkin perlu ditinjau</p>
            <p className="text-xs text-muted-foreground">
              {patternAlerts
                .map((a) => `${APPROVAL_CATEGORY_LABEL[a.category]} (${a.count}x/30 hari)`)
                .join(", ")}
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ajukan persetujuan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Hal</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v as ApprovalCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(APPROVAL_CATEGORY_LABEL) as ApprovalCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {APPROVAL_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="proposal">Saya usul (A)</Label>
            <Textarea id="proposal" value={proposal} onChange={(e) => setProposal(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="reason">Karena</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="alternative">Alternatifnya (B, opsional)</Label>
            <Input id="alternative" value={alternative} onChange={(e) => setAlternative(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="nominal">Nominal (opsional)</Label>
              <Input id="nominal" inputMode="numeric" value={nominal} onChange={(e) => setNominal(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="deadline">Perlu jawaban sebelum</Label>
              <Input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={safetyImpact}
              onChange={(e) => setSafetyImpact(e.target.checked)}
            />
            Ini menyangkut sanksi atau keselamatan (tidak bisa berjalan otomatis bila tidak dijawab)
          </label>
          <Button onClick={submit} loading={saving} className="w-full">
            Kirim ke Owner
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {isAdmin ? `Daftar tertahan (${pending.length})` : `Menunggu jawaban (${pending.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada yang tertahan.</p>
          ) : (
            pending.map((r) => (
              <RequestRow key={r.id} r={r} isAdmin={isAdmin} onDecided={() => router.refresh()} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {decided.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
          ) : (
            decided.slice(0, 20).map((r) => (
              <RequestRow key={r.id} r={r} isAdmin={isAdmin} onDecided={() => router.refresh()} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
