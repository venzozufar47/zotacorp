/**
 * Cached access helpers Ticketing System.
 *
 *  - isStudioHead()      : membership `studio_heads`.
 *  - canResolveTickets() : admin (owner) ATAU Kepala Studio.
 *  - canFileTickets()    : owner/head ATAU karyawan Yeobo Space (pembuat).
 *  - getMyTicketRole()   : peran penampil utk UI ('owner' | 'head' | 'filer').
 *
 * Semua di React `cache()` — sekali per-request, dipakai layout + page +
 * sidebar. Pola `src/lib/yeobo-booth/access.ts`.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import type { TicketViewerRole } from "./types";

export const isStudioHead = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("studio_heads" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(data);
});

/** Owner (admin) atau Kepala Studio — boleh menindaklanjuti tiket. */
export const canResolveTickets = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return await isStudioHead();
});

/** Boleh buka halaman & membuat tiket: owner/head, atau karyawan Yeobo Space. */
export const canFileTickets = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  if (await isStudioHead()) return true;
  const profile = await getCurrentProfile();
  return (
    role === "employee" &&
    (profile?.business_unit ?? "").trim() === "Yeobo Space"
  );
});

/** Peran penampil terhadap sistem tiket (untuk UI role-adaptive). */
export const getMyTicketRole = cache(
  async (): Promise<TicketViewerRole | null> => {
    const role = await getCurrentRole();
    if (role === "admin") return "owner";
    if (await isStudioHead()) return "head";
    if (await canFileTickets()) return "filer";
    return null;
  }
);
