"use client";

import { useEffect } from "react";

/**
 * Registers the push-notification service worker (public/sw.js) once per
 * page load. `updateViaCache: "none"` makes the browser revalidate sw.js
 * on every check so a Vercel deploy rolls out worker updates immediately.
 * Renders nothing.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Registration failing (private mode, unsupported browser) must
        // never break the app — the site works fine without the worker.
      });
  }, []);

  return null;
}
