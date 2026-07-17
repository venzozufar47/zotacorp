/**
 * Admin-editable WhatsApp template registry + renderer.
 *
 * Every outbound WA the system sends has a `template_key` registered
 * below. At send time, `renderWaTemplate(key, vars)` looks up the row
 * in `whatsapp_templates`, falls back to the hardcoded default here if
 * no row exists, and interpolates `{placeholder}` tokens with the
 * provided values.
 *
 * Indonesian-only by policy. Admin can customize copy per template from
 * the Whatsapp tab in /admin/settings.
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type TemplateKey =
  | "celebration_birthday_morning"
  | "celebration_anniversary_morning"
  | "celebration_greeting_notification"
  | "celebration_birthday_broadcast"
  | "celebration_anniversary_broadcast"
  | "disc_test_push"
  | "streak_milestone"
  | "payslip_paid_notification"
  | "attendance_check_in_alert"
  | "attendance_check_out_alert"
  | "yeobo_booth_reminder_h7"
  | "yeobo_booth_reminder_h3"
  | "yeobo_booth_reminder_h1"
  | "yeobo_booth_reminder_generic"
  | "yeobo_booth_reminder_generic_space_rent"
  | "ticket_new_alert"
  | "ticket_escalated_alert"
  | "ticket_resolved_alert"
  | "ticket_returned_alert"
  | "ticket_reopened_alert"
  | "ticket_active_reminder";

export interface PlaceholderInfo {
  key: string;
  description: string;
}

export interface TemplateMeta {
  /** Human-readable name shown in admin UI. */
  label: string;
  /** One-sentence description of when this fires. */
  description: string;
  /** Who receives this WA — for admin context. */
  recipient: string;
  /** Ordered list of placeholder tokens available in the body. */
  placeholders: PlaceholderInfo[];
  /** Fallback body used when no row exists in `whatsapp_templates`. */
  defaultBody: string;
}

/**
 * Registry of all WA templates. Keys match the `template_key` column.
 * Ordering here determines the order cards render in the admin UI.
 */
export const TEMPLATE_DEFAULTS: Record<TemplateKey, TemplateMeta> = {
  celebration_birthday_morning: {
    label: "Ucapan ulang tahun pagi hari",
    description:
      "Dikirim otomatis ke karyawan yang berulang tahun pada pagi harinya (setelah jam 06:00 WIB).",
    recipient: "Yang berulang tahun",
    placeholders: [
      { key: "name", description: "Nama (nickname kalau ada)" },
    ],
    defaultBody:
      "🎂 Selamat ulang tahun, {name}! Semoga tahun ini penuh hal baik. — Tim Zota",
  },
  celebration_anniversary_morning: {
    label: "Ucapan anniversary kerja",
    description:
      "Dikirim otomatis ke karyawan yang merayakan tahun masuk kerja (anniversary). Berlaku baik milestone maupun regular.",
    recipient: "Yang anniversary",
    placeholders: [
      { key: "name", description: "Nama (nickname kalau ada)" },
      { key: "years", description: "Jumlah tahun (1, 2, 3, ...)" },
    ],
    defaultBody:
      "🎉 Selamat {years} tahun di Zota, {name}! Terima kasih untuk kontribusimu.",
  },
  celebration_greeting_notification: {
    label: "Notifikasi ucapan baru",
    description:
      "Dikirim ke celebrant ketika ada coworker yang post greeting baru di kartu perayaannya.",
    recipient: "Yang berulang tahun / anniversary",
    placeholders: [
      { key: "celebrantName", description: "Nama celebrant" },
      { key: "authorName", description: "Nama yang kirim ucapan" },
      {
        key: "eventKind",
        description: "\"ulang tahun\" atau \"anniversary\"",
      },
    ],
    defaultBody:
      "💌 {celebrantName}, ada ucapan {eventKind} baru dari {authorName}!\n\nBuka Zota App buat balas ✨",
  },
  celebration_birthday_broadcast: {
    label: "Broadcast reminder ulang tahun (manual admin)",
    description:
      "Dikirim ke seluruh karyawan saat admin tap tombol Broadcast di tab Monitoring Karyawan. Mengajak ngucapin via Zota App. {recipientName} di-render personal per penerima; {celebrantNames} berisi yang berulang tahun hari itu.",
    recipient: "Semua karyawan dengan nomor WA valid",
    placeholders: [
      {
        key: "recipientName",
        description: "Nama yang menerima pesan (nickname kalau ada)",
      },
      {
        key: "celebrantNames",
        description: "Nama-nama yang ulang tahun hari ini (dipisah koma)",
      },
      { key: "count", description: "Jumlah yang ulang tahun hari ini" },
    ],
    defaultBody:
      "Halo {recipientName}!\n\n🎂 Hari ini {celebrantNames} ulang tahun. Yuk kasih ucapan via Zota App — tinggal buka dashboard dan tulis pesannya. Cukup 30 detik 💌",
  },
  celebration_anniversary_broadcast: {
    label: "Broadcast reminder anniversary kerja (otomatis jam 12)",
    description:
      "Dikirim otomatis (cron jam 12:00 WIB) ke seluruh karyawan yang BELUM ngucapin, mengajak beri ucapan ke rekan yang hari ini merayakan anniversary kerja. {recipientName} personal per penerima; {celebrantNames} berisi yang anniversary hari itu.",
    recipient: "Semua karyawan aktif dengan nomor WA valid (belum ngucapin)",
    placeholders: [
      {
        key: "recipientName",
        description: "Nama yang menerima pesan (nickname kalau ada)",
      },
      {
        key: "celebrantNames",
        description: "Nama-nama yang anniversary hari ini (dipisah koma)",
      },
      { key: "count", description: "Jumlah yang anniversary hari ini" },
    ],
    defaultBody:
      "Halo {recipientName}!\n\n🎉 Hari ini {celebrantNames} merayakan anniversary kerja di Zota. Yuk kasih ucapan lewat Zota App — buka dashboard dan tulis pesannya. Cukup 30 detik 💌",
  },
  disc_test_push: {
    label: "Permintaan tes kepribadian DISC",
    description:
      "Dikirim saat admin menandai (push) karyawan untuk mengambil Tes Kepribadian DISC di Zota App. Slip gaji karyawan terkunci sampai tes selesai.",
    recipient: "Karyawan yang di-push",
    placeholders: [{ key: "name", description: "Nama karyawan (nickname kalau ada)" }],
    defaultBody:
      "Halo {name}! 🧠\n\nKamu diminta mengambil Tes Kepribadian DISC di Zota App. Tesnya singkat (±10 menit) dan hasilnya membantu kamu memahami gaya kerjamu sendiri.\n\nCatatan: slip gaji kamu terkunci sampai tes selesai. Buka Zota App → menu Tes DISC untuk mulai ✨",
  },
  streak_milestone: {
    label: "Streak milestone",
    description:
      "Dikirim ke karyawan saat mencapai milestone streak on-time (5, 10, 20, 30, 60, 100 hari berturut-turut).",
    recipient: "Karyawan yang capai milestone",
    placeholders: [
      { key: "name", description: "Nama karyawan" },
      { key: "days", description: "Jumlah hari milestone (5/10/20/30/60/100)" },
    ],
    defaultBody:
      "🎉 Selamat {name}! Kamu udah {days} hari on-time berturut-turut. Mantap, lanjutkan!",
  },
  payslip_paid_notification: {
    label: "Notifikasi gaji sudah dibayar",
    description:
      "Dikirim ke karyawan saat admin menandai slip gajinya sudah dibayar di tab Pembayaran (satuan maupun massal). Berisi konfirmasi transfer + ucapan terima kasih.",
    recipient: "Karyawan yang gajinya baru ditandai lunas",
    placeholders: [
      { key: "name", description: "Nama karyawan (nickname kalau ada)" },
      { key: "month", description: "Periode gaji (mis. \"Juni 2026\")" },
      { key: "amount", description: "Nominal gaji bersih ter-format (mis. Rp 3.053.161)" },
    ],
    defaultBody:
      "Halo {name} 🙏\n\nGaji kamu untuk periode {month} sebesar {amount} sudah kami transfer. Terima kasih banyak atas kerja keras & dedikasimu bulan ini — kontribusimu sangat berarti buat kami. Tetap sehat & semangat ya! 💙\n\n— Tim Zota",
  },
  attendance_check_in_alert: {
    label: "Alert check-in ke admin",
    description:
      "Dikirim ke semua admin WA (whatsapp_notification_recipients) setiap ada karyawan yang check-in.",
    recipient: "Admin (dari WA notification recipients)",
    placeholders: [
      { key: "fullName", description: "Nama karyawan" },
      { key: "time", description: "Jam check-in (HH:mm)" },
      { key: "location", description: "Nama lokasi / koordinat" },
      {
        key: "note",
        description: "Catatan extra dari karyawan (kosong kalau tidak ada)",
      },
      {
        key: "mapsUrl",
        description:
          "Google Maps link ke koordinat (kosong kalau di dalam radius kantor)",
      },
    ],
    defaultBody: "✅ {fullName} sign in jam {time} dari {location}{note}{mapsUrl}",
  },
  attendance_check_out_alert: {
    label: "Alert check-out ke admin",
    description:
      "Dikirim ke semua admin WA setiap ada karyawan yang check-out.",
    recipient: "Admin (dari WA notification recipients)",
    placeholders: [
      { key: "fullName", description: "Nama karyawan" },
      { key: "time", description: "Jam check-out (HH:mm)" },
      { key: "location", description: "Nama lokasi / koordinat" },
      {
        key: "note",
        description: "Catatan extra dari karyawan",
      },
      {
        key: "mapsUrl",
        description: "Google Maps link (kosong kalau di dalam radius)",
      },
    ],
    defaultBody: "🏁 {fullName} sign out jam {time} dari {location}{note}{mapsUrl}",
  },
  yeobo_booth_reminder_h7: {
    label: "Yeobo Booth — Reminder H-7",
    description:
      "Dikirim 7 hari sebelum sesi photobooth, jam 11:00 WIB. Tujuan: admin/operator Yeobo Booth siap-siap koordinasi awal (konfirmasi tim, alat, transport).",
    recipient: "Admin (dari WA notification recipients)",
    placeholders: [
      { key: "namaKlien", description: "Nama klien" },
      { key: "tanggal", description: "Tanggal sesi (mis. Sen, 1 Jun 2026)" },
      { key: "jamMulai", description: "Jam mulai (HH:mm)" },
      { key: "jamSelesai", description: "Jam selesai (HH:mm)" },
      { key: "lokasi", description: "Lokasi event (kosong kalau tidak diisi)" },
      { key: "freelance", description: "Nama-nama freelance yang ditugaskan" },
      { key: "sisaTagihan", description: "Sisa tagihan dalam IDR formatted" },
    ],
    defaultBody:
      "📸 Reminder H-7 Yeobo Booth\n\nKlien: {namaKlien}\nTanggal: {tanggal}\nJam: {jamMulai}–{jamSelesai} WIB\nLokasi: {lokasi}\nTim: {freelance}\n\nSisa tagihan: {sisaTagihan}\n\nMohon koordinasi awal.",
  },
  yeobo_booth_reminder_h3: {
    label: "Yeobo Booth — Reminder H-3",
    description:
      "Dikirim 3 hari sebelum sesi, jam 11:00 WIB. Tujuan: cek alat + konfirmasi ulang tim freelance.",
    recipient: "Admin (dari WA notification recipients)",
    placeholders: [
      { key: "namaKlien", description: "Nama klien" },
      { key: "tanggal", description: "Tanggal sesi" },
      { key: "jamMulai", description: "Jam mulai" },
      { key: "jamSelesai", description: "Jam selesai" },
      { key: "lokasi", description: "Lokasi event" },
      { key: "freelance", description: "Nama-nama freelance" },
      { key: "sisaTagihan", description: "Sisa tagihan IDR" },
    ],
    defaultBody:
      "📸 Reminder H-3 Yeobo Booth\n\nKlien: {namaKlien}\nTanggal: {tanggal}\nJam: {jamMulai}–{jamSelesai} WIB\nLokasi: {lokasi}\nTim: {freelance}\n\nSisa tagihan: {sisaTagihan}\n\nPastikan alat siap & tim sudah konfirmasi.",
  },
  yeobo_booth_reminder_h1: {
    label: "Yeobo Booth — Reminder H-1",
    description:
      "Dikirim sehari sebelum sesi, jam 11:00 WIB. Tujuan: final check & briefing tim.",
    recipient: "Admin (dari WA notification recipients)",
    placeholders: [
      { key: "namaKlien", description: "Nama klien" },
      { key: "tanggal", description: "Tanggal sesi" },
      { key: "jamMulai", description: "Jam mulai" },
      { key: "jamSelesai", description: "Jam selesai" },
      { key: "lokasi", description: "Lokasi event" },
      { key: "freelance", description: "Nama-nama freelance" },
      { key: "sisaTagihan", description: "Sisa tagihan IDR" },
    ],
    defaultBody:
      "📸 Reminder H-1 Yeobo Booth\n\nBesok: {namaKlien}\n{tanggal}\nJam {jamMulai}–{jamSelesai} WIB\nLokasi: {lokasi}\nTim: {freelance}\n\nSisa tagihan: {sisaTagihan}\n\nFinal check & briefing tim hari ini. Semangat!",
  },
  yeobo_booth_reminder_generic: {
    label: "Yeobo Booth — Reminder (generik)",
    description:
      "Template default untuk semua checkpoint reminder Yeobo Booth yang TIDAK punya pesan custom sendiri. Placeholder {hari} = offset H-berapa. Checkpoint & jam kirim diatur di /admin/yeobo-booth/settings.",
    recipient: "Nomor WA di daftar penerima Yeobo Booth",
    placeholders: [
      { key: "hari", description: "Offset hari (angka di belakang 'H-')" },
      { key: "namaKlien", description: "Nama klien" },
      { key: "tanggal", description: "Tanggal sesi (mis. Sen, 1 Jun 2026)" },
      { key: "jamMulai", description: "Jam mulai (HH:mm)" },
      { key: "jamSelesai", description: "Jam selesai (HH:mm)" },
      { key: "lokasi", description: "Lokasi event (kosong kalau tidak diisi)" },
      { key: "freelance", description: "Nama-nama freelance yang ditugaskan" },
      { key: "sisaTagihan", description: "Sisa tagihan dalam IDR formatted" },
    ],
    defaultBody:
      "📸 Reminder H-{hari} Yeobo Booth\n\nKlien: {namaKlien}\nTanggal: {tanggal}\nJam: {jamMulai}–{jamSelesai} WIB\nLokasi: {lokasi}\nTim: {freelance}\n\nSisa tagihan: {sisaTagihan}\n\nMohon disiapkan ya. 🙏",
  },
  yeobo_booth_reminder_generic_space_rent: {
    label: "Yeobo Booth — Reminder Sewa Space (generik)",
    description:
      "Template default reminder untuk booking tipe Sewa Space (tanpa sisa tagihan). {hari} = offset H-berapa, {jumlahSesi} = jumlah sesi.",
    recipient: "Nomor WA di daftar penerima Yeobo Booth",
    placeholders: [
      { key: "hari", description: "Offset hari (angka di belakang 'H-')" },
      { key: "namaKlien", description: "Nama penyewa" },
      { key: "tanggal", description: "Tanggal sesi" },
      { key: "jamMulai", description: "Jam mulai (HH:mm)" },
      { key: "jamSelesai", description: "Jam selesai (HH:mm)" },
      { key: "lokasi", description: "Lokasi (kosong kalau tidak diisi)" },
      { key: "freelance", description: "Nama-nama freelance yang ditugaskan" },
      { key: "jumlahSesi", description: "Jumlah sesi yang dijadwalkan" },
    ],
    defaultBody:
      "📸 Reminder H-{hari} Sewa Space Yeobo Booth\n\nPenyewa: {namaKlien}\nTanggal: {tanggal}\nJam: {jamMulai}–{jamSelesai} WIB\nLokasi: {lokasi}\nTim: {freelance}\n\nJumlah sesi: {jumlahSesi}\n\nSiapkan space & tim ya. 🙏",
  },
  ticket_new_alert: {
    label: "Tiket — laporan baru masuk",
    description:
      "Dikirim ke Kepala Studio saat ada tiket baru dibuat karyawan Yeobo Space.",
    recipient: "Kepala Studio (studio_heads)",
    placeholders: [
      { key: "branch", description: "Cabang studio (Tlogosari/Tembalang/Jebres)" },
      { key: "category", description: "Kategori laporan" },
      { key: "title", description: "Judul tiket" },
    ],
    defaultBody:
      "🎫 Tiket baru — {branch}\n\n{category}: {title}\n\nBuka Zota App → menu Tiket untuk menindaklanjuti. 🙏",
  },
  ticket_escalated_alert: {
    label: "Tiket — eskalasi ke owner",
    description:
      "Dikirim ke owner/admin saat Kepala Studio mengeskalasi sebuah tiket.",
    recipient: "Owner / admin (daftar penerima admin)",
    placeholders: [
      { key: "branch", description: "Cabang studio" },
      { key: "title", description: "Judul tiket" },
      { key: "note", description: "Catatan eskalasi dari Kepala Studio" },
    ],
    defaultBody:
      "⏫ Eskalasi tiket — {branch}\n\n{title}\n\nCatatan Kepala Studio: {note}\n\nBuka Zota App → Tiket untuk ACC atau tolak. 🙏",
  },
  ticket_resolved_alert: {
    label: "Tiket — selesai",
    description: "Dikirim ke pembuat tiket saat tiketnya ditandai selesai.",
    recipient: "Pembuat tiket",
    placeholders: [
      { key: "branch", description: "Cabang studio" },
      { key: "title", description: "Judul tiket yang selesai" },
      { key: "note", description: "Catatan penyelesaian (jika ada)" },
    ],
    defaultBody:
      "✅ Tiket kamu ditandai SELESAI.\n\nTiket: {title} ({branch})\nCatatan: {note}\n\nMohon cek & konfirmasi di Zota App → menu Tiket. Kalau belum beres, tandai 'Belum beres' ya 🙏",
  },
  ticket_returned_alert: {
    label: "Tiket — dikembalikan owner",
    description:
      "Dikirim ke Kepala Studio saat owner menolak eskalasi (tiket dikembalikan untuk dikerjakan sendiri).",
    recipient: "Kepala Studio (studio_heads)",
    placeholders: [
      { key: "title", description: "Judul tiket" },
      { key: "note", description: "Catatan owner" },
    ],
    defaultBody:
      "↩️ Eskalasi ditolak owner — dikerjakan sendiri ya.\n\nTiket: {title}\nCatatan owner: {note}\n\nBuka Zota App → Tiket. 🙏",
  },
  ticket_reopened_alert: {
    label: "Tiket — dibuka kembali oleh pelapor",
    description:
      "Dikirim ke Kepala Studio saat karyawan pelapor menandai tiket yang sudah diselesaikan sebagai 'belum beres' (dibuka kembali).",
    recipient: "Kepala Studio (studio_heads)",
    placeholders: [
      { key: "title", description: "Judul tiket" },
      { key: "note", description: "Catatan pelapor kenapa belum beres" },
    ],
    defaultBody:
      "🔁 Tiket dibuka kembali oleh pelapor — belum beres.\n\nTiket: {title}\nCatatan pelapor: {note}\n\nMohon ditindaklanjuti lagi. Buka Zota App → Tiket. 🙏",
  },
  ticket_active_reminder: {
    label: "Tiket — reminder harian Kepala Studio",
    description:
      "Dikirim tiap hari 11.00 WIB ke Kepala Studio berisi jumlah tiket studio yang masih aktif hari itu, sebagai pengingat untuk segera menyelesaikannya. Tidak dikirim bila tidak ada tiket aktif.",
    recipient: "Kepala Studio (studio_heads)",
    placeholders: [
      { key: "name", description: "Nama/panggilan Kepala Studio" },
      { key: "count", description: "Jumlah tiket aktif (open + in progress) hari ini" },
      { key: "list", description: "Daftar tiket aktif (judul, cabang, kategori; urgent ditandai)" },
    ],
    defaultBody:
      "⏰ Halo {name}!\n\nHari ini ada {count} tiket studio Yeobo Space yang masih aktif & menunggu ditindaklanjuti:\n\n{list}\n\nYuk segera diselesaikan ya 🙏 Buka Zota App → menu Tiket.",
  },
};

export const TEMPLATE_KEYS: TemplateKey[] = Object.keys(
  TEMPLATE_DEFAULTS
) as TemplateKey[];

/**
 * Interpolate `{placeholder}` tokens in a template body. Missing keys
 * render as empty strings — safer than crashing, and lets the caller
 * wire optional tokens (like `{mapsUrl}`) that sometimes have no value.
 */
export function interpolate(
  body: string,
  vars: Record<string, string | number | null | undefined>
): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    const value = v == null ? "" : String(v);
    out = out.split(`{${k}}`).join(value);
  }
  // Strip any unresolved {placeholders} — silent empty is safer than
  // a literal "{foo}" leaking into a message a customer sees.
  out = out.replace(/\{[a-zA-Z0-9_]+\}/g, "");
  return out;
}

/**
 * Internal: build a Supabase client that bypasses RLS. Template lookups
 * and updates don't need to be user-scoped — the dispatchers run from
 * server contexts (server action, cron, event handler) without a user
 * session.
 */
function buildAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient<Database>(url, key);
}

/**
 * Render the given template key with the provided variables. Looks up
 * the admin-customized body in `whatsapp_templates`; falls back to the
 * registry default when no row exists or the DB read fails.
 */
export async function renderWaTemplate(
  key: TemplateKey,
  vars: Record<string, string | number | null | undefined>
): Promise<string> {
  const meta = TEMPLATE_DEFAULTS[key];
  const admin = buildAdmin();
  if (admin) {
    try {
      const { data } = await admin
        .from("whatsapp_templates")
        .select("body")
        .eq("template_key", key)
        .maybeSingle();
      if (data?.body) return interpolate(data.body, vars);
    } catch (err) {
      console.error("[wa-templates] lookup failed", key, err);
    }
  }
  return interpolate(meta.defaultBody, vars);
}

/**
 * List all templates with their current body (customized or default)
 * plus the metadata needed to render the admin UI. Reads via the
 * admin-scoped Postgres client so RLS doesn't filter the response out.
 */
export async function listWaTemplates(): Promise<
  Array<
    TemplateMeta & {
      key: TemplateKey;
      /** True when a customized row exists in DB. */
      isCustomized: boolean;
      /** Current body — customized if set, otherwise the default. */
      body: string;
      updatedAt: string | null;
    }
  >
> {
  const admin = buildAdmin();
  const rows = admin
    ? (
        await admin
          .from("whatsapp_templates")
          .select("template_key, body, updated_at")
      ).data ?? []
    : [];
  const byKey = new Map(rows.map((r) => [r.template_key as TemplateKey, r]));
  return TEMPLATE_KEYS.map((key) => {
    const meta = TEMPLATE_DEFAULTS[key];
    const row = byKey.get(key);
    return {
      ...meta,
      key,
      isCustomized: Boolean(row),
      body: row?.body ?? meta.defaultBody,
      updatedAt: row?.updated_at ?? null,
    };
  });
}
