"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Bell, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addReminderRecipient,
  removeReminderRecipient,
  toggleReminderRecipient,
  connectReminderRecipientToAccount,
  type RecipientCandidate,
} from "@/lib/actions/yeobo-booth-reminders.actions";
import type { YeoboBoothReminderRecipient } from "@/lib/yeobo-booth/types";

/**
 * Daftar akun penerima reminder Yeobo Booth (push notification) — admin
 * bisa tambah, hapus, dan aktif/nonaktifkan tiap akun. Baris legacy
 * (dari sebelum migrasi ke push, phone-only) tampil dengan penghubung
 * akun supaya bisa disambungkan tanpa kehilangan riwayat.
 */
export function ReminderRecipientsCard({
  initialRecipients,
  candidates,
}: {
  initialRecipients: YeoboBoothReminderRecipient[];
  candidates: RecipientCandidate[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [userId, setUserId] = useState("");
  const [pending, startTransition] = useTransition();

  const takenIds = new Set(
    initialRecipients.map((r) => r.user_id).filter((x): x is string => Boolean(x))
  );
  const available = candidates.filter((c) => !takenIds.has(c.id));

  function onAdd() {
    if (!userId) {
      toast.error("Pilih karyawan/admin dulu.");
      return;
    }
    startTransition(async () => {
      const res = await addReminderRecipient({ userId, label: label.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Penerima ditambahkan.");
      setLabel("");
      setUserId("");
      router.refresh();
    });
  }

  function onDelete(r: YeoboBoothReminderRecipient) {
    if (!confirm(`Hapus penerima ${r.label || "ini"}?`)) return;
    startTransition(async () => {
      const res = await removeReminderRecipient(r.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Penerima dihapus.");
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

  function onConnect(r: YeoboBoothReminderRecipient, connectUserId: string) {
    if (!connectUserId) return;
    startTransition(async () => {
      const res = await connectReminderRecipientToAccount(r.id, connectUserId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tersambung ke akun.");
      router.refresh();
    });
  }

  const activeCount = initialRecipients.filter((r) => r.enabled).length;
  const legacyCount = initialRecipients.filter((r) => !r.user_id).length;

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0 bg-quaternary">
          <Bell size={18} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg">Penerima reminder</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
            Reminder dikirim sebagai push notification ke semua akun aktif di
            sini. Akun boleh admin, operator lapangan, siapa saja yang punya
            login — mereka perlu aktifkan notifikasi sendiri dari halaman
            pengaturan masing-masing.
          </p>
        </div>
      </div>

      {initialRecipients.length === 0 ? (
        <p className="text-sm text-destructive bg-destructive/10 border-2 border-destructive rounded-xl px-3 py-2 font-medium">
          Belum ada penerima — reminder tidak akan terkirim sampai minimal 1
          akun ditambahkan.
        </p>
      ) : (
        <>
          {activeCount === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 font-medium">
              Semua penerima nonaktif — reminder tidak akan terkirim.
            </p>
          )}
          {legacyCount > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 font-medium">
              {legacyCount} penerima lama (nomor WA, dari sebelum push) belum
              terhubung akun — sambungkan di bawah supaya tetap dapat
              reminder.
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
                  <div className="text-xs text-muted-foreground">
                    {r.user_id ? (
                      "Terhubung akun"
                    ) : (
                      <span className="text-amber-700">
                        {r.phone_e164 ? `+${r.phone_e164} · ` : ""}belum
                        terhubung akun
                      </span>
                    )}
                    {!r.enabled && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        nonaktif
                      </span>
                    )}
                  </div>
                  {!r.user_id && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <select
                        className="text-xs rounded-lg border border-border bg-background px-2 py-1 flex-1 min-w-0"
                        defaultValue=""
                        disabled={pending}
                        onChange={(e) => onConnect(r, e.target.value)}
                      >
                        <option value="" disabled>
                          Sambungkan ke akun…
                        </option>
                        {available.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fullName} {c.businessUnit ? `· ${c.businessUnit}` : ""}
                          </option>
                        ))}
                      </select>
                      <LinkIcon size={13} className="shrink-0 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(r)}
                  disabled={pending}
                  className="hover:text-destructive"
                  aria-label="Hapus penerima"
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
          <Label htmlFor="rcp-user" className="text-xs">
            Karyawan / admin
          </Label>
          <select
            id="rcp-user"
            className="w-full h-10 rounded-xl border-2 border-border bg-background px-3 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">— Pilih akun —</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} {c.businessUnit ? `· ${c.businessUnit}` : ""}
              </option>
            ))}
          </select>
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
