"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import { computeStreak } from "@/lib/utils/streak";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";
import type { Database } from "@/lib/supabase/types";

/**
 * Aggregate per-employee monitoring data untuk admin tab baru:
 *  - Streak presensi (current + personal best + last milestone)
 *  - Tanggal ulang tahun + last greeted
 *  - Tanggal mulai kerja + last anniversary greeted + tahun berjalan
 *  - Riwayat kiriman WA terkait perayaan (birthday/anniversary)
 *
 * Sekuritas: admin-only (dipanggil dari halaman /admin yang sudah
 * gate-nya `role === "admin"`).
 */

export interface EmployeeMonitoringRow {
  id: string;
  fullName: string;
  nickname: string | null;
  whatsappNumber: string | null;
  // Streak
  streakCurrent: number;
  streakPersonalBest: number;
  streakLastMilestone: number;
  // Birthday
  dateOfBirth: string | null;
  birthdayThisYear: string | null;
  daysToBirthday: number | null;
  birthdayLastGreeted: string | null;
  // Anniversary
  firstDayOfWork: string | null;
  anniversaryThisYear: string | null;
  daysToAnniversary: number | null;
  anniversaryLastGreeted: string | null;
  yearsOfService: number;
  // Recent WA logs (celebration only)
  recentWa: WhatsAppLogEntry[];
  /**
   * Notice yang seharusnya tampil ke admin: WA yang berdasarkan
   * data DB seharusnya sudah dikirim tapi tidak terdeteksi di
   * `whatsapp_send_logs` (atau memang belum dikirim padahal sudah
   * lewat tanggalnya). Tujuan: highlight gap supaya admin bisa
   * resend manual atau cek dispatcher.
   */
  notices: MonitoringNotice[];
}

export interface MonitoringNotice {
  kind:
    | "birthday_marked_no_log"
    | "anniversary_marked_no_log"
    | "birthday_passed_not_greeted"
    | "anniversary_passed_not_greeted"
    | "streak_milestone_no_wa"
    | "no_whatsapp_number";
  message: string;
  date: string | null;
}

/**
 * Web app live mulai 2026-04-16. Sebelum tanggal itu tidak ada
 * dispatcher WA, jadi notice "belum di-greet" untuk event yang
 * tanggalnya < APP_LIVE_DATE di-suppress (false-positive).
 */
const APP_LIVE_DATE = "2026-04-16";

export interface WhatsAppLogEntry {
  id: string;
  eventType: string;
  status: string;
  errorMessage: string | null;
  body: string;
  sentAt: string;
}

function todayIsoInTz(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysUntil(targetIso: string, todayIso: string): number {
  const t = new Date(`${todayIso}T00:00:00Z`).getTime();
  const x = new Date(`${targetIso}T00:00:00Z`).getTime();
  return Math.round((x - t) / (1000 * 60 * 60 * 24));
}

/**
 * Hitung tanggal MM-DD `dob` di tahun ini (atau next-year kalau sudah
 * lewat). Feb-29 di tahun non-leap → fallback ke Feb-28.
 */
/**
 * Tanggal occurrence di tahun berjalan (tidak roll-forward ke next
 * year), untuk cek "sudah lewat di tahun ini?". Feb-29 → Feb-28 di
 * non-leap.
 */
function sameYearOccurrence(mmdd: string, todayIso: string): string | null {
  const [, m, d] = mmdd.split("-").map(Number);
  if (!m || !d) return null;
  const yearNow = Number(todayIso.slice(0, 4));
  const isLeap =
    (yearNow % 4 === 0 && yearNow % 100 !== 0) || yearNow % 400 === 0;
  const day = m === 2 && d === 29 && !isLeap ? 28 : d;
  const month = m === 2 && d === 29 && !isLeap ? 2 : m;
  return `${yearNow}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextOccurrence(mmdd: string, todayIso: string): {
  thisYear: string;
  daysAhead: number;
} {
  const [, m, d] = mmdd.split("-").map(Number);
  const todayDate = new Date(`${todayIso}T00:00:00Z`);
  const yearNow = todayDate.getUTCFullYear();
  const isLeap =
    (yearNow % 4 === 0 && yearNow % 100 !== 0) || yearNow % 400 === 0;
  const day = m === 2 && d === 29 && !isLeap ? 28 : d;
  const month = m === 2 && d === 29 && !isLeap ? 2 : m;
  let candidate = `${yearNow}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  let days = daysUntil(candidate, todayIso);
  if (days < 0) {
    // Sudah lewat tahun ini → tampilkan tahun depan
    candidate = `${yearNow + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days = daysUntil(candidate, todayIso);
  }
  return { thisYear: candidate, daysAhead: days };
}

/**
 * Hitung streak pakai utility resmi `computeStreak` — calendar gap
 * di-ignore (weekend / off-day diabaikan), hanya `on_time` consecutive
 * yang dihitung. Bukan compare ke today karena karyawan tidak absen
 * setiap kalender (weekend libur), implementasi naive sebelumnya
 * selalu return 0 untuk hampir semua orang.
 */
async function computeCurrentStreak(
  supabase: ReturnType<typeof createClient> extends Promise<infer C> ? C : never,
  userId: string,
  todayIso: string,
  storedPersonalBest: number,
  storedLastMilestone: number
): Promise<number> {
  const { data } = await supabase
    .from("attendance_logs")
    .select("date, status")
    .eq("user_id", userId)
    .lte("date", todayIso)
    .order("date", { ascending: false })
    .limit(120);
  if (!data || data.length === 0) return 0;
  const snap = computeStreak({
    logs: data.map((r) => ({
      date: r.date,
      status: (r.status as
        | "on_time"
        | "late"
        | "late_excused"
        | "flexible"
        | "unknown") ?? "unknown",
    })),
    storedPersonalBest,
    storedLastMilestone,
  });
  return snap.current;
}

export async function listEmployeeMonitoring(): Promise<{
  data: EmployeeMonitoringRow[];
  error?: string;
}> {
  const role = await getCurrentRole();
  if (role !== "admin") return { data: [], error: "Forbidden" };
  const supabase = await createClient();

  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select(
      "id, full_name, nickname, whatsapp_number, role, date_of_birth, first_day_of_work, birthday_last_greeted, anniversary_last_greeted, streak_personal_best, streak_last_milestone"
    )
    .neq("role", "admin")
    .order("full_name");
  if (profErr) return { data: [], error: profErr.message };

  // Settings buat timezone
  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("timezone")
    .limit(1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const todayIso = todayIsoInTz(tz);
  const yearNow = Number(todayIso.slice(0, 4));

  // Batched WA logs: ambil 5 terakhir per profile via
  // window-function. Pakai SQL raw via RPC akan terlalu rumit; cukup
  // pull semua log yang event-nya birthday/anniversary, lalu group
  // di JS.
  const { data: waLogs } = await supabase
    .from("whatsapp_send_logs")
    .select("id, recipient_profile_id, event_type, status, error_message, message_body, sent_at")
    .in("event_type", [
      "birthday",
      "anniversary",
      "streak_milestone",
      "celebration_greeting_notification",
    ])
    .order("sent_at", { ascending: false })
    .limit(800);

  const waByProfile = new Map<string, WhatsAppLogEntry[]>();
  for (const log of waLogs ?? []) {
    if (!log.recipient_profile_id) continue;
    const arr = waByProfile.get(log.recipient_profile_id) ?? [];
    if (arr.length >= 10) continue;
    arr.push({
      id: log.id,
      eventType: log.event_type,
      status: log.status,
      errorMessage: log.error_message,
      body: log.message_body,
      sentAt: log.sent_at,
    });
    waByProfile.set(log.recipient_profile_id, arr);
  }

  // Untuk tiap profile, compute streak (paralel max 8 sekaligus
  // supaya tidak nge-flood DB).
  const rows: EmployeeMonitoringRow[] = [];
  const concurrency = 8;
  let idx = 0;
  type ProfileRow = NonNullable<typeof profiles>[number];
  async function processOne(p: ProfileRow) {
    const streak = await computeCurrentStreak(
      supabase,
      p.id,
      todayIso,
      p.streak_personal_best ?? 0,
      p.streak_last_milestone ?? 0
    );

    let birthdayThisYear: string | null = null;
    let daysToBirthday: number | null = null;
    if (p.date_of_birth) {
      const occ = nextOccurrence(p.date_of_birth, todayIso);
      birthdayThisYear = occ.thisYear;
      daysToBirthday = occ.daysAhead;
    }

    let anniversaryThisYear: string | null = null;
    let daysToAnniversary: number | null = null;
    let yearsOfService = 0;
    if (p.first_day_of_work) {
      const occ = nextOccurrence(p.first_day_of_work, todayIso);
      anniversaryThisYear = occ.thisYear;
      daysToAnniversary = occ.daysAhead;
      const startYear = Number(p.first_day_of_work.slice(0, 4));
      yearsOfService = Math.max(0, yearNow - startYear);
    }

    // Detect missing WA log notices.
    const notices: MonitoringNotice[] = [];
    const profLogs = waByProfile.get(p.id) ?? [];

    // Nomor WhatsApp belum di-setup → semua dispatcher (birthday,
    // anniversary, streak) tidak punya target. Notice paling
    // priority karena root cause WA-related notices lain.
    if (!p.whatsapp_number || !p.whatsapp_number.trim()) {
      notices.push({
        kind: "no_whatsapp_number",
        message:
          "Nomor WhatsApp belum di-setup di profile. Tidak ada WA otomatis (ulang tahun / anniversary / streak) yang bisa dikirim ke karyawan ini.",
        date: null,
      });
    }
    const hasBirthdayLogIso = (iso: string) =>
      profLogs.some(
        (l) => l.eventType === "birthday" && l.sentAt.slice(0, 10) === iso
      );
    const hasAnniversaryLogIso = (iso: string) =>
      profLogs.some(
        (l) => l.eventType === "anniversary" && l.sentAt.slice(0, 10) === iso
      );

    // Birthday: kalau profile tag birthday_last_greeted tapi tidak
    // ada log → dispatcher fired sebelum logging hidup.
    if (p.birthday_last_greeted) {
      if (
        p.birthday_last_greeted >= APP_LIVE_DATE &&
        !hasBirthdayLogIso(p.birthday_last_greeted)
      ) {
        notices.push({
          kind: "birthday_marked_no_log",
          message: `Birthday WA dicatat terkirim ${p.birthday_last_greeted} tapi tidak ada di log.`,
          date: p.birthday_last_greeted,
        });
      }
    } else if (p.date_of_birth) {
      // Belum di-greet sama sekali, tapi cek apakah ulang tahun di
      // tahun berjalan sudah lewat. Kalau iya → harusnya sudah kirim.
      // Skip kalau ulang tahunnya sebelum APP_LIVE_DATE — dispatcher
      // belum hidup, wajar tidak ada log.
      const occThisYear = sameYearOccurrence(p.date_of_birth, todayIso);
      if (
        occThisYear &&
        occThisYear < todayIso &&
        occThisYear >= APP_LIVE_DATE
      ) {
        notices.push({
          kind: "birthday_passed_not_greeted",
          message: `Ulang tahun ${occThisYear} sudah lewat tapi WA belum tercatat dikirim.`,
          date: occThisYear,
        });
      }
    }

    // Anniversary: same logic + same APP_LIVE_DATE guard.
    if (p.anniversary_last_greeted) {
      if (
        p.anniversary_last_greeted >= APP_LIVE_DATE &&
        !hasAnniversaryLogIso(p.anniversary_last_greeted)
      ) {
        notices.push({
          kind: "anniversary_marked_no_log",
          message: `Anniversary WA dicatat terkirim ${p.anniversary_last_greeted} tapi tidak ada di log.`,
          date: p.anniversary_last_greeted,
        });
      }
    } else if (p.first_day_of_work) {
      const occThisYear = sameYearOccurrence(p.first_day_of_work, todayIso);
      if (
        occThisYear &&
        occThisYear < todayIso &&
        occThisYear >= APP_LIVE_DATE &&
        yearsOfService > 0
      ) {
        notices.push({
          kind: "anniversary_passed_not_greeted",
          message: `Anniversary ${occThisYear} sudah lewat tapi WA belum tercatat dikirim.`,
          date: occThisYear,
        });
      }
    }

    // Streak milestone WA: dua case warning.
    //   (a) streak.current >= 5 tapi `streak_last_milestone` < 5 →
    //       dispatcher belum jalan sama sekali untuk user ini.
    //   (b) `streak_last_milestone` >= 5 (sudah crossed) tapi tidak
    //       ada log streak_milestone → dispatcher fired sebelum
    //       logging ada, atau insert log gagal.
    const lastMs = p.streak_last_milestone ?? 0;
    const hasStreakLog = profLogs.some((l) => l.eventType === "streak_milestone");
    if (streak >= 5 && lastMs < 5) {
      notices.push({
        kind: "streak_milestone_no_wa",
        message: `Streak ${streak} hari sudah lewat threshold milestone (5) tapi WA milestone belum dikirim sama sekali.`,
        date: null,
      });
    } else if (lastMs >= 5 && !hasStreakLog) {
      notices.push({
        kind: "streak_milestone_no_wa",
        message: `Milestone ${lastMs} hari sudah dicatat di profile tapi tidak ada log WA streak_milestone untuk karyawan ini.`,
        date: null,
      });
    }

    rows.push({
      id: p.id,
      fullName: p.full_name ?? "",
      nickname: p.nickname,
      whatsappNumber: p.whatsapp_number,
      streakCurrent: streak,
      streakPersonalBest: p.streak_personal_best ?? 0,
      streakLastMilestone: p.streak_last_milestone ?? 0,
      dateOfBirth: p.date_of_birth,
      birthdayThisYear,
      daysToBirthday,
      birthdayLastGreeted: p.birthday_last_greeted,
      firstDayOfWork: p.first_day_of_work,
      anniversaryThisYear,
      daysToAnniversary,
      anniversaryLastGreeted: p.anniversary_last_greeted,
      yearsOfService,
      recentWa: profLogs,
      notices,
    });
  }
  while (idx < (profiles?.length ?? 0)) {
    const batch = (profiles ?? []).slice(idx, idx + concurrency);
    await Promise.all(batch.map(processOne));
    idx += concurrency;
  }

  // Sort by upcoming celebration: birthday/anniversary terdekat
  // dulu supaya admin langsung lihat siapa yang butuh perhatian.
  rows.sort((a, b) => {
    const aSoon = Math.min(
      a.daysToBirthday ?? 365,
      a.daysToAnniversary ?? 365
    );
    const bSoon = Math.min(
      b.daysToBirthday ?? 365,
      b.daysToAnniversary ?? 365
    );
    if (aSoon !== bSoon) return aSoon - bSoon;
    return a.fullName.localeCompare(b.fullName);
  });

  return { data: rows };
}

/**
 * Cari karyawan yang ulang tahunnya jatuh hari ini di timezone admin.
 * MM-DD comparison; Feb-29 fallback ke Feb-28 di non-leap year.
 */
async function findTodaysBirthdayCelebrants(): Promise<
  Array<{ id: string; full_name: string; nickname: string | null }>
> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("timezone")
    .limit(1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const todayIso = todayIsoInTz(tz);
  const [, mStr, dStr] = todayIso.split("-");
  const mmdd = `${mStr}-${dStr}`;

  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, nickname, date_of_birth")
    .neq("role", "admin")
    .not("date_of_birth", "is", null);

  const celebrants: Array<{ id: string; full_name: string; nickname: string | null }> = [];
  for (const p of profs ?? []) {
    if (!p.date_of_birth) continue;
    const [, pm, pd] = p.date_of_birth.split("-").map(Number);
    let mm = pm;
    let dd = pd;
    if (mm === 2 && dd === 29) {
      const yearNow = Number(todayIso.slice(0, 4));
      const isLeap =
        (yearNow % 4 === 0 && yearNow % 100 !== 0) || yearNow % 400 === 0;
      if (!isLeap) {
        mm = 2;
        dd = 28;
      }
    }
    const profMmdd = `${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    if (profMmdd === mmdd) {
      celebrants.push({
        id: p.id,
        full_name: p.full_name ?? "",
        nickname: p.nickname,
      });
    }
  }
  return celebrants;
}

/**
 * Preview message broadcast tanpa kirim — dipakai dialog konfirmasi
 * di `BirthdayBroadcastButton` supaya admin lihat persis copy yang
 * akan terkirim (sesuai template terbaru di /admin/settings).
 */
export async function previewBirthdayBroadcast(): Promise<{
  message: string;
  celebrantCount: number;
}> {
  const role = await getCurrentRole();
  if (role !== "admin") return { message: "", celebrantCount: 0 };
  const celebrants = await findTodaysBirthdayCelebrants();
  if (celebrants.length === 0) return { message: "", celebrantCount: 0 };
  const celebrantNames = celebrants
    .map((c) => c.nickname || c.full_name || "teman")
    .join(", ");
  // Preview pakai nama placeholder umum untuk recipient. Saat
  // benar-benar broadcast, recipientName diisi per-target dari nama
  // masing-masing penerima.
  const message = await renderWaTemplate("celebration_birthday_broadcast", {
    recipientName: "(nama penerima)",
    celebrantNames,
    count: celebrants.length,
  });
  return { message, celebrantCount: celebrants.length };
}

export interface BroadcastResult {
  ok: boolean;
  error?: string;
  /** List karyawan yang ulang tahunnya hari ini. */
  celebrants?: Array<{ id: string; name: string }>;
  /** Jumlah pesan WA yang berhasil terkirim. */
  sentCount?: number;
  /** Jumlah pesan yang gagal (error_message di-log). */
  failedCount?: number;
  /** Total target karyawan (yang punya whatsapp_number valid). */
  targetCount?: number;
  /**
   * Jumlah karyawan yang di-skip karena sudah pernah post greeting
   * untuk salah satu celebrant hari ini di dashboard. Dipakai admin
   * sebagai indikator "broadcast nge-target {N} orang lain yang
   * belum ngucapin".
   */
  skippedAlreadyGreetedCount?: number;
}

/**
 * Admin broadcast: pesan WA ke SELURUH karyawan yang punya nomor WA
 * memberitahukan bahwa ada karyawan ulang tahun hari ini, ajak ucapin
 * via Zota app. Dipakai admin sebagai nudge supaya feed celebration di
 * dashboard tidak sepi.
 *
 * Setiap pesan terkirim di-log ke `whatsapp_send_logs` dengan
 * `event_type = 'other'` (bukan birthday/anniversary) — itu untuk
 * recipient yang BUKAN sang celebrant. Tujuannya: log buat audit, tapi
 * tidak duplikat dengan dispatcher pagi yang menargetkan celebrant.
 */
export async function broadcastBirthdayReminder(): Promise<BroadcastResult> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const celebrants = await findTodaysBirthdayCelebrants();
  if (celebrants.length === 0) {
    return {
      ok: false,
      error: "Tidak ada karyawan yang berulang tahun hari ini.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Service role key belum di-konfigurasi." };
  }
  const admin = createAdminClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: recipients } = await admin
    .from("profiles")
    .select("id, full_name, nickname, whatsapp_number")
    .neq("role", "admin");

  // Karyawan yang sudah ngucapin di dashboard untuk SALAH SATU
  // celebrant hari ini → di-skip dari broadcast. Cek event_type
  // birthday + event_year tahun ini + kind 'greeting'.
  const yearNow = Number(new Date().toISOString().slice(0, 4));
  const celebrantIds = celebrants.map((c) => c.id);
  const { data: greetedRows } = await admin
    .from("celebration_messages")
    .select("author_id")
    .in("celebrant_id", celebrantIds)
    .eq("event_type", "birthday")
    .eq("event_year", yearNow)
    .eq("kind", "greeting");
  const alreadyGreeted = new Set(
    (greetedRows ?? []).map((r) => r.author_id)
  );

  type Target = {
    id: string;
    phone: string;
    name: string;
  };
  const targets: Target[] = (recipients ?? [])
    .map((p) => {
      // Karyawan yang sudah ngucapin tidak perlu di-nag lagi.
      if (alreadyGreeted.has(p.id)) return null;
      // Celebrant juga di-skip — tidak perlu di-suruh ngucapin diri
      // sendiri (mereka sudah dapat birthday morning WA).
      if (celebrantIds.includes(p.id)) return null;
      const phone = normalizePhone(p.whatsapp_number ?? "");
      if (!phone) return null;
      return {
        id: p.id,
        phone,
        name: p.nickname || p.full_name || "teman",
      };
    })
    .filter((t): t is Target => t !== null);

  if (targets.length === 0) {
    return {
      ok: false,
      error: "Tidak ada karyawan dengan nomor WA valid sebagai target.",
    };
  }

  // Body di-render PER recipient supaya {recipientName} personalize.
  // {celebrantNames} sama untuk semua karena celebrant hari itu sama.
  const celebrantNames = celebrants
    .map((c) => c.nickname || c.full_name || "teman")
    .join(", ");

  let sent = 0;
  let failed = 0;
  for (const t of targets) {
    const message = await renderWaTemplate("celebration_birthday_broadcast", {
      recipientName: t.name,
      celebrantNames,
      count: celebrants.length,
    });
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | null = null;
    try {
      await sendWhatsApp(t.phone, message);
      sent++;
    } catch (err) {
      failed++;
      status = "failed";
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    try {
      await admin.from("whatsapp_send_logs").insert({
        recipient_profile_id: t.id,
        recipient_phone: t.phone,
        event_type: "other",
        message_body: message,
        status,
        error_message: errorMessage,
      });
    } catch (err) {
      console.error("[broadcast] log insert failed", err);
    }
  }

  return {
    ok: true,
    celebrants: celebrants.map((c) => ({
      id: c.id,
      name: c.nickname || c.full_name || "",
    })),
    sentCount: sent,
    failedCount: failed,
    targetCount: targets.length,
    skippedAlreadyGreetedCount: alreadyGreeted.size,
  };
}
