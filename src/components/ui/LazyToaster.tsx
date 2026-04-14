"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper for the sonner Toaster. We want the Toaster bundle
 * (sonner + next-themes + five lucide icons) out of the first-load JS on
 * every route — it's never needed before hydration. `next/dynamic` with
 * `ssr: false` achieves that, but Next 16 forbids `ssr: false` inside
 * Server Components, so the dynamic() call has to live in this "use client"
 * file and the root layout just renders <LazyToaster />.
 */
const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false }
);

export function LazyToaster() {
  return <Toaster position="top-center" richColors />;
}
