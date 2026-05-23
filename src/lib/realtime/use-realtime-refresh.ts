"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe ke Supabase Realtime postgres_changes untuk satu table
 * + filter, lalu `router.refresh()` setiap event masuk (debounced).
 *
 * Pattern: server-side compute tetap jadi single source of truth.
 * Realtime cuma trigger refresh — bukan patch local state. Lebih
 * simple + tidak duplicate logic aggregation.
 *
 * Cleanup pada unmount, debounce default 400ms cegah refresh storm
 * saat burst tx.
 */
interface Opts {
  /** Unique channel name (mis. "pos-shift-${statementId}"). Wajib
   *  unique per subscription supaya tidak konflik di Realtime layer. */
  channel: string;
  /** Nama table di public schema. */
  table: string;
  /** PostgREST filter, e.g. "statement_id=eq.xxx". Optional — kosong
   *  = subscribe ke semua row di table. */
  filter?: string;
  /** Toggle subscription. Pass false untuk disable sementara
   *  (mis. statementId belum ready). Default true. */
  enabled?: boolean;
  /** Debounce window, default 400ms. */
  debounceMs?: number;
  /** Schema name, default "public". */
  schema?: string;
}

export function useRealtimeRefresh({
  channel,
  table,
  filter,
  enabled = true,
  debounceMs = 400,
  schema = "public",
}: Opts) {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const ch = supabase
      .channel(channel)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        () => {
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            router.refresh();
            timerRef.current = null;
          }, debounceMs);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Auto-reconnect handled by Supabase JS, ini cuma untuk
          // debugging visibility.
          console.warn(`[realtime] ${channel} status:`, status);
        }
      });
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [channel, table, filter, enabled, debounceMs, schema, router]);
}
