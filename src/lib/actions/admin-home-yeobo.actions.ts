"use server";

import { canViewRevenueDashboard } from "@/lib/revenue-dashboard/access";
import { getCurrentRole } from "@/lib/supabase/cached";
import { yeoboAdminClient } from "@/lib/supabase/yeobo-admin";
import { jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Omzet Yeobo Space LIVE, dibaca dari database yeobospace.id (schema `yeobo`),
 * bukan dari mutasi Mayar di cashflow.
 *
 * Kenapa: transaksi Mayar baru masuk ke cashflow setelah settle (±2–4 hari),
 * jadi hari ini/kemarin selalu kosong. Booking di yeobospace.id tercatat saat
 * dibayar (`paid_at`), jadi angkanya berjalan.
 *
 * DEFINISI: booking `confirmed` (per `paid_at`, tanggal Jakarta) + amendment
 * (tambahan cetak/waktu/add-on) berstatus `paid`, dinyatakan NET setelah fee
 * Mayar supaya sebanding dengan omzet di bank / P&L (yang memakai kredit net
 * Mayar). Fee hanya dipotong untuk pembayaran yang benar-benar lewat Mayar:
 * booking `online` dan amendment berprovider `mayar`. Tunai / voucher /
 * amendment non-Mayar tidak dipotong — uangnya memang tidak lewat Mayar.
 * Sisa selisih vs mutasi bank berasal dari pembayaran non-Mayar itu, bukan fee.
 * Booking yang dibatalkan SETELAH dibayar (paid_at terisi) ikut dibaca dan
 * dikurangi `refund_amount_idr`, jadi pembatalan dengan refund sebagian
 * tidak menghapus seluruh omzetnya. Per 22 Sep 2026 belum ada yang begitu.
 */

/**
 * Fee Mayar QRIS = 1,5% platform + ±0,7% channel = 2,2%. Diukur dari catatan
 * mutasi Mayar 1–10 Sep 2026: 236 transaksi, gross Rp25.503.000 → net
 * Rp24.942.283 (2,20%). Semua QRIS; kalau kelak ada channel lain (VA,
 * e-wallet) tarifnya berbeda dan konstanta ini perlu dibuat per channel.
 */
const MAYAR_FEE_RATE = 0.022;

export interface YeoboRevenueBranch {
  id: string;
  label: string;
  today: number;
  month: number;
  /** Bulan lalu pada rentang tanggal sama s.d. kemarin; null = tak bisa dibandingkan. */
  prevSameRange: number | null;
  /** Bulan lalu PENUH (selalu lengkap, tak ada hari parsial) — basis
   *  pembanding buat mode proyeksi run-rate: "kalau pace ini diterusin,
   *  ngalahin bulan lalu secara keseluruhan atau tidak?". Beda dari
   *  `prevSameRange` yang basisnya rentang tanggal sama (buat angka MTD
   *  aktual vs aktual). */
  prevMonthFull: number;
  /** Jumlah booking (BUKAN termasuk baris amendment) — dipakai buat AOV.
   *  Amendment cuma nambah nilai booking yang sudah ada, bukan order baru. */
  todayCount: number;
  monthCount: number;
  prevSameRangeCount: number | null;
}

export interface YeoboRevenue {
  branches: YeoboRevenueBranch[];
  /** Waktu (ISO) pembayaran terbaru yang terbaca — penanda kesegaran data. */
  latestPaidAt: string | null;
  /** Rentang pembanding, mis. "1–20 Agu"; null = tak ada pembanding. */
  prevLabel: string | null;
  /** Label bulan lalu penuh, mis. "Agu 2026" — pasangan `prevMonthFull`. */
  prevMonthFullLabel: string;
}

const BRANCHES: Array<{ id: string; label: string }> = [
  // Nama singkat sesuai sebutan tim.
  { id: "tlogosari", label: "Yeosari" },
  { id: "tembalang", label: "Yeotem" },
  { id: "jebres", label: "Yeosol" },
];

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export async function getYeoboSpaceRevenue(): Promise<YeoboRevenue | null> {
  if (!(await canViewRevenueDashboard("yeobo"))) return null;

  const todayIso = jakartaDateString(new Date());
  const [y, m, d] = todayIso.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;

  const cmpDays = d - 1;
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const prevStart = `${py}-${String(pm).padStart(2, "0")}-01`;
  const prevMonthDays = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const canCompare = cmpDays >= 1 && cmpDays <= prevMonthDays;
  const prevCutoff = canCompare
    ? new Date(Date.UTC(py, pm - 1, 1 + cmpDays)).toISOString().slice(0, 10)
    : prevStart;

  const yeobo = yeoboAdminClient();
  // Jakarta tanpa DST → offset tetap +07:00.
  const fromIso = `${prevStart}T00:00:00+07:00`;

  type Row = { branch_id: string; amt: number; paid_at: string; isBooking: boolean };
  const rows: Row[] = [];

  const fetchAll = async (
    table: "bookings" | "booking_amendments",
    amountCol: string,
    statusIn: string[],
    /** true bila baris ini dibayar lewat Mayar (kena fee). */
    viaMayar: (r: Record<string, unknown>) => boolean
  ) => {
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      // ORDER BY unik sebelum .range() — tanpa itu paginasi bisa melewatkan
      // dan menggandakan baris (lihat catatan serupa di admin-home.actions).
      const { data, error } = await yeobo
        .from(table)
        .select(
          table === "bookings"
            ? `id, branch_id, paid_at, payment_method, refund_amount_idr, ${amountCol}`
            : `id, branch_id, paid_at, provider, ${amountCol}`
        )
        .in("status", statusIn)
        .gte("paid_at", fromIso)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const r of page) {
        if (!r.paid_at) continue;
        rows.push({
          branch_id: String(r.branch_id),
          amt:
            (Number(r[amountCol] ?? 0) - Number(r.refund_amount_idr ?? 0)) *
            (viaMayar(r) ? 1 - MAYAR_FEE_RATE : 1),
          paid_at: String(r.paid_at),
          isBooking: table === "bookings",
        });
      }
      if (page.length < PAGE) break;
    }
  };

  try {
    await Promise.all([
      fetchAll(
        "bookings",
        "total_amount_idr",
        ["confirmed", "cancelled"],
        (r) => r.payment_method === "online"
      ),
      fetchAll(
        "booking_amendments",
        "diff_idr",
        ["paid"],
        (r) => r.provider === "mayar"
      ),
    ]);
  } catch {
    // Sumber eksternal gagal → Home tetap tampil; kartu menyembunyikan barisnya.
    return null;
  }

  const acc = new Map<
    string,
    {
      today: number;
      month: number;
      prev: number;
      prevFull: number;
      todayCount: number;
      monthCount: number;
      prevCount: number;
    }
  >(
    BRANCHES.map((b) => [
      b.id,
      { today: 0, month: 0, prev: 0, prevFull: 0, todayCount: 0, monthCount: 0, prevCount: 0 },
    ])
  );
  let latest: string | null = null;
  for (const r of rows) {
    const a = acc.get(r.branch_id);
    if (!a) continue;
    if (!latest || r.paid_at > latest) latest = r.paid_at;
    const date = jakartaDateString(new Date(r.paid_at));
    if (date >= monthStart) {
      a.month += r.amt;
      if (r.isBooking) a.monthCount++;
      if (date === todayIso) {
        a.today += r.amt;
        if (r.isBooking) a.todayCount++;
      }
    } else if (date >= prevStart) {
      // Bulan lalu PENUH (selalu, tak digerbang canCompare — beda dari
      // `prev` rentang-sama di bawah yang cuma valid kalau canCompare).
      a.prevFull += r.amt;
      if (canCompare && date < prevCutoff) {
        a.prev += r.amt;
        if (r.isBooking) a.prevCount++;
      }
    }
  }

  return {
    branches: BRANCHES.map((b) => {
      const a = acc.get(b.id)!;
      return {
        id: b.id,
        label: b.label,
        today: a.today,
        month: a.month,
        prevSameRange: canCompare ? a.prev : null,
        prevMonthFull: a.prevFull,
        todayCount: a.todayCount,
        monthCount: a.monthCount,
        prevSameRangeCount: canCompare ? a.prevCount : null,
      };
    }),
    latestPaidAt: latest,
    prevLabel: canCompare
      ? cmpDays === 1
        ? `1 ${MONTHS_ID[pm - 1]}`
        : `1–${cmpDays} ${MONTHS_ID[pm - 1]}`
      : null,
    prevMonthFullLabel: `${MONTHS_ID[pm - 1]} ${py}`,
  };
}

/**
 * Utilisasi slot Yeobo Space per cabang: Booked ÷ (Booked + ActiveUnbooked)
 * dalam menit, dibaca dari view `yeobo.v_slot_utilization_daily` (migrasi
 * 161/162) dan dijumlah lintas pool (shared+large untuk Tembalang/
 * Tlogosari; Jebres sudah satu pool). ActiveUnbooked sudah mengecualikan
 * menit yang kepakai buffer/tabrakan ruangan — lihat diskusi di percakapan
 * yang menghasilkan migrasi itu.
 *
 * Tiga angka per cabang, meniru pola `getYeoboSpaceRevenue`:
 *   - prevMonthPct: bulan lalu PENUH (selalu lengkap, tak ada hari parsial).
 *   - curMonthToDatePct: bulan ini s.d. KEMARIN (hari ini sengaja
 *     dikecualikan — beda dari Omzet yang boleh akumulasi parsial, di sini
 *     "tersedia" hari ini sudah dihitung penuh 1 hari sementara "booked"-nya
 *     baru sebagian, jadi ikut hari ini akan bikin rasionya bias rendah).
 *   - prevSameRangePct: bulan lalu pada rentang tanggal SAMA s.d. kemarin —
 *     basis pembanding adil untuk curMonthToDatePct (bulan lalu penuh vs
 *     bulan ini parsial itu bukan apple-to-apple).
 *
 * Superadmin-only (beda dari Omzet yang juga bisa di-share ke viewer
 * non-admin) — cek role langsung, bukan `canViewRevenueDashboard`.
 */
export interface YeoboUtilizationBranch {
  id: string;
  label: string;
  prevMonthPct: number | null;
  curMonthToDatePct: number | null;
  prevSameRangePct: number | null;
}

export interface YeoboUtilization {
  branches: YeoboUtilizationBranch[];
  prevMonthLabel: string;
  /** null = belum ada hari lengkap bulan ini (hari pertama bulan berjalan). */
  curMonthLabel: string | null;
  prevSameRangeLabel: string | null;
}

export async function getYeoboSlotUtilization(): Promise<YeoboUtilization | null> {
  if ((await getCurrentRole()) !== "admin") return null;

  const todayIso = jakartaDateString(new Date());
  const [y, m, d] = todayIso.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad2(m)}-01`;

  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const prevStart = `${py}-${pad2(pm)}-01`;
  const prevMonthDays = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const prevEnd = `${py}-${pad2(pm)}-${pad2(prevMonthDays)}`;

  const cmpDays = d - 1; // hari lengkap bulan ini, tidak termasuk hari ini
  const curEnd = cmpDays >= 1 ? `${y}-${pad2(m)}-${pad2(cmpDays)}` : null;
  const canCompare = cmpDays >= 1 && cmpDays <= prevMonthDays;
  const prevSameEnd = canCompare ? `${py}-${pad2(pm)}-${pad2(cmpDays)}` : null;

  const yeobo = yeoboAdminClient();
  const upper = curEnd ?? prevEnd; // curEnd (bulan ini) selalu > prevEnd bila ada
  const { data, error } = await yeobo
    .from("v_slot_utilization_daily")
    .select("branch_id, booking_date, booked_min, active_unbooked_min")
    .gte("booking_date", prevStart)
    .lte("booking_date", upper);
  if (error) {
    // Jangan hilang diam-diam (lihat migrasi 163: view ini sempat gagal
    // permission-denied karena belum di-GRANT ke service_role, dan
    // ketangkep .catch(() => null) di page.tsx tanpa jejak apa pun).
    console.error("getYeoboSlotUtilization:", error.message);
    return null;
  }

  type Row = { branch_id: string; booking_date: string; booked_min: number; active_unbooked_min: number };
  const rows = (data ?? []) as unknown as Row[];

  const sumRange = (branchId: string, start: string, end: string | null): number | null => {
    if (!end) return null;
    let booked = 0;
    let unbooked = 0;
    let any = false;
    for (const r of rows) {
      if (r.branch_id !== branchId || r.booking_date < start || r.booking_date > end) continue;
      booked += r.booked_min;
      unbooked += r.active_unbooked_min;
      any = true;
    }
    if (!any || booked + unbooked === 0) return null;
    return Math.round(((100 * booked) / (booked + unbooked)) * 10) / 10;
  };

  const label = (days: number, monthIdx: number) =>
    days === 1 ? `1 ${MONTHS_ID[monthIdx]}` : `1–${days} ${MONTHS_ID[monthIdx]}`;

  return {
    branches: BRANCHES.map((b) => ({
      id: b.id,
      label: b.label,
      prevMonthPct: sumRange(b.id, prevStart, prevEnd),
      curMonthToDatePct: sumRange(b.id, monthStart, curEnd),
      prevSameRangePct: canCompare ? sumRange(b.id, prevStart, prevSameEnd) : null,
    })),
    prevMonthLabel: `${MONTHS_ID[pm - 1]} ${py}`,
    curMonthLabel: curEnd ? label(cmpDays, m - 1) : null,
    prevSameRangeLabel: canCompare ? label(cmpDays, pm - 1) : null,
  };
}
