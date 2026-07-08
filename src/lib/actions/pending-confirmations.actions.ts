"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getPendingRegistrations } from "@/lib/actions/pending-registrations.actions";

export type PendingConfirmationItem = {
  rowId: string;
  kind: "late_proof" | "overtime" | "registration";
  /** Owner of the attendance row — lets the admin drawer load this
   *  employee's stats + full pending-approval list when clicked. */
  userId: string;
  employeeName: string;
  userAvatarUrl: string | null;
  userAvatarSeed: string | null;
  date: string;
};

/**
 * Global list of attendance rows awaiting admin confirmation, across the
 * ENTIRE attendance_logs table — not filtered by the recap table's
 * pagination/month. Used for the "Konfirmasi" bell in admin nav.
 *
 * Two source-of-truth statuses:
 *   - late_proof_status = 'pending' (with a proof url uploaded)
 *   - overtime_status   = 'pending' (only on rows flagged is_overtime)
 */
export async function getPendingConfirmations(): Promise<PendingConfirmationItem[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];

  const supabase = await createClient();

  const [lateRes, otRes, registrations] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select(
        "id, date, user_id, profiles!inner(full_name, email, avatar_url, avatar_seed)"
      )
      .eq("late_proof_status", "pending")
      .not("late_proof_url", "is", null)
      .order("date", { ascending: false })
      .limit(200),
    supabase
      .from("attendance_logs")
      .select(
        "id, date, user_id, profiles!inner(full_name, email, avatar_url, avatar_seed)"
      )
      .eq("overtime_status", "pending")
      .eq("is_overtime", true)
      .order("date", { ascending: false })
      .limit(200),
    getPendingRegistrations(),
  ]);

  type Row = {
    id: string;
    date: string;
    user_id: string;
    profiles: {
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
      avatar_seed: string | null;
    } | null;
  };

  const items: PendingConfirmationItem[] = [];
  for (const r of (lateRes.data ?? []) as unknown as Row[]) {
    items.push({
      rowId: r.id,
      kind: "late_proof",
      userId: r.user_id,
      employeeName: r.profiles?.full_name || r.profiles?.email || "?",
      userAvatarUrl: r.profiles?.avatar_url ?? null,
      userAvatarSeed: r.profiles?.avatar_seed ?? null,
      date: r.date,
    });
  }
  for (const r of (otRes.data ?? []) as unknown as Row[]) {
    items.push({
      rowId: r.id,
      kind: "overtime",
      userId: r.user_id,
      employeeName: r.profiles?.full_name || r.profiles?.email || "?",
      userAvatarUrl: r.profiles?.avatar_url ?? null,
      userAvatarSeed: r.profiles?.avatar_seed ?? null,
      date: r.date,
    });
  }
  // Sort by most recent date, late_proof before overtime as a stable tiebreaker.
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "late_proof" ? -1 : 1;
    return a.employeeName.localeCompare(b.employeeName);
  });

  // Pendaftar baru menunggu ACC — taruh paling atas karena mereka tidak bisa
  // login sampai disetujui (`date` = tanggal daftar untuk label & agoLabel).
  const registrationItems: PendingConfirmationItem[] = registrations.map((r) => ({
    rowId: r.id,
    kind: "registration",
    userId: r.id,
    employeeName: r.fullName,
    userAvatarUrl: r.avatarUrl,
    userAvatarSeed: r.avatarSeed,
    date: r.createdAt.slice(0, 10),
  }));

  return [...registrationItems, ...items];
}
