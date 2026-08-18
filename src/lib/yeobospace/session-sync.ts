/**
 * Menurunkan jumlah sesi foto Yeobo Space dari database booking
 * yeobospace.id, menggantikan penyalinan manual dari spreadsheet.
 *
 * Kenapa bisa tanpa API apa pun: sejak database yeobospace.id pindah ke
 * schema `yeobo` di project ini (Agustus 2026), ini query biasa ke schema
 * lokal lewat `yeoboAdminClient()` — bukan scraping, bukan integrasi pihak
 * ketiga, dan bukan lagi koneksi ke project terpisah.
 *
 * Definisi "sesi" di sini bukan pilihan selera — ia diuji terhadap angka
 * spreadsheet owner: `status='confirmed'`, difilter pada `booking_date`
 * (tanggal SESI, bukan tanggal bayar), `expired` dan `cancelled` dibuang.
 * Hasilnya Mei 2026 cocok 18 dari 18 sel, Juni 16 dari 18 (selisih 3 sesi
 * dari 614). Sisa selisih Juni tidak bisa ditelusuri karena seluruh data
 * sebelum Juli berasal dari satu impor massal — `created_at` semuanya
 * 2026-07-01, sehingga jejak kapan tiap booking dibuat sudah hilang.
 *
 * Walk-in ikut terhitung: `payment_method` di booking memuat `cash`,
 * `voucher`, `transfer`, bahkan `dari youcanbookme` — bukan cuma
 * pembayaran online. Itu sebabnya angkanya bisa cocok penuh di Mei.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { yeoboAdminClient } from "@/lib/supabase/yeobo-admin";

/** branch_id di yeobospace → nama cabang di Zota. */
const BRANCH_MAP: Record<string, string> = {
  tlogosari: "Tlogosari",
  tembalang: "Tembalang",
  jebres: "Jebres",
};

/** Satu baris daun di `yeobo_photo_sessions`. */
interface Leaf {
  studio: string;
  label: string;
  sort: number;
}

/**
 * `party_tier` di booking → baris P&L, per cabang.
 *
 * Sengaja dipetakan per cabang, bukan satu peta global, karena kosakata
 * tier-nya memang berbeda dan perbedaannya bermakna: Tlogosari memakai
 * `self-2` & `self-9-10` sementara Tembalang/Jebres `self-1-2` &
 * `self-9-12`, Tembalang tidak punya studio besar, Jebres tidak punya
 * paket 13-15. Peta global akan menyamarkan itu dan diam-diam membuat
 * label baru di cabang yang tidak seharusnya punya.
 *
 * Label dan `sort` menyalin persis baris yang sudah ada sejak input
 * manual, supaya tidak lahir varian nama yang terpisah di laporan.
 */
const TIER_MAP: Record<string, Record<string, Leaf>> = {
  Tlogosari: {
    "self-2": { studio: "Self Photo Studio", label: "Paket 1-2 orang", sort: 2 },
    "self-3-5": { studio: "Self Photo Studio", label: "Paket 3-5 orang", sort: 3 },
    "self-6-8": { studio: "Self Photo Studio", label: "Paket 6-8 orang", sort: 4 },
    "self-9-10": { studio: "Self Photo Studio", label: "Paket 9-10 orang", sort: 5 },
    large: { studio: "Self Photo Studio Besar", label: "", sort: 7 },
    pas: { studio: "Pas Foto", label: "", sort: 8 },
  },
  Tembalang: {
    "self-1-2": { studio: "Self Photo Studio", label: "Paket 1-2", sort: 2 },
    "self-3-5": { studio: "Self Photo Studio", label: "Paket 3-5", sort: 3 },
    "self-6-8": { studio: "Self Photo Studio", label: "Paket 6-8", sort: 4 },
    "self-9-12": { studio: "Self Photo Studio", label: "Paket 9-12", sort: 5 },
    "self-13-15": { studio: "Self Photo Studio", label: "Paket 13-15", sort: 6 },
    pas: { studio: "Pas Foto", label: "", sort: 7 },
  },
  Jebres: {
    "self-1-2": { studio: "Self Photo Studio", label: "Paket 1-2", sort: 2 },
    "self-3-5": { studio: "Self Photo Studio", label: "Paket 3-5", sort: 3 },
    "self-6-8": { studio: "Self Photo Studio", label: "Paket 6-8", sort: 4 },
    "self-9-12": { studio: "Self Photo Studio", label: "Paket 9-12", sort: 5 },
    large: { studio: "Self Photo Studio Besar", label: "", sort: 7 },
    pas: { studio: "Pas Foto", label: "", sort: 8 },
  },
};

/**
 * Berapa lama setelah bulan berakhir sebelum angkanya dibekukan.
 *
 * Bukan nol, karena pelunasan dan konfirmasi masih menetes beberapa hari
 * setelah bulan lewat. Bukan pula sebulan penuh, karena laporan investor
 * terbit lebih dulu dan angkanya tidak boleh berubah setelah dikirim.
 */
const LOCK_AFTER_DAYS = 10;

const PAGE = 1000;

export interface MonthSyncResult {
  year: number;
  month: number;
  /** Total sesi hasil hitung ulang, per cabang. */
  perBranch: Record<string, number>;
  /** Baris yang ditulis (insert maupun update). */
  written: number;
  /** Baris hasil sync lama yang tidak lagi punya booking → dihapus. */
  deleted: number;
  /** Sel yang dilewati karena sudah dikoreksi admin. */
  manualKept: number;
  /** Bulan ini dikunci pada run ini. */
  locked: boolean;
  /** Terisi bila bulan dilewati sepenuhnya. */
  skipped?: "locked";
}

export interface SessionSyncResult {
  months: MonthSyncResult[];
  /**
   * Tier yang tidak dikenali peta. TIDAK ditulis — dan sengaja dilaporkan
   * keras-keras: paket baru di website yang tidak ditambahkan ke TIER_MAP
   * akan hilang dari P&L tanpa error apa pun kalau hanya didiamkan.
   */
  unmapped: Array<{
    branch: string;
    studioType: string;
    partyTier: string;
    sessions: number;
  }>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Tanggal hari ini di WIB sebagai `YYYY-MM-DD`. */
function wibToday(now: Date): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${pad(month)}-01`;
}

function addMonths(year: number, month: number, delta: number) {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface BookingRow {
  branch_id: string | null;
  studio_type: string | null;
  party_tier: string | null;
}

interface ExistingRow {
  id: string;
  branch: string;
  studio: string;
  package_label: string;
  sessions: number;
  source: string;
  locked_at: string | null;
}

const keyOf = (branch: string, studio: string, label: string) =>
  `${branch}|${studio}|${label}`;

/**
 * @param admin  client service-role project Zota
 * @param opts.dryRun  hitung saja, tanpa menulis apa pun
 * @param opts.now     override waktu, untuk pengujian
 * @param opts.months  jumlah bulan ke belakang yang disegarkan (default 2:
 *                     bulan berjalan + bulan lalu). Bulan yang sudah
 *                     terkunci tetap dilewati berapa pun nilainya.
 */
export async function syncYeoboPhotoSessions(
  admin: SupabaseClient<Database>,
  opts?: { dryRun?: boolean; now?: Date; months?: number }
): Promise<SessionSyncResult> {
  const dryRun = opts?.dryRun ?? false;
  const now = opts?.now ?? new Date();
  const monthCount = Math.max(1, opts?.months ?? 2);

  const yeobo = yeoboAdminClient();
  // Tabel ini belum ada di Database types (lihat yeobo-photo-sessions.actions.ts,
  // yang memakai cast serupa).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zota = admin as any;

  const today = wibToday(now);
  const [ty, tm] = today.split("-").map(Number);

  const result: SessionSyncResult = { months: [], unmapped: [] };

  for (let back = monthCount - 1; back >= 0; back--) {
    const { year, month } = addMonths(ty, tm, -back);
    const from = firstOfMonth(year, month);
    const next = addMonths(year, month, 1);
    const toExclusive = firstOfMonth(next.year, next.month);

    // Baris yang sudah ada untuk bulan ini — dibaca lebih dulu karena
    // menentukan apakah bulan ini boleh disentuh sama sekali.
    const { data: existingData, error: exErr } = await zota
      .from("yeobo_photo_sessions")
      .select("id, branch, studio, package_label, sessions, source, locked_at")
      .eq("period_year", year)
      .eq("period_month", month);
    if (exErr) throw new Error(`baca yeobo_photo_sessions: ${exErr.message}`);
    const existing = (existingData ?? []) as ExistingRow[];

    // Satu baris terkunci mengunci seluruh bulan. Kunci dipasang serentak,
    // jadi campuran terkunci/tidak hanya mungkin kalau admin menambah baris
    // baru setelahnya — dan baris itu pun milik manusia, bukan cron.
    if (existing.some((r) => r.locked_at)) {
      result.months.push({
        year,
        month,
        perBranch: {},
        written: 0,
        deleted: 0,
        manualKept: 0,
        locked: false,
        skipped: "locked",
      });
      continue;
    }

    // WAJIB paginasi. PostgREST memotong hasil di 1.000 baris tanpa error,
    // dan satu bulan sudah menyentuh ~600 booking untuk tiga cabang — cukup
    // dekat ke batas untuk berbahaya begitu bisnisnya tumbuh. Truncation di
    // sini tidak melempar apa pun; ia hanya membuat jumlah sesi kurang, dan
    // angka yang kurang sedikit itu justru yang paling sulit disadari.
    const bookings: BookingRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await yeobo
        .from("bookings")
        .select("branch_id, studio_type, party_tier")
        .gte("booking_date", from)
        .lt("booking_date", toExclusive)
        .eq("status", "confirmed")
        .order("booking_date", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`baca bookings yeobospace: ${error.message}`);
      const rows = (data ?? []) as unknown as BookingRow[];
      bookings.push(...rows);
      if (rows.length < PAGE) break;
    }

    // Hitung per (cabang, tier).
    const counts = new Map<string, number>();
    for (const b of bookings) {
      const branch = BRANCH_MAP[(b.branch_id ?? "").trim().toLowerCase()];
      if (!branch) continue;
      const tier = (b.party_tier ?? "").trim().toLowerCase();
      const k = `${branch}|${tier}|${b.studio_type ?? ""}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const computed = new Map<string, { leaf: Leaf; branch: string; n: number }>();
    const perBranch: Record<string, number> = {};
    for (const [k, n] of counts) {
      const [branch, tier, studioType] = k.split("|");
      const leaf = TIER_MAP[branch]?.[tier];
      if (!leaf) {
        result.unmapped.push({
          branch,
          studioType,
          partyTier: tier,
          sessions: n,
        });
        continue;
      }
      computed.set(keyOf(branch, leaf.studio, leaf.label), { leaf, branch, n });
      perBranch[branch] = (perBranch[branch] ?? 0) + n;
    }

    const byKey = new Map(
      existing.map((r) => [keyOf(r.branch, r.studio, r.package_label), r])
    );

    const toUpsert: Array<Record<string, unknown>> = [];
    let manualKept = 0;
    for (const [k, { leaf, branch, n }] of computed) {
      const prev = byKey.get(k);
      // Sel yang pernah disentuh admin adalah milik admin selamanya.
      if (prev && prev.source === "manual") {
        manualKept += 1;
        continue;
      }
      if (prev && prev.sessions === n) continue; // tidak berubah
      toUpsert.push({
        branch,
        studio: leaf.studio,
        package_label: leaf.label,
        period_year: year,
        period_month: month,
        sessions: n,
        sort_order: leaf.sort,
        source: "booking_sync",
        updated_at: new Date().toISOString(),
      });
    }

    // Baris hasil sync yang bookingnya habis (mis. semua dibatalkan) harus
    // ikut hilang, kalau tidak angka lama tertinggal sebagai hantu. Baris
    // 'manual' tidak pernah dihapus — itu data manusia.
    const staleIds = existing
      .filter(
        (r) =>
          r.source === "booking_sync" &&
          !computed.has(keyOf(r.branch, r.studio, r.package_label))
      )
      .map((r) => r.id);

    // Kunci begitu bulan sudah cukup lama berakhir. Dilakukan pada run yang
    // sama dengan penulisan terakhir, sehingga angka yang dibekukan adalah
    // angka yang baru saja dihitung.
    const shouldLock = today >= addDays(toExclusive, LOCK_AFTER_DAYS);

    if (!dryRun) {
      if (toUpsert.length > 0) {
        const { error } = await zota
          .from("yeobo_photo_sessions")
          .upsert(toUpsert, {
            onConflict: "branch,studio,package_label,period_year,period_month",
          });
        if (error) throw new Error(`tulis sesi ${year}-${month}: ${error.message}`);
      }
      if (staleIds.length > 0) {
        const { error } = await zota
          .from("yeobo_photo_sessions")
          .delete()
          .in("id", staleIds);
        if (error)
          throw new Error(`hapus sesi basi ${year}-${month}: ${error.message}`);
      }
      if (shouldLock) {
        const { error } = await zota
          .from("yeobo_photo_sessions")
          .update({ locked_at: new Date().toISOString() })
          .eq("period_year", year)
          .eq("period_month", month)
          .is("locked_at", null);
        if (error) throw new Error(`kunci ${year}-${month}: ${error.message}`);
      }
    }

    result.months.push({
      year,
      month,
      perBranch,
      written: toUpsert.length,
      deleted: staleIds.length,
      manualKept,
      locked: shouldLock,
    });
  }

  if (result.unmapped.length > 0) {
    console.warn(
      "[yeobo-session-sync] tier tanpa peta — TIDAK masuk P&L:",
      result.unmapped
    );
  }

  return result;
}
