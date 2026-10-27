/**
 * Cached access helpers Ticketing System (hierarki atasan per orang).
 *
 *  - isStudioHead()      : punya bawahan di cabang mana pun (nama lama dipertahankan; kini bukan hanya Yeobo).
 *  - canResolveTickets() : admin (owner) ATAU atasan.
 *  - canFileTickets()    : owner/atasan ATAU karyawan yang ditugaskan ke sebuah cabang tiket (pelapor), atau
 *                          penerima tiket "turun".
 *  - getMyTicketRole()   : peran penampil utk UI ('owner' | 'head' | 'filer').
 *
 * Semua di React `cache()` — sekali per-request, dipakai layout + page + sidebar.
 */

import { cache } from "react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { branchesOfEmployee, managedBy } from "./chain";
import type { TicketViewerRole } from "./types";

/** Atasan: punya bawahan langsung di cabang mana pun. */
export const isStudioHead = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  return (await managedBy(user.id)).length > 0;
});

/** Owner (admin) atau atasan — boleh menindaklanjuti tiket. */
export const canResolveTickets = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return await isStudioHead();
});

/** Boleh buka halaman & membuat tiket: owner/atasan, atau karyawan yang ditugaskan ke sebuah cabang tiket. */
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
