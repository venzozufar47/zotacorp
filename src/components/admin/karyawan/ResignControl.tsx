"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setUserResignStatus } from "@/lib/actions/profile-status.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Tandai keluar (nonaktifkan) atau aktifkan kembali, dengan konfirmasi. */
export function ResignControl({
  userId,
  name,
  isActive,
  disabled,
}: {
  userId: string;
  name: string;
  isActive: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const res = await setUserResignStatus(userId, isActive);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isActive ? `${name} ditandai keluar` : `${name} aktif kembali`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={isActive ? "destructive" : "outline"}
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {isActive ? "Tandai keluar" : "Aktifkan kembali"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{isActive ? `Tandai ${name} keluar?` : `Aktifkan ${name} kembali?`}</DialogTitle>
            <DialogDescription>
              {isActive
                ? "Login, notifikasi, dan slip gaji bulanan berhenti hari ini. PIN POS dan keanggotaan tim dicabut, lalu checklist keluar dibuat. Riwayat tetap tersimpan, dan Anda bisa mengaktifkannya lagi."
                : "Login, notifikasi, dan slip gaji bulanan jalan lagi. Akses yang sudah dicabut (PIN POS, tim) perlu dipasang ulang."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button variant={isActive ? "destructive" : "default"} onClick={confirm} disabled={pending}>
              {pending ? "Menyimpan…" : isActive ? "Tandai keluar" : "Aktifkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
