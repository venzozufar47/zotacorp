"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getPendingRegistrations } from "@/lib/actions/pending-registrations.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { isSimOverdue, simStatus } from "@/lib/sim-cards/types";

export type PendingConfirmationItem = {
  rowId: string;
  kind: "late_proof" | "overtime" | "registration" | "ticket" | "sim_card";
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

  const [lateRes, otRes, registrations, ticketsRes, simRes] = await Promise.all([
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
    supabase
      .from("tickets" as never)
      .select("id, created_by, escalated_at, title")
      .in("status", ["escalated", "owner_handling"])
      .order("escalated_at", { ascending: true })
      .limit(100),
    supabase
      .from("sim_cards" as never)
      .select(
        "id, phone_number, pic_user_id, pic_name, active_until, grace_until"
      )
      .eq("is_active", true)
      .limit(200),
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

  // Tiket studio yang perlu ditangani owner (eskalasi / owner_handling).
  // `tickets` punya banyak FK ke profiles, jadi tak bisa embed — lookup
  // nama/avatar pembuat terpisah.
  type TicketRow = {
    id: string;
    created_by: string;
    escalated_at: string | null;
  };
  const ticketRows = (ticketsRes.data ?? []) as unknown as TicketRow[];
  const ticketCreatorIds = Array.from(new Set(ticketRows.map((t) => t.created_by)));
  const ticketProfById = new Map<
    string,
    { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }
  >();
  if (ticketCreatorIds.length > 0) {
    const { data: tProfs } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, avatar_seed")
      .in("id", ticketCreatorIds);
    for (const p of tProfs ?? []) ticketProfById.set(p.id, p);
  }
  const ticketItems: PendingConfirmationItem[] = ticketRows.map((t) => {
    const p = ticketProfById.get(t.created_by);
    return {
      rowId: t.id,
      kind: "ticket",
      userId: t.created_by,
      employeeName: p?.full_name || "Karyawan",
      userAvatarUrl: p?.avatar_url ?? null,
      userAvatarSeed: p?.avatar_seed ?? null,
      date: (t.escalated_at ?? new Date().toISOString()).slice(0, 10),
    };
  });

  // Nomor SIM yang sudah lewat masa aktif/tenggang — perlu diisi pulsa.
  // Nama yang ditampilkan = penanggung jawab (profil bila karyawan
  // terdaftar, else pic_name manual) supaya admin tahu siapa yang ditagih.
  const today = jakartaDateString(new Date());
  type SimRow = {
    id: string;
    phone_number: string;
    pic_user_id: string | null;
    pic_name: string | null;
    active_until: string | null;
    grace_until: string | null;
  };
  const simRows = ((simRes.data ?? []) as unknown as SimRow[]).filter((s) =>
    isSimOverdue(
      simStatus({ activeUntil: s.active_until, graceUntil: s.grace_until }, today)
    )
  );
  const simPicIds = Array.from(
    new Set(simRows.map((s) => s.pic_user_id).filter((x): x is string => !!x))
  );
  const simProfById = new Map<
    string,
    { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }
  >();
  if (simPicIds.length > 0) {
    const { data: sProfs } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, avatar_seed")
      .in("id", simPicIds);
    for (const p of sProfs ?? []) simProfById.set(p.id, p);
  }
  const simItems: PendingConfirmationItem[] = simRows.map((s) => {
    const p = s.pic_user_id ? simProfById.get(s.pic_user_id) : null;
    return {
      rowId: s.id,
      kind: "sim_card",
      userId: s.pic_user_id ?? s.id,
      employeeName: p?.full_name || s.pic_name || "Penanggung jawab",
      userAvatarUrl: p?.avatar_url ?? null,
      userAvatarSeed: p?.avatar_seed ?? null,
      date: s.grace_until ?? s.active_until ?? today,
    };
  });

  return [...simItems, ...ticketItems, ...registrationItems, ...items];
}
