/**
 * Satu-satunya tempat membuat klien Supabase. Semua klien memakai `paginatedFetch`, sehingga query tidak terpotong
 * diam-diam di 1.000 baris. ESLint melarang mengimpor pembuat klien langsung dari paket `@supabase/*`.
 */
import { createClient as baseCreateClient } from "@supabase/supabase-js";
import {
  createBrowserClient as baseCreateBrowserClient,
  createServerClient as baseCreateServerClient,
} from "@supabase/ssr";
import { paginatedFetch } from "./paginated-fetch";

function withPagination(options: unknown) {
  const o = (options ?? {}) as { global?: Record<string, unknown> };
  return { ...o, global: { fetch: paginatedFetch, ...o.global } };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const createClient = ((url: string, key: string, options?: unknown) =>
  baseCreateClient(url, key, withPagination(options) as any)) as typeof baseCreateClient;

export const createBrowserClient = ((url: string, key: string, options?: unknown) =>
  baseCreateBrowserClient(url, key, withPagination(options) as any)) as typeof baseCreateBrowserClient;

export const createServerClient = ((url: string, key: string, options: unknown) =>
  baseCreateServerClient(url, key, withPagination(options) as any)) as typeof baseCreateServerClient;
