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
import {
  submitComplaint,
  closeComplaint,
  type ComplaintBranch,
  type ComplaintKind,
  type ComplaintSource,
  type ComplaintView,
} from "@/lib/actions/customer-complaints.actions";

const KIND_LABEL: Record<ComplaintKind, string> = {
  produk: "Komplain produk",
  layanan: "Komplain layanan",
  alergi_sakit: "Alergi / sakit",
  pelanggan_mengganggu: "Pelanggan mengganggu",
  barang_tertinggal: "Barang tertinggal",
  lainnya: "Lainnya",
};

const SOURCE_LABEL: Record<ComplaintSource, string> = {
  toko: "Langsung di toko",
  sosmed: "Sosial media",
  google_maps: "Google Maps",
  pesan: "Pesan",
};

function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ComplaintRow({ c, onClosed }: { c: ComplaintView; onClosed: () => void }) {
  const [actionTaken, setActionTaken] = useState(c.actionTaken ?? "");
  const [compensation, setCompensation] = useState(c.compensation ?? "");
  const [busy, setBusy] = useState(false);
  const isRed = c.kind === "alergi_sakit";

  async function submitClose() {
    if (!actionTaken.trim()) {
      toast.error("Isi tindakan yang diambil");
      return;
    }
    setBusy(true);
    try {
      const res = await closeComplaint({ id: c.id, actionTaken, compensation: compensation || null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Ditutup");
      onClosed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        "rounded-xl border p-3 text-sm space-y-2 " +
        (isRed ? "border-destructive/50 bg-destructive/5" : "border-border bg-card")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 font-semibold">
          {isRed && <AlertTriangle size={13} className="text-destructive" />}
          {KIND_LABEL[c.kind]}
        </span>
        <span className="text-xs text-muted-foreground">{dateTimeLabel(c.occurredAt)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {SOURCE_LABEL[c.source]} · {c.branch} · lapor {c.reportedByName ?? "—"}
      </p>
      <p>{c.description}</p>
      {c.productOrTxRef && <p className="text-xs text-muted-foreground">Ref: {c.productOrTxRef}</p>}

      {c.status === "closed" ? (
        <div className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs space-y-0.5">
          <p>
            <span className="font-semibold">Tindakan:</span> {c.actionTaken}
          </p>
          {c.compensation && (
            <p>
              <span className="font-semibold">Kompensasi:</span> {c.compensation}
            </p>
          )}
          <p className="text-muted-foreground">Ditutup {c.closedByName ?? "—"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Tindakan yang diambil"
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
          />
          <Input
            placeholder="Kompensasi (opsional)"
            value={compensation}
            onChange={(e) => setCompensation(e.target.value)}
          />
          <Button size="sm" className="w-full" loading={busy} onClick={submitClose}>
            Tutup keluhan
          </Button>
        </div>
      )}
    </div>
  );
}

export function ComplaintClient({
  defaultBranch,
  open,
  closed,
}: {
  defaultBranch: ComplaintBranch;
  open: ComplaintView[];
  closed: ComplaintView[];
}) {
  const router = useRouter();
  const [branch, setBranch] = useState<ComplaintBranch>(defaultBranch);
  const [kind, setKind] = useState<ComplaintKind>("produk");
  const [source, setSource] = useState<ComplaintSource>("toko");
  const [description, setDescription] = useState("");
  const [productOrTxRef, setProductOrTxRef] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!description.trim()) {
      toast.error("Isi kronologi dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await submitComplaint({
        branch,
        kind,
        source,
        description,
        productOrTxRef: productOrTxRef || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        kind === "alergi_sakit" ? "Tercatat — Owner sudah diberi tahu" : "Keluhan tercatat"
      );
      setDescription("");
      setProductOrTxRef("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Catat keluhan / insiden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Cabang</Label>
              <Select value={branch} onValueChange={(v) => v && setBranch(v as ComplaintBranch)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pare">Pare</SelectItem>
                  <SelectItem value="Semarang">Semarang</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Jenis</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as ComplaintKind)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as ComplaintKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {kind === "alergi_sakit" && (
            <p className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
              Kode merah — Owner akan diberi tahu langsung saat ini juga.
            </p>
          )}
          <div>
            <Label>Sumber</Label>
            <Select value={source} onValueChange={(v) => v && setSource(v as ComplaintSource)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as ComplaintSource[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="desc">Kronologi</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ref">Produk / no. transaksi (opsional)</Label>
            <Input id="ref" value={productOrTxRef} onChange={(e) => setProductOrTxRef(e.target.value)} />
          </div>
          <Button onClick={submit} loading={saving} className="w-full">
            Simpan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Belum selesai ({open.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada yang terbuka.</p>
          ) : (
            open.map((c) => <ComplaintRow key={c.id} c={c} onClosed={() => router.refresh()} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sudah selesai</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {closed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada.</p>
          ) : (
            closed.slice(0, 15).map((c) => <ComplaintRow key={c.id} c={c} onClosed={() => router.refresh()} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
