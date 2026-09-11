"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestAdminAttendancePush } from "@/lib/actions/push.actions";

/**
 * Fires a dummy check-in through the real admin-notify path (same as a
 * real employee sign-in) so an admin can verify their push setup without
 * waiting for someone to actually check in.
 */
export function TestAttendancePushButton() {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await sendTestAdminAttendancePush();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Notifikasi test dikirim. Cek perangkat yang sudah aktif.");
    } catch {
      toast.error("Gagal mengirim notifikasi test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={busy}
      loading={busy}
      className="shrink-0"
    >
      <Send /> Kirim test (absen masuk dummy)
    </Button>
  );
}
