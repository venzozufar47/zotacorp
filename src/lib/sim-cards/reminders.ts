/**
 * Reminder harian nomor kartu SIM yang sudah lewat tenggat.
 *
 * Dipicu cron `/api/cron/sim-card-reminders` (11.00 WIB). Mengambil semua
 * kartu aktif yang statusnya `grace`/`expired`, lalu:
 *   - kirim WA ke tiap PENANGGUNG JAWAB berisi nomor miliknya sendiri
 *     (WA dari profil bila PIC karyawan terdaftar, atau `pic_phone` bila
 *     PIC manual), dan
 *   - kirim 1 ringkasan berisi SEMUA nomor ke admin.
 *
 * Berhenti dengan sendirinya: begitu PIC mencatat isi pulsa (yang wajib
 * disertai bukti) dan `active_until` melewati hari ini, kartu keluar dari
 * daftar overdue.
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import {
  sendWhatsApp,
  getAdminWhatsAppRecipients,
} from "@/lib/whatsapp/fonnte";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { isSimOverdue, simStatus, simStatusSummary } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SimReminderSummary {
  overdue: number;
  picSent: number;
  adminSent: number;
  skipped?: string;
}

interface OverdueRow {
  id: string;
  phone: string;
  unitName: string;
  picUserId: string | null;
  picName: string | null;
  picPhone: string | null;
  activeUntil: string | null;
  graceUntil: string | null;
}

/** Satu baris daftar untuk pesan WA. */
function line(i: number, r: OverdueRow, today: string): string {
  const status = simStatusSummary(
    { activeUntil: r.activeUntil, graceUntil: r.graceUntil },
    today
  );
  return `${i + 1}. ${r.phone} — ${r.unitName} · ${status}`;
}

export async function runSimCardReminders(): Promise<SimReminderSummary> {
  const admin = createAdminClient() as any;
  const today = jakartaDateString(new Date());

  // 1. Kartu aktif + tenggatnya.
  const { data: cardRows, error } = await admin
    .from("sim_cards")
    .select(
      "id, business_unit_id, phone_number, pic_user_id, pic_name, pic_phone, active_until, grace_until"
    )
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const active = (cardRows ?? []) as any[];
  const overdueRaw = active.filter((c) =>
    isSimOverdue(
      simStatus({ activeUntil: c.active_until, graceUntil: c.grace_until }, today)
    )
  );
  if (overdueRaw.length === 0) {
    return { overdue: 0, picSent: 0, adminSent: 0, skipped: "no overdue sim cards" };
  }

  // 2. Lengkapi nama unit bisnis + identitas PIC terdaftar.
  const buIds = Array.from(new Set(overdueRaw.map((c) => c.business_unit_id)));
  const picIds = Array.from(
    new Set(overdueRaw.map((c) => c.pic_user_id).filter(Boolean))
  );
  const [{ data: bus }, profRes] = await Promise.all([
    admin.from("business_units").select("id, name").in("id", buIds),
    picIds.length > 0
      ? admin
          .from("profiles")
          .select("id, full_name, nickname, whatsapp_number")
          .in("id", picIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const buById = new Map<string, string>(
    ((bus ?? []) as any[]).map((b) => [b.id, b.name])
  );
  const profById = new Map<string, any>(
    (((profRes as any).data ?? []) as any[]).map((p) => [p.id, p])
  );

  const rows: OverdueRow[] = overdueRaw.map((c) => {
    const p = c.pic_user_id ? profById.get(c.pic_user_id) : null;
    return {
      id: c.id,
      phone: c.phone_number,
      unitName: buById.get(c.business_unit_id) ?? "—",
      picUserId: c.pic_user_id ?? null,
      picName: p
        ? p.nickname?.trim() || p.full_name || "Karyawan"
        : (c.pic_name ?? null),
      picPhone: p ? (p.whatsapp_number ?? null) : (c.pic_phone ?? null),
      activeUntil: c.active_until ?? null,
      graceUntil: c.grace_until ?? null,
    };
  });

  // 3. Kelompokkan per penanggung jawab (key: userId, atau nomor WA manual).
  const byPic = new Map<string, { name: string; phone: string; rows: OverdueRow[] }>();
  for (const r of rows) {
    const phone = normalizePhone(r.picPhone ?? "");
    if (!phone) continue; // PIC tanpa nomor → hanya masuk ringkasan admin
    const key = r.picUserId ?? `manual:${phone}`;
    const entry = byPic.get(key) ?? {
      name: r.picName || "Penanggung jawab",
      phone,
      rows: [],
    };
    entry.rows.push(r);
    byPic.set(key, entry);
  }

  let picSent = 0;
  for (const [, entry] of byPic) {
    const message = await renderWaTemplate("sim_expiry_reminder", {
      name: entry.name,
      count: entry.rows.length,
      list: entry.rows.map((r, i) => line(i, r, today)).join("\n"),
    });
    const ok = await sendWhatsApp(entry.phone, message);
    if (ok) picSent++;
  }

  // 4. Ringkasan ke admin — semua nomor, lintas unit.
  let adminSent = 0;
  const adminPhones = await getAdminWhatsAppRecipients();
  if (adminPhones.length > 0) {
    const message = await renderWaTemplate("sim_expiry_reminder", {
      name: "Admin",
      count: rows.length,
      list: rows.map((r, i) => line(i, r, today)).join("\n"),
    });
    const ok = await sendWhatsApp(adminPhones, message);
    if (ok) adminSent = adminPhones.length;
  }

  return { overdue: rows.length, picSent, adminSent };
}
