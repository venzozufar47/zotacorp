"use server";

import { canViewRevenueDashboard } from "@/lib/revenue-dashboard/access";
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
}

export interface YeoboRevenue {
  branches: YeoboRevenueBranch[];
  /** Waktu (ISO) pembayaran terbaru yang terbaca — penanda kesegaran data. */
  latestPaidAt: string | null;
  /** Rentang pembanding, mis. "1–20 Agu"; null = tak ada pembanding. */
  prevLabel: string | null;
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

  type Row = { branch_id: string; amt: number; paid_at: string };
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

  const acc = new Map<string, { today: number; month: number; prev: number }>(
    BRANCHES.map((b) => [b.id, { today: 0, month: 0, prev: 0 }])
  );
  let latest: string | null = null;
  for (const r of rows) {
    const a = acc.get(r.branch_id);
    if (!a) continue;
    if (!latest || r.paid_at > latest) latest = r.paid_at;
    const date = jakartaDateString(new Date(r.paid_at));
    if (date >= monthStart) {
      a.month += r.amt;
      if (date === todayIso) a.today += r.amt;
    } else if (canCompare && date >= prevStart && date < prevCutoff) {
      a.prev += r.amt;
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
      };
    }),
    latestPaidAt: latest,
    prevLabel: canCompare
      ? cmpDays === 1
        ? `1 ${MONTHS_ID[pm - 1]}`
        : `1–${cmpDays} ${MONTHS_ID[pm - 1]}`
      : null,
  };
}
