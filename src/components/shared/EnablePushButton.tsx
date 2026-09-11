"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/actions/push.actions";

/** VAPID public key is base64url; PushManager needs a Uint8Array.
 *  Built on an explicit ArrayBuffer so the type satisfies BufferSource. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | "loading"
  | "unsupported"
  | "ios-needs-install"
  | "denied"
  | "subscribed"
  | "unsubscribed";

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
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ua = navigator.userAgent;
      const isIOS = /iphone|ipad|ipod/i.test(ua);
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iPhone in Safari: push exists only after "Add to Home Screen".
        setState(isIOS && !isStandalone ? "ios-needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "unsubscribed");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        toast.error("Izin notifikasi ditolak di pengaturan browser.");
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        toast.error("Push belum dikonfigurasi. Hubungi admin.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = JSON.parse(JSON.stringify(sub)) as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const res = await subscribeToPush(
        { endpoint: json.endpoint, keys: json.keys },
        navigator.userAgent
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setState("subscribed");
      toast.success(enabledToast);
    } catch {
      toast.error("Gagal mengaktifkan notifikasi.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("unsubscribed");
      toast.success("Notifikasi dimatikan.");
    } catch {
      toast.error("Gagal mematikan notifikasi.");
    } finally {
      setBusy(false);
    }
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
            onClick={disable}
            disabled={busy}
            className="shrink-0"
          >
            <BellOff /> Matikan
          </Button>
        ) : state === "unsubscribed" ? (
          <Button
            size="sm"
            onClick={enable}
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
