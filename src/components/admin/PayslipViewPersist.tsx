"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const KEY = "zota:admin:payslips:lastView";

/**
 * Remember the admin's last-viewed period + tab on /admin/payslips/variables
 * so coming back lands them on the same place. Client-side only via
 * localStorage — per browser profile (close enough to per-user for an
 * internal admin tool).
 *
 * Behavior:
 *   - URL has no month/year/view  → restore from storage if available
 *     (otherwise let the server default — today's month, "variables" tab).
 *   - URL has explicit params     → save them so the next cold open uses
 *     the same period.
 */
export function PayslipViewPersist() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const urlMonth = sp.get("month");
    const urlYear = sp.get("year");
    const urlView = sp.get("view");
    const urlScope = sp.get("scope");

    if (!urlMonth && !urlYear && !urlView && !urlScope) {
      // Cold open — try to restore.
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<{
          month: string;
          year: string;
          view: string;
          scope: string;
        }>;
        if (!saved?.month || !saved?.year) return;
        const params = new URLSearchParams();
        params.set("month", saved.month);
        params.set("year", saved.year);
        if (saved.view) params.set("view", saved.view);
        if (saved.scope) params.set("scope", saved.scope);
        router.replace(`${pathname}?${params.toString()}`);
      } catch {
        // ignore parse / storage errors
      }
      return;
    }

    // Save when user explicitly navigates to a period/tab.
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          month: urlMonth ?? undefined,
          year: urlYear ?? undefined,
          view: urlView ?? undefined,
          scope: urlScope ?? undefined,
        })
      );
    } catch {
      // storage may be full / unavailable
    }
  }, [sp, pathname, router]);

  return null;
}
