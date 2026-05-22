"use client";

import { useRouter } from "next/navigation";

/**
 * Tiny module-level emitter agar `RouteProgressBar` ikut fire saat
 * navigasi programmatic (router.push/replace/refresh) — bukan cuma saat
 * `<a>` click. Tanpa ini, user yang klik tombol/card yang trigger
 * `router.replace(...)` tidak lihat top bar.
 *
 * Module-state aman: file ini "use client", state Set hidup di
 * browser session (per tab) — bukan SSR shared state.
 */
type Listener = () => void;
const startListeners = new Set<Listener>();

export function emitRouteProgressStart() {
  for (const fn of startListeners) fn();
}

export function onRouteProgressStart(fn: Listener) {
  startListeners.add(fn);
  return () => {
    startListeners.delete(fn);
  };
}

/**
 * Drop-in replacement untuk `useRouter()` yang memancarkan event
 * progress sebelum tiap nav. Pakai di komponen yang trigger nav
 * programmatic atas klik user (mis. setParam URL filter, pagination).
 *
 * `refresh()` juga di-instrument karena terasa seperti "page reload"
 * dari sisi user — feedback membantu. React 19 compiler handle
 * memoization secara otomatis; tidak perlu useCallback manual.
 */
export function useProgressRouter() {
  const router = useRouter();
  return {
    push: (href: string, options?: Parameters<typeof router.push>[1]) => {
      emitRouteProgressStart();
      router.push(href, options);
    },
    replace: (
      href: string,
      options?: Parameters<typeof router.replace>[1]
    ) => {
      emitRouteProgressStart();
      router.replace(href, options);
    },
    refresh: () => {
      emitRouteProgressStart();
      router.refresh();
    },
    back: () => {
      emitRouteProgressStart();
      router.back();
    },
    forward: () => {
      emitRouteProgressStart();
      router.forward();
    },
    prefetch: router.prefetch.bind(router),
  };
}
