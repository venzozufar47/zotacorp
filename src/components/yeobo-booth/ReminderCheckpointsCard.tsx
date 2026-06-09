"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveReminderCheckpoints } from "@/lib/actions/yeobo-booth-reminders.actions";
import type { YeoboBoothReminderCheckpoint } from "@/lib/yeobo-booth/types";

interface Row {
  id?: string;
  days_before: number;
  send_hour: number;
  enabled: boolean;
  label: string;
  message_template: string;
}

const PLACEHOLDER_HINT =
  "Kosongkan untuk pakai template default. Placeholder: {hari} {namaKlien} {tanggal} {jamMulai} {jamSelesai} {lokasi} {freelance} {sisaTagihan}";

function toRow(c: YeoboBoothReminderCheckpoint): Row {
  return {
    id: c.id,
    days_before: c.days_before,
    send_hour: c.send_hour,
    enabled: c.enabled,
    label: c.label ?? "",
    message_template: c.message_template ?? "",
  };
}

/**
 * Kartu pengaturan checkpoint reminder. Tiap baris = 1 checkpoint
 * (H-{days_before} dikirim jam {send_hour} WIB). Admin bisa tambah/hapus
 * baris, set jam, on/off, dan pesan custom. Simpan sekali (reconcile di
 * server).
 */
export function ReminderCheckpointsCard({
  initialCheckpoints,
}: {
  initialCheckpoints: YeoboBoothReminderCheckpoint[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialCheckpoints.map(toRow));
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [
      ...rs,
      { days_before: 1, send_hour: 11, enabled: true, label: "", message_template: "" },
    ]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function onSave() {
    const seen = new Set<number>();
    for (const r of rows) {
      if (!Number.isInteger(r.days_before) || r.days_before < 0) {
        toast.error("Offset hari harus angka bulat ≥ 0.");
        return;
      }
      if (seen.has(r.days_before)) {
        toast.error(`Offset H-${r.days_before} dobel — tiap offset hanya boleh sekali.`);
        return;
      }
      seen.add(r.days_before);
    }
    startTransition(async () => {
      const payload = rows.map((r) => ({
        id: r.id,
        days_before: r.days_before,
        send_hour: r.send_hour,
        enabled: r.enabled,
        label: r.label.trim() || null,
        message_template: r.message_template.trim() || null,
      }));
      const res = await saveReminderCheckpoints(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengaturan checkpoint disimpan.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0 bg-quaternary">
          <BellRing size={18} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg">Checkpoint reminder</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
            Tiap baris satu reminder: dikirim <strong>H-(offset)</strong> hari
            sebelum sesi, pada jam yang dipilih (WIB). Nonaktifkan tanpa hapus
            lewat centang.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Belum ada checkpoint. Tambahkan minimal satu agar reminder terkirim.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li
              key={r.id ?? `new-${i}`}
              className="rounded-xl border border-border bg-muted/20 p-3 space-y-3"
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none pb-2">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  <span className="text-xs font-medium">Aktif</span>
                </label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Kirim H-</Label>
                  <Input
                    type="number"
                    min={0}
                    value={r.days_before}
                    onChange={(e) =>
                      update(i, { days_before: Number(e.target.value) })
                    }
                    className="w-20 tabular-nums"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Jam kirim (WIB)</Label>
                  <select
                    value={r.send_hour}
                    onChange={(e) =>
                      update(i, { send_hour: Number(e.target.value) })
                    }
                    className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 flex-1 min-w-[140px]">
                  <Label className="text-xs">Label (opsional)</Label>
                  <Input
                    value={r.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="mis. Koordinasi awal"
                  />
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeRow(i)}
                  disabled={pending}
                  className="hover:text-destructive mb-1"
                  aria-label="Hapus checkpoint"
                >
                  <Trash2 size={14} />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Pesan custom (opsional)</Label>
                <textarea
                  value={r.message_template}
                  onChange={(e) =>
                    update(i, { message_template: e.target.value })
                  }
                  rows={3}
                  placeholder={PLACEHOLDER_HINT}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-y"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={addRow} disabled={pending}>
          <Plus size={14} className="mr-1.5" />
          Tambah checkpoint
        </Button>
        <Button
          onClick={onSave}
          disabled={pending}
          loading={pending}
          className="ml-auto"
        >
          Simpan
        </Button>
      </div>
    </section>
  );
}
