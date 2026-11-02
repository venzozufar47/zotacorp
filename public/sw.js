/**
 * Service worker for the Zota Corp PWA.
 *
 * Deliberately has NO fetch/caching handler: every page in this app is
 * auth-gated and server-rendered, so caching responses risks serving
 * stale or cross-user content after a deploy. Installability no longer
 * requires offline support — this worker exists to receive Web Push
 * notifications (booking reminders, payslip alerts) once VAPID keys are
 * configured.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "Zota Corp", {
      body: data.body || "",
      icon: data.icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/", checkoutVerificationToken: data.checkoutVerificationToken, clickProof: data.clickProof },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  const verificationToken = event.notification.data?.checkoutVerificationToken;
  if (verificationToken) {
    event.waitUntil((async () => {
      // Record the proof before focusing the app. Keep its dialog/GPS state intact.
      let verified = false;
      try {
        const response = await fetch("/api/push/checkout-verify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: verificationToken }),
        });
        verified = response.ok;
      } catch { /* The app offers resend/recovery when proof cannot be recorded. */ }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const win of windows) {
        win.postMessage({ type: "checkout-push-verified", verified });
      }
      const existing = windows.find((win) => new URL(win.url).pathname === "/dashboard") || windows[0];
      if (existing) await existing.focus();
      else await self.clients.openWindow(url);
    })());
    return;
  }

  // Fire-and-forget beacon: the only server-observable proof that push
  // notifications are truly reaching this device (subscription rows
  // linger long after permission is revoked or the browser is gone —
  // a real tap is the strongest signal admin has). Runs in parallel
  // with the navigate/focus below; its own failure never blocks that.
  const recordClick = self.registration.pushManager
    .getSubscription()
    .then((sub) => {
      if (!sub) return;
      return fetch("/api/push/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, proof: event.notification.data?.clickProof }),
      });
    })
    .catch(() => {});

  const focusOrOpen = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windows) => {
      // Focus an existing app window if one is open, otherwise open a new one.
      for (const win of windows) {
        if ("focus" in win) {
          win.navigate(url);
          return win.focus();
        }
      }
      return self.clients.openWindow(url);
    });

  event.waitUntil(Promise.all([recordClick, focusOrOpen]));
});
