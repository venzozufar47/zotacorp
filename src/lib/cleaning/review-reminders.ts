/**
 * Pengingat tinjau ulang SOP lewat push, dipicu cron harian
 * `/api/cron/sop-review-reminders` (11.00 WIB).
 *
 * Aturan agar tidak jadi spam: SOP yang jatuh tempo diingatkan pada HARI JATUH
 * TEMPO, lalu sekali seminggu selama masih terlambat. Tiap pemilik menerima
 * SATU push berisi seluruh SOP miliknya yang sedang giliran diingatkan; SOP
 * tanpa pemilik dirangkum ke admin. Berhenti dengan sendirinya begitu SOP
 * ditandai "sudah ditinjau" (hitungan mulai dari awal).
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push/web-push";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { reviewDue } from "./governance";

export interface SopReminderSummary {
  due: number;
  ownersNotified: number;
  adminNotified: boolean;
  skipped?: string;
}

/** Hari ini perlu diingatkan? Tepat jatuh tempo, atau kelipatan 7 hari setelahnya. */
export function shouldRemindToday(daysLeft: number): boolean {
  return daysLeft === 0 || (daysLeft < 0 && -daysLeft % 7 === 0);
}

export async function runSopReviewReminders(): Promise<SopReminderSummary> {
  const admin = createAdminClient();
  const today = jakartaDateString(new Date());

  const { data, error } = await admin
    .from("cleaning_checklists")
    .select("id, name, owner_id, created_at, review_every_days, last_reviewed_at")
    .eq("is_active", true)
    .not("review_every_days", "is", null);
  if (error) throw new Error(error.message);

  const due = (data ?? [])
    .map((c) => ({ c, d: reviewDue(c, today) }))
    .filter((x): x is { c: (typeof x)["c"]; d: NonNullable<(typeof x)["d"]> } =>
      !!x.d && shouldRemindToday(x.d.daysLeft)
    );
  if (due.length === 0) {
    return { due: 0, ownersNotified: 0, adminNotified: false, skipped: "no SOP due" };
  }

  const line = (name: string, daysLeft: number) =>
    daysLeft === 0 ? `${name} (hari ini)` : `${name} (lewat ${-daysLeft} hari)`;

  const byOwner = new Map<string, string[]>();
  const ownerless: string[] = [];
  for (const { c, d } of due) {
    if (c.owner_id) {
      const list = byOwner.get(c.owner_id) ?? [];
      list.push(line(c.name, d.daysLeft));
      byOwner.set(c.owner_id, list);
    } else {
      ownerless.push(line(c.name, d.daysLeft));
    }
  }

  let ownersNotified = 0;
  for (const [ownerId, lines] of byOwner) {
    try {
      const res = await sendPushToUser(ownerId, {
        title: lines.length === 1 ? "Waktunya tinjau ulang SOP" : `${lines.length} SOP perlu ditinjau`,
        body: lines.join("\n"),
        url: "/sop-saya",
      });
      if (res.delivered > 0) ownersNotified++;
      // Pemilik belum mengaktifkan notifikasi (atau sudah tak aktif): jangan
      // sampai pengingatnya hilang — admin yang menerima.
      else ownerless.push(...lines.map((l) => `${l} — pemilik belum bisa dihubungi lewat push`));
    } catch (err) {
      console.error("[sop-review] push pemilik gagal", err);
      ownerless.push(...lines);
    }
  }

  let adminNotified = false;
  if (ownerless.length > 0) {
    try {
      const res = await sendPushToAdmins({
        title: `${ownerless.length} SOP perlu ditinjau (tanpa pemilik / pemilik tak terjangkau)`,
        body: ownerless.join("\n"),
        url: "/admin/cleaning?setup=1",
      });
      adminNotified = res.delivered > 0;
    } catch (err) {
      console.error("[sop-review] push admin gagal", err);
    }
  }

  return { due: due.length, ownersNotified, adminNotified };
}
