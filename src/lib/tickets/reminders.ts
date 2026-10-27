/* eslint-disable @typescript-eslint/no-explicit-any -- tabel tiket baru belum ada di types.ts yang di-generate */
/**
 * Reminder harian tiket untuk penanggung jawab (hierarki per cabang).
 *
 * Dipicu cron `/api/cron/studio-head-ticket-reminders` dua kali sehari (11.00 dan 18.00 WIB). Tiap atasan diingatkan
 * HANYA soal tiket yang ditujukan kepadanya (handler_id; open / in_progress — tiket yang sudah dieskalasi ada di
 * tangan atasan berikutnya), dan owner soal tiket yang dipegang owner. Penerima tiket "turun" dari owner diingatkan soal tiket
 * yang ditugaskan kepadanya (atau ke seluruh cabangnya dan belum diambil). Tidak ada tiket → tidak kirim.
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendPushToUser } from "@/lib/push/web-push";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import { TICKET_CATEGORY_LABELS, type TicketCategory } from "@/lib/tickets/types";

/** Status yang dianggap "aktif" & menunggu tindakan penanggung jawab. */
const ACTIVE_STATUSES = ["open", "in_progress"] as const;

interface ActiveTicketRow {
  title: string;
  branch: string;
  branch_id: string;
  direction: string;
  assignee_id: string | null;
  handler_id: string | null;
  handler_level: number;
  category: string;
  priority: string;
  created_at: string;
}

/** Susun daftar tiket aktif jadi teks (urgent di atas, lalu terlama dulu). */
function buildTicketList(rows: ActiveTicketRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    const ua = a.priority === "urgent" ? 1 : 0;
    const ub = b.priority === "urgent" ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return a.created_at < b.created_at ? -1 : 1;
  });
  return sorted
    .map((t, i) => {
      const flag = t.priority === "urgent" ? "🔴 " : "";
      const cat = TICKET_CATEGORY_LABELS[t.category as TicketCategory] ?? t.category;
      return `${i + 1}. ${flag}${t.title} (${t.branch} · ${cat})`;
    })
    .join("\n");
}

export interface StudioReminderSummary {
  activeCount: number;
  heads: number;
  sent: number;
  skipped?: string;
}

export async function runStudioHeadTicketReminders(): Promise<StudioReminderSummary> {
  // `tickets` types di-maintain manual → cast longgar.
  const admin = createAdminClient() as any;

  const { data: ticketRows, error: tErr } = await admin
    .from("tickets")
    .select("title, branch, branch_id, direction, assignee_id, handler_id, handler_level, category, priority, created_at")
    .in("status", ACTIVE_STATUSES as unknown as string[]);
  if (tErr) throw new Error(tErr.message);
  const rows = (ticketRows ?? []) as ActiveTicketRow[];
  if (rows.length === 0) return { activeCount: 0, heads: 0, sent: 0, skipped: "no active tickets" };

  // Siapa yang diingatkan tentang tiket apa.
  const perUser = new Map<string, ActiveTicketRow[]>();
  const push = (uid: string, t: ActiveTicketRow) => perUser.set(uid, [...(perUser.get(uid) ?? []), t]);

  // 1. Tiket "naik": atasan yang dituju (handler_id), atau semua admin untuk level owner.
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const adminIds = ((admins ?? []) as any[]).map((a) => a.id as string);
  for (const t of rows) {
    if (t.direction !== "up") continue;
    if (Number(t.handler_level) >= 99) {
      for (const id of adminIds) push(id, t);
      continue;
    }
    if (t.handler_id) push(t.handler_id, t);
  }

  // 2. Tiket "turun": penerima, atau seluruh karyawan cabang bila belum diambil.
  const downTickets = rows.filter((t) => t.direction === "down");
  if (downTickets.length > 0) {
    const branchIds = Array.from(new Set(downTickets.map((t) => t.branch_id)));
    const { data: branches } = await admin.from("ticket_branches").select("id, location_id").in("id", branchIds);
    const locByBranch = new Map(((branches ?? []) as any[]).map((b) => [b.id as string, b.location_id as string | null]));
    const locIds = Array.from(new Set(Array.from(locByBranch.values()).filter(Boolean) as string[]));
    const { data: emps } = locIds.length ? await admin.from("employee_locations").select("employee_id, location_id").in("location_id", locIds) : { data: [] };
    for (const t of downTickets) {
      if (t.assignee_id) {
        push(t.assignee_id, t);
        continue;
      }
      const loc = locByBranch.get(t.branch_id);
      for (const e of (emps ?? []) as any[]) if (e.location_id === loc) push(e.employee_id as string, t);
    }
  }

  const ids = Array.from(perUser.keys());
  if (ids.length === 0) return { activeCount: rows.length, heads: 0, sent: 0, skipped: "no recipients" };
  const { data: profs } = await admin.from("profiles").select("id, full_name, nickname").in("id", ids);

  // sendPushToUser no-op diam-diam kalau penerima belum aktifkan notifikasi (tidak melempar), jadi `sent` menghitung
  // PERCOBAAN kirim, bukan konfirmasi terkirim.
  let sent = 0;
  for (const p of (profs ?? []) as any[]) {
    const mine = perUser.get(p.id) ?? [];
    if (mine.length === 0) continue;
    try {
      const name: string = (p.nickname?.trim() as string) || p.full_name || "Tim";
      const hasUrgent = mine.some((r) => r.priority === "urgent");
      const list = hasUrgent ? `${buildTicketList(mine)}\n\n🔴 = mendesak, mohon didahulukan.` : buildTicketList(mine);
      const body = await renderWaTemplate("ticket_active_reminder", { name, count: mine.length, list });
      await sendPushToUser(p.id, { title: "Tiket menunggu", body, url: "/tickets" });
      sent++;
    } catch (err) {
      console.error("[tickets] push send failed", err);
    }
  }

  return { activeCount: rows.length, heads: ids.length, sent };
}
