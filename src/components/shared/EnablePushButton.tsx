"use client";

import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePushSubscription } from "@/lib/hooks/usePushSubscription";

interface Props {
  /** Card heading. Defaults to the employee "slip gaji" copy. */
  title?: string;
  /** Shown once notifications are active on this device. */
  activeDescription?: string;
  /** Shown before the user has enabled notifications. */
  promptDescription?: string;
  /** Toast on successful subscribe. */
  enabledToast?: string;
}

/**
 * Lets a user turn on push notifications for this browser/device. Generic —
 * the underlying subscription isn't tied to any one topic (payslip alerts,
 * admin attendance alerts, future event types all reuse the same
 * push_subscriptions row), only the card copy changes per call site.
 *
 * iOS only exposes Web Push to a PWA installed to the Home Screen, so when
 * we detect iOS-in-browser we show install guidance instead of a button
 * that can't work. Renders nothing on platforms with no push support at all.
 */
export function EnablePushButton({
  title = "Notifikasi slip gaji",
  activeDescription = "Aktif di perangkat ini. Kamu akan diberi tahu saat slip gaji terbit.",
  promptDescription = "Dapatkan pemberitahuan otomatis saat slip gaji kamu terbit.",
  enabledToast = "Notifikasi aktif! Kamu akan diberi tahu saat slip gaji terbit.",
}: Props = {}) {
  const { state, busy, enable, disable } = usePushSubscription();

  async function onEnable() {
    const res = await enable();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(enabledToast);
  }

  async function onDisable() {
    const res = await disable();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Notifikasi dimatikan.");
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-accent">
            <Bell className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-display text-sm font-bold text-foreground">
              {title}
            </p>
            <p className="text-xs text-muted-foreground">
              {state === "subscribed"
                ? activeDescription
                : state === "denied"
                  ? "Izin notifikasi diblokir. Aktifkan lewat pengaturan browser/HP."
                  : state === "ios-needs-install"
                    ? 'Di iPhone: ketuk tombol Share lalu "Add to Home Screen", buka app dari ikonnya, baru aktifkan notifikasi.'
                    : promptDescription}
            </p>
          </div>
        </div>

        {state === "subscribed" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onDisable}
            disabled={busy}
            className="shrink-0"
          >
            <BellOff /> Matikan
          </Button>
        ) : state === "unsubscribed" ? (
          <Button
            size="sm"
            onClick={onEnable}
            disabled={busy}
            className="shrink-0"
          >
            <Bell /> Aktifkan
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
