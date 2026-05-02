"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";

export type PendingConfirmationItem = {
  rowId: string;
  kind: "late_proof" | "overtime";
  employeeName: string;
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

  const [lateRes, otRes] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("id, date, profiles!inner(full_name, email)")
      .eq("late_proof_status", "pending")
      .not("late_proof_url", "is", null)
      .order("date", { ascending: false })
      .limit(200),
    supabase
      .from("attendance_logs")
      .select("id, date, profiles!inner(full_name, email)")
      .eq("overtime_status", "pending")
      .eq("is_overtime", true)
      .order("date", { ascending: false })
      .limit(200),
  ]);

  type Row = {
    id: string;
    date: string;
    profiles: { full_name: string | null; email: string | null } | null;
  };

  const items: PendingConfirmationItem[] = [];
  for (const r of (lateRes.data ?? []) as unknown as Row[]) {
    items.push({
      rowId: r.id,
      kind: "late_proof",
      employeeName: r.profiles?.full_name || r.profiles?.email || "?",
      date: r.date,
    });
  }
  for (const r of (otRes.data ?? []) as unknown as Row[]) {
    items.push({
      rowId: r.id,
      kind: "overtime",
      employeeName: r.profiles?.full_name || r.profiles?.email || "?",
      date: r.date,
    });
  }
  // Sort by most recent date, late_proof before overtime as a stable tiebreaker.
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "late_proof" ? -1 : 1;
    return a.employeeName.localeCompare(b.employeeName);
  });
  return items;
}
