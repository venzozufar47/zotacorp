"use client";

import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { DoorOpen, FileText, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveKind } from "@/lib/actions/leave-requests.actions";
import { cn } from "@/lib/utils";

export const KIND_META: Record<
  LeaveKind,
  { short: string; icon: ComponentType<{ className?: string }>; reasonHint: string }
> = {
  sakit: { short: "Sakit", icon: Thermometer, reasonHint: "Mis. demam, sakit perut" },
  izin_keluar_toko: {
    short: "Keluar toko",
    icon: DoorOpen,
    reasonHint: "Mis. ke bank, antar barang",
  },
  lainnya: { short: "Lainnya", icon: FileText, reasonHint: "Jelaskan keperluannya" },
};

const RETURN_CHIPS = ["30 menit", "1 jam", "2 jam", "Besok"];

export type LeaveFormValues = {
  kind: LeaveKind;
  reason: string;
  plannedReturn: string | null;
};

/**
 * Form izin yang dipakai DUA jalur: karyawan mengajukan, dan atasan/Owner
 * mencatatkan atas nama anggota. `onSubmit` mengembalikan true bila berhasil
 * (form dikosongkan). `slot` = isian tambahan di atas form (pemilih anggota).
 */
export function LeaveForm({
  submitLabel,
  note,
  slot,
  canSubmit = true,
  onSubmit,
}: {
  submitLabel: React.ReactNode;
  note?: React.ReactNode;
  slot?: React.ReactNode;
  canSubmit?: boolean;
  onSubmit: (v: LeaveFormValues) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<LeaveKind>("sakit");
  const [reason, setReason] = useState("");
  const [plannedReturn, setPlannedReturn] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) {
      toast.error("Isi alasan dulu");
      return;
    }
    setSaving(true);
    try {
      const ok = await onSubmit({ kind, reason, plannedReturn: plannedReturn || null });
      if (ok) {
        setReason("");
        setPlannedReturn("");
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

      <div className="space-y-2">
        <Button onClick={handleSubmit} loading={saving} disabled={!canSubmit} size="lg" className="w-full">
          {submitLabel}
        </Button>
        {note && <p className="text-center text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}
