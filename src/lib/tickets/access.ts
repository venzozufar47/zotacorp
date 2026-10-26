/**
 * Cached access helpers Ticketing System (hierarki per cabang).
 *
 *  - isStudioHead()      : anggota rantai tiket di cabang mana pun (nama lama dipertahankan; kini bukan hanya Yeobo).
 *  - canResolveTickets() : admin (owner) ATAU anggota rantai.
 *  - canFileTickets()    : owner/anggota rantai ATAU karyawan yang ditugaskan ke sebuah cabang tiket (pelapor), atau
 *                          penerima tiket "turun".
 *  - getMyTicketRole()   : peran penampil utk UI ('owner' | 'head' | 'filer').
 *
 * Semua di React `cache()` — sekali per-request, dipakai layout + page + sidebar.
 */

import { cache } from "react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { branchesOfEmployee, chainMembershipsOf } from "./chain";
import type { TicketViewerRole } from "./types";

/** Anggota rantai tiket (tingkat berapa pun, cabang mana pun). */
export const isStudioHead = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  return (await chainMembershipsOf(user.id)).length > 0;
});

/** Owner (admin) atau anggota rantai — boleh menindaklanjuti tiket. */
export const canResolveTickets = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return await isStudioHead();
});

/** Boleh buka halaman & membuat tiket: owner/anggota rantai, atau karyawan yang ditugaskan ke sebuah cabang tiket. */
export const canFileTickets = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  if (role === "investor") return false;
  const user = await getCurrentUser();
  if (!user) return false;
  if (await isStudioHead()) return true;
  return (await branchesOfEmployee(user.id)).length > 0;
});

/** Peran penampil terhadap sistem tiket (untuk UI role-adaptive). */
export const getMyTicketRole = cache(async (): Promise<TicketViewerRole | null> => {
  const role = await getCurrentRole();
  if (role === "admin") return "owner";
  if (await isStudioHead()) return "head";
  if (await canFileTickets()) return "filer";
  return null;
});
