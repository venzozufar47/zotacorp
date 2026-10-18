"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCoachingNote } from "@/lib/actions/cleaning-review.actions";

/**
 * Kepala tim menulis catatan pembinaan untuk anggotanya — fakta kejadian,
 * BUKAN sanksi (SOP 6.8, Dokumen 3 §3: "Kepala Produksi dan Koordinator
 * Toko mengumpulkan fakta... tetapi tidak menjatuhkan sanksi"). Sengaja
 * dipisah dari `TeamTasksView` (yang eksplisit read-only untuk Tugas) —
 * ini kemampuan berbeda, bukan pengecualian atas aturan read-only itu.
 *
 * Pilihan kategori dibatasi ke "Catatan biasa" / "Teguran serius"
 * di UI ini — SP1/SP2/SP3 tidak ditawarkan sama sekali karena memang
 * ditolak server (Owner-only), bukan cuma disembunyikan.
 */
export function WriteCoachingNoteCard({ members }: { members: { memberId: string; name: string }[] }) {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [isTeguran, setIsTeguran] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  if (members.length === 0) return null;

  async function submit() {
    if (!memberId) {
      toast.error("Pilih anggota dulu");
      return;
    }
    if (!body.trim()) {
      toast.error("Isi catatan dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await createCoachingNote({
        userId: memberId,
        body,
        context: isTeguran ? "sp" : "lain",
        spLevel: isTeguran ? "teguran" : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Catatan terkirim");
      setBody("");
      setIsTeguran(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquarePlus size={16} /> Tulis catatan pembinaan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Anggota</Label>
          <Select value={memberId} onValueChange={(v) => v && setMemberId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih anggota" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.memberId} value={m.memberId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Kategori</Label>
          <Select
            value={isTeguran ? "teguran" : "catatan"}
            onValueChange={(v) => setIsTeguran(v === "teguran")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="catatan">Catatan biasa</SelectItem>
              <SelectItem value="teguran">Teguran serius</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="note-body">Isi</Label>
          <Textarea
            id="note-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Sebut tugasnya dan yang diharapkan, bukan karakternya (SOP 6.8)"
          />
        </div>
        <Button onClick={submit} loading={saving} className="w-full">
          Kirim
        </Button>
      </CardContent>
    </Card>
  );
}
