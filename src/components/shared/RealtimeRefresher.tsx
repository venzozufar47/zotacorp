"use client";

import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";

/**
 * Thin wrapper untuk render `useRealtimeRefresh` di dalam server
 * component page. Server page render `<RealtimeRefresher .../>` tanpa
 * convert seluruh page jadi client. Component ini render null —
 * tujuannya cuma subscribe + trigger router.refresh.
 *
 * Boleh stack multiple di satu page (mis. subscribe ke
 * cashflow_transactions DAN cashflow_statements).
 */
export function RealtimeRefresher({
  channel,
  table,
  filter,
  enabled,
  debounceMs,
}: {
  channel: string;
  table: string;
  filter?: string;
  enabled?: boolean;
  debounceMs?: number;
}) {
  useRealtimeRefresh({ channel, table, filter, enabled, debounceMs });
  return null;
}
