import "server-only";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { blockingReason, loadRound } from "@/lib/verification/server";
import { sendPushToUser } from "@/lib/push/web-push";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tiket yang sudah ditandai selesai tetapi tidak dikonfirmasi pembuatnya dalam sekian hari dianggap beres. */
export const AUTO_CONFIRM_AFTER_DAYS = 7;

export interface AutoConfirmSummary {
  checked: number;
  confirmed: number;
  /** Dilewati karena masih menunggu verifikator (konfirmasi manual pun diblokir untuk kondisi yang sama). */
  blocked: number;
}

/**
 * Konfirmasi otomatis: tiket `resolved` yang belum dikonfirmasi dan sudah lewat batas hari sejak ditandai selesai.
 * Ditandai `confirmed_at` terisi dengan `confirmed_by` KOSONG, itulah yang membedakannya dari konfirmasi manual
 * pembuat tiket (UI menampilkan "dikonfirmasi otomatis"). Idempoten: guard `status = resolved` dan `confirmed_at is null`
 * di UPDATE, jadi konfirmasi manual yang masuk bersamaan tidak tertimpa.
 */
export async function autoConfirmStaleTickets(now: Date = new Date()): Promise<AutoConfirmSummary> {
  const admin = createAdminClient() as any;
  const cutoff = new Date(now.getTime() - AUTO_CONFIRM_AFTER_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("tickets")
    .select("id, title, branch, direction, created_by, resolved_by, handler_level")
    .eq("status", "resolved")
    .is("confirmed_at", null)
    .not("resolved_at", "is", null)
    .lte("resolved_at", cutoff)
    .order("resolved_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; title: string; branch: string; direction: string; created_by: string | null; resolved_by: string | null; handler_level: number }[];

  let confirmed = 0;
  let blocked = 0;
  for (const ticket of rows) {
    const { id } = ticket;
    const rounds = await loadRound(admin, "ticket", id);
    const latest = rounds.reduce((m, r) => Math.max(m, r.round), 0);
    if (latest > 0 && (await blockingReason(admin, "ticket", id, latest))) {
      blocked++;
      continue;
    }
    const { data: done } = await admin
      .from("tickets")
      .update({ confirmed_at: now.toISOString(), confirmed_by: null })
      .eq("id", id)
      .eq("status", "resolved")
      .is("confirmed_at", null)
      .select("id");
    if (done && done.length > 0) {
      confirmed++;
      const recipients = new Map<string, string>();
      if (ticket.created_by) recipients.set(ticket.created_by, ticket.direction === "down" ? "/admin/tickets" : "/tickets");
      if (ticket.resolved_by) recipients.set(ticket.resolved_by, Number(ticket.handler_level) >= 99 ? "/admin/tickets" : "/tickets");
      for (const [userId, url] of recipients) {
        try {
          await sendPushToUser(userId, {
            title: "Tiket dikonfirmasi otomatis",
            body: `${ticket.branch} · ${ticket.title} — sudah 7 hari sejak ditandai selesai.`,
            url,
          });
        } catch (err) {
          console.error("[tickets] auto-confirm push failed", err);
        }
      }
    }
  }
  return { checked: rows.length, confirmed, blocked };
}
