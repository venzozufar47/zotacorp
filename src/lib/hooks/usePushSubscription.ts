"use client";

import { useCallback, useEffect, useState } from "react";
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

export type PushSubscriptionState =
  | "loading"
  | "unsupported"
  | "ios-needs-install"
  | "denied"
  | "subscribed"
  | "unsubscribed";

/**
 * Shared browser-side push subscription logic — detection, enable,
 * disable. Used by both `EnablePushButton` (settings card) and
 * `AttendancePushGate` (check-in blocking screen) so the two never drift
 * out of sync on what counts as "ready".
 *
 * iOS only exposes Web Push to a PWA installed to the Home Screen, so
 * iOS-in-a-plain-browser-tab reports `ios-needs-install` instead of
 * `unsupported` — callers use this to show install guidance.
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushSubscriptionState>("loading");
  const [busy, setBusy] = useState(false);

  const detect = useCallback(async () => {
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
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
  }, []);

  useEffect(() => {
    detect().catch(() => setState("unsupported"));
  }, [detect]);

  const enable = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return { ok: false, error: "Izin notifikasi ditolak di pengaturan browser." };
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        return { ok: false, error: "Push belum dikonfigurasi. Hubungi admin." };
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
        return { ok: false, error: res.error };
      }
      setState("subscribed");
      return { ok: true };
    } catch {
      return { ok: false, error: "Gagal mengaktifkan notifikasi." };
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("unsubscribed");
      return { ok: true };
    } catch {
      return { ok: false, error: "Gagal mematikan notifikasi." };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable, recheck: detect };
}
