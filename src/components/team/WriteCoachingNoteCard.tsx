"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonCombobox } from "@/components/ui/person-combobox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <MessageSquarePlus size={16} aria-hidden /> Tulis catatan baru
        <ChevronDown
          size={16}
          className="ml-auto text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <div>
          <Label>Anggota</Label>
          <PersonCombobox
            value={memberId}
            onValueChange={setMemberId}
            options={members.map((m) => ({ id: m.memberId, name: m.name }))}
            placeholder="Ketik nama anggota"
            aria-label="Anggota"
          />
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
      </div>
    </details>
  );
}
