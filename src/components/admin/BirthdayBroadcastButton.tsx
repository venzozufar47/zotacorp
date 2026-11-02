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
   * di /admin/settings → Template notifikasi).
   */
  previewMessage: string;
}

/**
 * Tombol admin untuk broadcast push notification ke seluruh karyawan
 * kalau ada yang ulang tahun hari ini, mengajak ucapin via Zota app.
 * Hanya aktif kalau memang ada celebrant hari ini supaya tidak kirim
 * notifikasi kosong.
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
          "rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center gap-4 " +
          (hasBirthday
            ? "border-primary/25 bg-primary/5"
            : "border-border bg-muted/30")
        }
      >
        <span
          className={
            "shrink-0 size-10 rounded-xl flex items-center justify-center " +
            (hasBirthday ? "bg-primary/10 text-primary" : "bg-muted")
          }
        >
          <Cake size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-foreground">
            Pengingat ulang tahun
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground mt-1">
            {hasBirthday
              ? `Hari ini: ${todayBirthdays.map((c) => c.name).join(", ")} ulang tahun. Klik untuk kirim push ke seluruh karyawan ngajak ngucapin via Zota App.`
              : "Tidak ada ulang tahun hari ini. Broadcast tersedia saat ada karyawan yang berulang tahun."}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!hasBirthday || pending}
          className="min-h-11 gap-2 shrink-0 max-sm:w-full"
        >
          <Megaphone size={14} />
          Broadcast
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Broadcast reminder ulang tahun?</DialogTitle>
            <DialogDescription>
              Notifikasi push ini akan dikirim ke <strong>seluruh</strong>{" "}
              karyawan aktif.
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
                /admin/settings → Template notifikasi
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
              disabled={pending} loading={pending}
            >
              Batal
            </Button>
            <Button type="button" onClick={handleSend} disabled={pending} loading={pending}>
              {pending ? "Mengirim…" : "Ya, kirim broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
