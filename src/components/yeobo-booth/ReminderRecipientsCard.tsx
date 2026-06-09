"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addReminderRecipient,
  removeReminderRecipient,
  toggleReminderRecipient,
} from "@/lib/actions/yeobo-booth-reminders.actions";
import type { YeoboBoothReminderRecipient } from "@/lib/yeobo-booth/types";

/**
 * Daftar nomor WA penerima reminder Yeobo Booth — admin bisa tambah,
 * hapus, dan aktif/nonaktifkan tiap nomor. Nomor disimpan E.164 tanpa
 * '+' (server menormalisasi apa pun yang diketik admin).
 */
export function ReminderRecipientsCard({
  initialRecipients,
}: {
  initialRecipients: YeoboBoothReminderRecipient[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function onAdd() {
    if (!phone.trim()) {
      toast.error("Isi nomor WhatsApp dulu.");
      return;
    }
    startTransition(async () => {
      const res = await addReminderRecipient({
        label: label.trim(),
        phone: phone.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Nomor ditambahkan.");
      setLabel("");
      setPhone("");
      router.refresh();
    });
  }

  function onDelete(r: YeoboBoothReminderRecipient) {
    if (!confirm(`Hapus penerima ${r.label || "+" + r.phone_e164}?`)) return;
    startTransition(async () => {
      const res = await removeReminderRecipient(r.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Nomor dihapus.");
      router.refresh();
    });
  }

  function onToggle(r: YeoboBoothReminderRecipient) {
    startTransition(async () => {
      const res = await toggleReminderRecipient(r.id, !r.enabled);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  const activeCount = initialRecipients.filter((r) => r.enabled).length;

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0 bg-quaternary">
          <MessageCircle size={18} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg">Nomor penerima</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
            Reminder dikirim ke semua nomor yang aktif di sini. Boleh nomor
            siapa saja (admin, operator lapangan, dll).
          </p>
        </div>
      </div>

      {initialRecipients.length === 0 ? (
        <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
          Belum ada nomor penerima — reminder tidak akan terkirim sampai
          minimal 1 nomor ditambahkan.
        </p>
      ) : (
        <>
          {activeCount === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 font-medium">
              Semua nomor nonaktif — reminder tidak akan terkirim.
            </p>
          )}
          <ul className="divide-y divide-border rounded-xl border border-border bg-muted/20 overflow-hidden">
            {initialRecipients.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={() => onToggle(r)}
                    disabled={pending}
                    className="size-4 accent-primary"
                    aria-label="Aktif"
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.label || (
                      <span className="text-muted-foreground italic">
                        Tanpa label
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    +{r.phone_e164}
                    {!r.enabled && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        nonaktif
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(r)}
                  disabled={pending}
                  className="hover:text-destructive"
                  aria-label="Hapus nomor"
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="grid sm:grid-cols-[1fr_1.5fr_auto] gap-2 pt-1">
        <div className="space-y-1.5">
          <Label htmlFor="rcp-label" className="text-xs">
            Label (opsional)
          </Label>
          <Input
            id="rcp-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="mis. Pak Budi"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rcp-phone" className="text-xs">
            Nomor WhatsApp
          </Label>
          <Input
            id="rcp-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0812xxxxxxx"
            inputMode="tel"
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={onAdd}
            disabled={pending}
            loading={pending}
            className="w-full sm:w-auto"
          >
            <Plus size={14} className="mr-1.5" />
            Tambah
          </Button>
        </div>
      </div>
    </section>
  );
}
