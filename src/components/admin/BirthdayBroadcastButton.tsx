"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cake, Megaphone } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { broadcastBirthdayReminder } from "@/lib/actions/employee-monitoring.actions";

interface Props {
  todayBirthdays: Array<{ id: string; name: string }>;
  /**
   * Preview body pesan yang akan dikirim, sudah di-render dari
   * template `celebration_birthday_broadcast` (admin bisa edit copy
   * di /admin/settings → Whatsapp Templates).
   */
  previewMessage: string;
}

/**
 * Tombol admin untuk broadcast WA reminder ke seluruh karyawan kalau
 * ada yang ulang tahun hari ini, mengajak ucapin via Zota app. Hanya
 * aktif kalau memang ada celebrant hari ini supaya tidak kirim
 * pesan kosong.
 */
export function BirthdayBroadcastButton({
  todayBirthdays,
  previewMessage,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasBirthday = todayBirthdays.length > 0;

  function handleSend() {
    startTransition(async () => {
      const res = await broadcastBirthdayReminder();
      if (!res.ok) {
        toast.error(res.error ?? "Broadcast gagal");
        return;
      }
      const skippedNote =
        (res.skippedAlreadyGreetedCount ?? 0) > 0
          ? ` (${res.skippedAlreadyGreetedCount} di-skip karena sudah ngucapin di dashboard)`
          : "";
      toast.success(
        `Broadcast terkirim — ${res.sentCount}/${res.targetCount} sukses${
          (res.failedCount ?? 0) > 0 ? `, ${res.failedCount} gagal` : ""
        }${skippedNote}.`
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div
        className={
          "rounded-2xl border-2 p-4 flex items-start gap-3 " +
          (hasBirthday
            ? "border-pink-300 bg-pink-50/60"
            : "border-border bg-muted/30")
        }
      >
        <span
          className={
            "shrink-0 size-10 rounded-full border-2 border-foreground flex items-center justify-center " +
            (hasBirthday ? "bg-pink-200" : "bg-muted")
          }
        >
          <Cake size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-foreground">
            Broadcast reminder ulang tahun
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasBirthday
              ? `Hari ini: ${todayBirthdays.map((c) => c.name).join(", ")} ulang tahun. Klik untuk kirim WA ke seluruh karyawan ngajak ngucapin via Zota App.`
              : "Tidak ada karyawan yang ulang tahun hari ini. Tombol akan aktif otomatis pas ada yang ulang tahun."}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!hasBirthday || pending}
          className="gap-1.5 shrink-0"
        >
          <Megaphone size={14} />
          Broadcast
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Broadcast WA reminder ulang tahun?</DialogTitle>
            <DialogDescription>
              Pesan ini akan dikirim ke <strong>seluruh</strong> karyawan
              yang punya nomor WhatsApp valid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <p className="font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
              Yang ulang tahun hari ini
            </p>
            <ul className="space-y-0.5">
              {todayBirthdays.map((c) => (
                <li key={c.id} className="text-foreground">
                  • {c.name}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground mt-2">
              Edit copy di{" "}
              <a
                href="/admin/settings"
                className="underline underline-offset-2 hover:text-foreground"
              >
                /admin/settings → Whatsapp Templates
              </a>
              {" "}(template <code>celebration_birthday_broadcast</code>).
            </p>
            <div className="rounded-lg bg-muted/40 p-3 mt-3 text-foreground whitespace-pre-wrap text-[11px] leading-relaxed">
              {previewMessage}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="button" onClick={handleSend} disabled={pending}>
              {pending ? "Mengirim…" : "Ya, kirim broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
