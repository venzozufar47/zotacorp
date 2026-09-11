/**
 * Reminder harian nomor kartu SIM yang sudah lewat tenggat.
 *
 * Dipicu cron `/api/cron/sim-card-reminders` (11.00 WIB). Mengambil semua
 * kartu aktif yang statusnya `grace`/`expired`, lalu:
 *   - kirim push ke tiap PENANGGUNG JAWAB (harus akun app terdaftar —
 *     PIC manual/nomor HP sudah tidak didukung; kartu dengan PIC manual
 *     legacy di-skip sampai admin sambungkan ke akun lewat /admin/sim-cards), dan
 *   - kirim 1 ringkasan berisi SEMUA nomor ke admin.
 *
 * Berhenti dengan sendirinya: begitu PIC mencatat isi pulsa (yang wajib
 * disertai bukti) dan `active_until` melewati hari ini, kartu keluar dari
 * daftar overdue.
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push/web-push";
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

  // 3. Kelompokkan per penanggung jawab — HARUS akun terdaftar (pic_user_id).
  // Kartu dengan PIC manual legacy (tanpa akun) di-skip di sini; masih
  // masuk ringkasan admin di bawah supaya tidak hilang dari radar.
  const byPic = new Map<string, { name: string; rows: OverdueRow[] }>();
  let unassignedCount = 0;
  for (const r of rows) {
    if (!r.picUserId) {
      unassignedCount++;
      continue;
    }
    const entry = byPic.get(r.picUserId) ?? {
      name: r.picName || "Penanggung jawab",
      rows: [],
    };
    entry.rows.push(r);
    byPic.set(r.picUserId, entry);
  }
  if (unassignedCount > 0) {
    console.warn(
      `[sim-cards] ${unassignedCount} kartu overdue dengan PIC belum terhubung akun — sambungkan di /admin/sim-cards`
    );
  }

  let picSent = 0;
  for (const [userId, entry] of byPic) {
    try {
      const message = await renderWaTemplate("sim_expiry_reminder", {
        name: entry.name,
        count: entry.rows.length,
        list: entry.rows.map((r, i) => line(i, r, today)).join("\n"),
      });
      await sendPushToUser(userId, {
        title: "Kartu SIM lewat tenggat",
        body: message,
        url: "/sim-cards",
      });
      picSent++;
    } catch (err) {
      console.error("[sim-cards] push PIC send failed", err);
    }
  }

  // 4. Ringkasan ke admin — semua nomor, lintas unit.
  let adminSent = 0;
  try {
    const message = await renderWaTemplate("sim_expiry_reminder", {
      name: "Admin",
      count: rows.length,
      list: rows.map((r, i) => line(i, r, today)).join("\n"),
    });
    await sendPushToAdmins({
      title: "Kartu SIM lewat tenggat",
      body: message,
      url: "/admin/sim-cards",
    });
    adminSent = 1;
  } catch (err) {
    console.error("[sim-cards] push admin summary failed", err);
  }

  return { overdue: rows.length, picSent, adminSent };
}
