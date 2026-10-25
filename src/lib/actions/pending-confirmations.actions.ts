"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { getPendingRegistrations } from "@/lib/actions/pending-registrations.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { SELFIE_OVERRIDE_INBOX_DAYS } from "@/lib/attendance/selfie-gate-db";
import { isSimOverdue, simStatus, simStatusSummary } from "@/lib/sim-cards/types";
import { reviewDue } from "@/lib/cleaning/governance";
import {
  RENEWAL_REMINDER_DAYS,
  addDays,
  daysBetween,
  renewalReminderText,
  monthlyEquivalent,
  nextRenewal,
  type BillingCycle,
} from "@/lib/subscriptions/types";

export type PendingConfirmationItem = {
  rowId: string;
  kind:
    | "late_proof"
    | "overtime"
    | "registration"
    | "ticket"
    | "sim_card"
    | "task_review"
    | "subscription"
    | "sop_review"
    | "sop_issue"
    | "selfie_override";
  /** Khusus subscription / SOP: teks panjang ("Jatuh tempo 3 hari lagi"). */
  detail?: string;
  /** Khusus subscription / SOP: lencana singkat untuk Inbox ("H-3", "Hari ini"). */
  shortLabel?: string;
  /** Owner of the attendance row — lets the admin drawer load this
   *  employee's stats + full pending-approval list when clicked. */
  userId: string;
  employeeName: string;
  /** False bila notifikasi tidak menyangkut seorang karyawan (mis. langganan,
   *  SIM tanpa penanggung jawab terdaftar) — UI menampilkan ikon, bukan avatar. */
  hasPerson: boolean;
  userAvatarUrl: string | null;
  userAvatarSeed: string | null;
  date: string;
  /** Waktu kejadian sebenarnya (ISO) bila ada — dipakai untuk label umur
   *  supaya tidak dihitung dari tengah malam tanggal absen. */
  at?: string;
  /** Durasi, khusus overtime. */
  minutes?: number;
  /** Khusus subscription: rincian untuk popup penyelesaian. */
  subscription?: SubscriptionDetail;
};

export type SubscriptionDetail = {
  amountIdr: number;
  billingCycle: BillingCycle;
  /** Setara per bulan (tahunan ÷ 12, dst). */
  monthlyIdr: number;
  /** Jatuh tempo saat ini (yyyy-mm-dd). */
  renewalDate: string;
  /** Jatuh tempo berikutnya bila "Perpanjang" ditekan. */
  nextRenewalDate: string;
  notes: string | null;
  allocations: { label: string; amountIdr: number }[];
};

/**
 * Global list of attendance rows awaiting admin confirmation, across the
 * ENTIRE attendance_logs table — not filtered by the recap table's
 * pagination/month. Used for the "Konfirmasi" bell in admin nav.
 *
 * Two source-of-truth statuses:
 *   - late_proof_status = 'pending' (with a proof url uploaded)
 *   - overtime_requests.status = 'pending' (same table the approve/reject
 *     action and the employee drawer use)
 */
export async function getPendingConfirmations(): Promise<PendingConfirmationItem[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];

  const supabase = await createClient();

  const todayYmd = jakartaDateString(new Date());
  const [
    lateRes,
    otRes,
    registrations,
    ticketsRes,
    simRes,
    taskRes,
    subRes,
    sopRes,
    issueRes,
    selfieRes,
  ] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select(
        "id, date, user_id, profiles!inner(full_name, email, avatar_url, avatar_seed)"
      )
      .eq("late_proof_status", "pending")
      .not("late_proof_url", "is", null)
      .order("date", { ascending: false })
      .limit(200),
    // Sumber SAMA dengan drawer karyawan & aksi Setujui/Tolak
    // (`overtime_requests`), bukan `attendance_logs.overtime_status` —
    // dua tabel itu bisa berbeda, dan Inbox tidak boleh menampilkan yang
    // tidak bisa ditemukan/disetujui di drawer.
    supabase
      .from("overtime_requests")
      .select("attendance_log_id, date, user_id, overtime_minutes, created_at")
      .eq("status", "pending")
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
    // Tugas Karyawan yang sudah dikirim & menunggu verifikasi (migrasi 173).
    supabase
      .from("assigned_tasks" as never)
      .select("id, assignee_id, submitted_at")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
      .limit(100),
    // Subscription aktif yang jatuh tempo ≤ 3 hari lagi — termasuk yang sudah
    // lewat tapi belum diperpanjang (hilang sendiri begitu "Perpanjang" ditekan).
    supabase
      .from("subscriptions" as never)
      .select(
        "id, name, amount_idr, billing_cycle, next_renewal_date, notes, subscription_allocations(business_unit, branch, amount_idr)"
      )
      .eq("is_active", true)
      .not("next_renewal_date", "is", null)
      .lte("next_renewal_date", addDays(todayYmd, RENEWAL_REMINDER_DAYS))
      .order("next_renewal_date", { ascending: true })
      .limit(100),
    // SOP aktif yang punya jadwal tinjau ulang — jatuh tempo dihitung di bawah.
    supabase
      .from("cleaning_checklists")
      .select("id, name, created_at, review_every_days, last_reviewed_at")
      .eq("is_active", true)
      .not("review_every_days", "is", null),
    // Kendala SOP yang dilaporkan karyawan dan belum ditutup.
    supabase
      .from("cleaning_item_issues")
      .select("id, user_id, date, reason, created_at, item:cleaning_checklist_items(title)")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(30),
    // Karyawan tetap absen padahal AI menolak selfienya (migrasi 192); hilang setelah ditinjau
    // atau otomatis setelah beberapa hari.
    supabase
      .from("attendance_logs")
      .select(
        "id, date, user_id, updated_at, selfie_ai_note, profiles!inner(full_name, email, avatar_url, avatar_seed)"
      )
      .eq("selfie_ai_verdict", "overridden")
      .is("selfie_ai_reviewed_at", null)
      .gte("date", addDays(todayYmd, -SELFIE_OVERRIDE_INBOX_DAYS))
      .order("date", { ascending: false })
      .limit(50),
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
      hasPerson: true,
      employeeName: r.profiles?.full_name || r.profiles?.email || "?",
      userAvatarUrl: r.profiles?.avatar_url ?? null,
      userAvatarSeed: r.profiles?.avatar_seed ?? null,
      date: r.date,
    });
  }
  type OtRow = {
    attendance_log_id: string;
    date: string;
    user_id: string;
    overtime_minutes: number | null;
    created_at: string;
  };
  const otRows = (otRes.data ?? []) as unknown as OtRow[];
  const otUserIds = Array.from(new Set(otRows.map((r) => r.user_id)));
  const otProfById = new Map<
    string,
    {
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
      avatar_seed: string | null;
    }
  >();
  if (otUserIds.length > 0) {
    const { data: otProfs } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, avatar_seed")
      .in("id", otUserIds);
    for (const p of otProfs ?? []) otProfById.set(p.id, p);
  }
  for (const r of otRows) {
    const p = otProfById.get(r.user_id);
    items.push({
      // Tetap id baris absen: dipakai lonceng/jump ke rekap absen.
      rowId: r.attendance_log_id,
      kind: "overtime",
      userId: r.user_id,
      hasPerson: true,
      employeeName: p?.full_name || p?.email || "?",
      userAvatarUrl: p?.avatar_url ?? null,
      userAvatarSeed: p?.avatar_seed ?? null,
      date: r.date,
      at: r.created_at,
      minutes: Number(r.overtime_minutes ?? 0),
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
    hasPerson: true,
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
    title?: string | null;
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
      hasPerson: true,
      employeeName: p?.full_name || "Karyawan",
      userAvatarUrl: p?.avatar_url ?? null,
      userAvatarSeed: p?.avatar_seed ?? null,
      date: (t.escalated_at ?? new Date().toISOString()).slice(0, 10),
      detail: t.title ?? undefined,
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
      // PIC manual (pic_name tanpa akun) bukan karyawan terdaftar → tanpa avatar.
      hasPerson: !!s.pic_user_id,
      employeeName: p?.full_name || s.pic_name || "Penanggung jawab",
      userAvatarUrl: p?.avatar_url ?? null,
      userAvatarSeed: p?.avatar_seed ?? null,
      date: s.grace_until ?? s.active_until ?? today,
      detail: `Nomor ${s.phone_number} — ${simStatusSummary(
        { activeUntil: s.active_until, graceUntil: s.grace_until },
        today
      )}`,
    };
  });

  // Tugas menunggu verifikasi — nama pengirim = karyawan penerima tugas.
  type TaskRow = { id: string; assignee_id: string; submitted_at: string | null };
  const taskRows = (taskRes.data ?? []) as unknown as TaskRow[];
  const taskProfById = new Map<
    string,
    { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }
  >();
  const taskAssigneeIds = Array.from(new Set(taskRows.map((t) => t.assignee_id)));
  if (taskAssigneeIds.length > 0) {
    const { data: tProfs } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, avatar_seed")
      .in("id", taskAssigneeIds);
    for (const p of tProfs ?? []) taskProfById.set(p.id, p);
  }
  const taskItems: PendingConfirmationItem[] = taskRows.map((t) => {
    const p = taskProfById.get(t.assignee_id);
    return {
      rowId: t.id,
      kind: "task_review",
      userId: t.assignee_id,
      hasPerson: true,
      employeeName: p?.full_name || "Karyawan",
      userAvatarUrl: p?.avatar_url ?? null,
      userAvatarSeed: p?.avatar_seed ?? null,
      date: t.submitted_at ? jakartaDateString(new Date(t.submitted_at)) : today,
      at: t.submitted_at ?? undefined,
    };
  });

  // Subscription mendekati/lewat tenggat pembaruan. Tidak terikat karyawan —
  // nama langganan dipakai sebagai judul; klik mengarah ke /admin/subscriptions.
  type SubRow = {
    id: string;
    name: string;
    amount_idr: number | string;
    billing_cycle: BillingCycle;
    next_renewal_date: string;
    notes: string | null;
    subscription_allocations: { business_unit: string; branch: string | null; amount_idr: number | string }[] | null;
  };
  const subItems: PendingConfirmationItem[] = (
    (subRes.data ?? []) as unknown as SubRow[]
  ).map((s) => {
    const text = renewalReminderText(daysBetween(todayYmd, s.next_renewal_date));
    return {
      rowId: s.id,
      kind: "subscription",
      userId: s.id,
      hasPerson: false,
      employeeName: s.name,
      userAvatarUrl: null,
      userAvatarSeed: null,
      date: s.next_renewal_date,
      detail: text.long,
      shortLabel: text.short,
      subscription: {
        amountIdr: Number(s.amount_idr),
        billingCycle: s.billing_cycle,
        monthlyIdr: monthlyEquivalent(Number(s.amount_idr), s.billing_cycle),
        renewalDate: s.next_renewal_date,
        nextRenewalDate: nextRenewal(s.next_renewal_date, s.billing_cycle, todayYmd),
        notes: s.notes?.trim() || null,
        allocations: (s.subscription_allocations ?? []).map((a) => ({
          label: a.branch ? `${a.business_unit} · ${a.branch}` : a.business_unit,
          amountIdr: Number(a.amount_idr),
        })),
      },
    };
  });

  // SOP yang sudah waktunya (atau lewat) ditinjau ulang. Judul = nama SOP.
  const sopItems: PendingConfirmationItem[] = [];
  for (const c of sopRes.data ?? []) {
    const due = reviewDue(c, todayYmd);
    if (!due || due.daysLeft > 0) continue;
    sopItems.push({
      rowId: c.id,
      kind: "sop_review",
      hasPerson: false,
      userId: c.id,
      employeeName: c.name,
      userAvatarUrl: null,
      userAvatarSeed: null,
      date: due.dueYmd,
      detail:
        due.daysLeft === 0
          ? "Waktunya tinjau ulang SOP"
          : `Tinjau ulang SOP terlambat ${-due.daysLeft} hari`,
      shortLabel: due.daysLeft === 0 ? "Tinjau" : `Telat ${-due.daysLeft}h`,
    });
  }
  sopItems.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Kendala SOP dari karyawan — nama pelapor sebagai judul.
  type IssueRow = {
    id: string;
    user_id: string;
    date: string;
    reason: string;
    created_at: string;
    item: { title?: string | null } | null;
  };
  const issueRows = (issueRes.data ?? []) as unknown as IssueRow[];
  const issueUserIds = Array.from(new Set(issueRows.map((i) => i.user_id)));
  const issueProfById = new Map<
    string,
    { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }
  >();
  if (issueUserIds.length > 0) {
    const { data: iProfs } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, avatar_seed")
      .in("id", issueUserIds);
    for (const p of iProfs ?? []) issueProfById.set(p.id, p);
  }
  const issueItems: PendingConfirmationItem[] = issueRows.map((i) => {
    const p = issueProfById.get(i.user_id);
    return {
      rowId: i.id,
      kind: "sop_issue",
      hasPerson: true,
      userId: i.user_id,
      employeeName: p?.full_name || "Karyawan",
      userAvatarUrl: p?.avatar_url ?? null,
      userAvatarSeed: p?.avatar_seed ?? null,
      date: i.date,
      at: i.created_at,
      detail: `Kendala/masukan SOP — ${i.item?.title ?? "titik"}: ${i.reason}`,
    };
  });

  const selfieItems: PendingConfirmationItem[] = (
    (selfieRes.data ?? []) as unknown as (Row & { updated_at: string; selfie_ai_note: string | null })[]
  ).map((r) => ({
    rowId: r.id,
    kind: "selfie_override",
    hasPerson: true,
    userId: r.user_id,
    employeeName: r.profiles?.full_name || r.profiles?.email || "?",
    userAvatarUrl: r.profiles?.avatar_url ?? null,
    userAvatarSeed: r.profiles?.avatar_seed ?? null,
    date: r.date,
    at: r.updated_at,
    detail: r.selfie_ai_note?.split("\n").filter(Boolean).join(" · ") || "Foto selfie absen belum sesuai aturan",
  }));

  // Urutan = prioritas di Inbox beranda (yang hanya memuat 6 teratas): hal yang
  // memblokir orang (pendaftar, tugas, tiket) di atas pengingat berkala
  // (langganan, tinjau SOP) supaya pengingat tidak menenggelamkan persetujuan.
  return [
    ...taskItems,
    ...simItems,
    ...ticketItems,
    ...registrationItems,
    ...selfieItems,
    ...issueItems,
    ...sopItems,
    ...subItems,
    ...items,
  ];
}
