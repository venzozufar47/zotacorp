/**
 * Menetapkan cabang untuk transaksi Mayar dengan mencocokkannya ke booking
 * di database yeobospace.
 *
 * Kenapa perlu: Mayar tidak pernah mengirim cabang. Seluruh transaksinya
 * masuk sebagai branch="All", lalu PnL membaginya rata 1/3 ke tiga cabang.
 * Padahal proporsi sebenarnya jauh dari rata — per Agustus 2026 Tlogosari
 * 43%, Tembalang 31%, Jebres 26%. Untuk Juli saja, bagi rata membuat
 * Tlogosari kekurangan ~5 juta dan Jebres kelebihan ~3,5 juta, dan angka
 * itulah yang dibaca dashboard investor per cabang.
 *
 * Kenapa dicocokkan lewat nama+nominal+tanggal, bukan id: `mayar:<uuid>`
 * yang disimpan Zota berasal dari laporan transaksi Mayar, sedangkan
 * payload webhook di booking menyimpan id payment-link. Dua entitas
 * berbeda di Mayar — tidak pernah sama, sudah diuji.
 *
 * Aturan penetapan sengaja konservatif: cabang hanya ditulis kalau SELURUH
 * booking kandidat menunjuk cabang yang sama. Kunci yang kembar tidak
 * otomatis berarti ragu — pelanggan yang membayar dua kali di hari yang
 * sama untuk studio yang sama tetap punya cabang yang pasti. Yang tidak
 * punya kandidat, atau kandidatnya beda-beda cabang, DIBIARKAN "All" dan
 * dihitung di hasil. Lebih baik ikut bagi rata (bisa dilihat dan
 * dikoreksi) daripada ditebak diam-diam.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** branch_id di yeobospace → nama cabang di Zota. */
const BRANCH_MAP: Record<string, string> = {
  tlogosari: "Tlogosari",
  tembalang: "Tembalang",
  jebres: "Jebres",
};

/** Toleransi tanggal: beda zona waktu & jeda settle bisa menggeser sehari. */
const DAY_WINDOW = 1;

/**
 * Jendela lebih longgar untuk pencocokan cadangan (nama saja, tanpa nominal).
 *
 * Dipakai untuk pembayaran TAMBAHAN: pelanggan menambah cetak / waktu /
 * add-on dan membayarnya sebagai transaksi Mayar terpisah, sementara baris
 * booking hanya menyimpan payload pembayaran utamanya. Nominalnya jadi tidak
 * pernah cocok — pada data Juli-Agustus 2026 semuanya 10-40 ribu sementara
 * booking-nya 50-250 ribu.
 *
 * Aman karena top-up itu jelas milik kunjungan yang sama, dan penetapan tetap
 * hanya dilakukan bila SELURUH booking pelanggan itu di rentang ini menunjuk
 * satu cabang. Diuji pada 105 transaksi nyata: menaikkan keberhasilan
 * 84,8% → 94,3% tanpa satu pun bentrok cabang.
 */
const FALLBACK_DAY_WINDOW = 2;

/**
 * Jendela terakhir, dipakai hanya kalau semua tingkat sebelumnya gagal.
 *
 * Sesi tidak selalu dibayar di hari yang sama — ada yang melunasi beberapa
 * hari SETELAH sesi (mis. sesi 28 Juni dibayar 3 Juli). Selebar ini
 * pencocokan nominal sudah tidak dipakai, jadi keamanannya bertumpu penuh
 * pada syarat "semua kandidat satu cabang".
 */
const LAST_RESORT_DAY_WINDOW = 10;

export interface MayarBranchSyncResult {
  /** Transaksi Mayar tanpa cabang yang diperiksa. */
  candidates: number;
  /** Berhasil ditetapkan cabangnya. */
  assigned: number;
  /** Tidak ada booking yang cocok sama sekali. */
  unmatched: number;
  /** Ada kandidat, tapi cabangnya berbeda-beda → sengaja dilewati. */
  conflicting: number;
  perBranch: Record<string, number>;
  /** Diisi saat dryRun — contoh yang gagal cocok, untuk ditelusuri admin. */
  samples: Array<{ date: string; name: string; gross: number; reason: string }>;
}

function wibDate(iso: string): string {
  // Mayar mengirim UTC; tanggal transaksi di Zota memakai WIB.
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `Gross Rp1.234.567` → 1234567. Null kalau pola tidak ada. */
function parseGross(notes: string | null): number | null {
  const m = notes?.match(/Gross Rp([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * @param admin  client service-role project Zota
 * @param dryRun hitung saja, tanpa menulis apa pun
 */
export async function syncMayarBranches(
  admin: SupabaseClient<Database>,
  opts?: { dryRun?: boolean }
): Promise<MayarBranchSyncResult> {
  const dryRun = opts?.dryRun ?? false;
  const empty: MayarBranchSyncResult = {
    candidates: 0,
    assigned: 0,
    unmatched: 0,
    conflicting: 0,
    perBranch: {},
    samples: [],
  };

  const yUrl = process.env.YEOBOSPACE_SUPABASE_URL;
  const yKey = process.env.YEOBOSPACE_SERVICE_ROLE_KEY;
  if (!yUrl || !yKey) {
    throw new Error(
      "YEOBOSPACE_SUPABASE_URL / YEOBOSPACE_SERVICE_ROLE_KEY belum diset"
    );
  }

  // Rekening Mayar di Zota.
  const { data: accounts } = await admin
    .from("bank_accounts")
    .select("id")
    .eq("bank", "mayar");
  const accountIds = (accounts ?? []).map((a) => a.id);
  if (accountIds.length === 0) return empty;

  const { data: stmts } = await admin
    .from("cashflow_statements")
    .select("id")
    .in("bank_account_id", accountIds);
  const stmtIds = (stmts ?? []).map((s) => s.id);
  if (stmtIds.length === 0) return empty;

  // Hanya yang belum bercabang pasti. Transaksi yang cabangnya sudah
  // ditetapkan — otomatis maupun manual oleh admin — tidak disentuh lagi.
  const { data: txs } = await admin
    .from("cashflow_transactions")
    .select("id, transaction_date, source_destination, notes")
    .in("statement_id", stmtIds)
    .gt("credit", 0)
    .eq("branch", "All");

  const pending = (txs ?? [])
    .map((t) => ({
      id: t.id,
      date: t.transaction_date,
      name: norm(t.source_destination),
      gross: parseGross(t.notes),
    }))
    .filter((t) => t.name && t.gross !== null);

  if (pending.length === 0) return empty;
  const result: MayarBranchSyncResult = { ...empty, candidates: pending.length };

  // Booking online yeobospace dalam rentang tanggal yang relevan saja.
  // Jendela pengambilan booking sengaja TIDAK simetris.
  //
  // Filternya `booking_date` (tanggal SESI), sedangkan yang dicocokkan
  // adalah tanggal BAYAR — dan orang memesan jauh hari. Nanik Marsela
  // membayar 1 Agustus untuk sesi 8 Agustus; dengan jendela simetris
  // ±2 hari, booking-nya tidak pernah ikut terambil dan transaksinya
  // dilaporkan "tanpa pasangan" padahal pasangannya jelas ada.
  //
  // Ke depan dilebarkan jauh (sesi bisa dipesan berbulan-bulan sebelumnya),
  // ke belakang cukup sempit karena sesi tidak pernah mendahului bayar.
  const dates = pending.map((p) => p.date).sort();
  const from = shiftDate(dates[0], -30);
  const to = shiftDate(dates[dates.length - 1], 120);

  // SEMUA booking, tanpa filter metode pembayaran MAUPUN status.
  //
  // Batasan "online" dulu membuang kasus yang paling mudah: pelanggan
  // memesan dengan voucher/cash lalu menambah cetak dan membayar
  // tambahannya lewat Mayar — booking-nya ada, cabangnya jelas.
  //
  // Batasan "confirmed" ternyata sama merugikannya. Booking bisa berstatus
  // `expired` atau `cancelled` sementara uangnya SUDAH masuk ke Mayar;
  // statusnya cuma menandakan alur konfirmasi di aplikasi booking tidak
  // tuntas. Adanya pembayaran Mayar justru bukti sesinya terjadi. Karena
  // itu status dipakai sebagai PRIORITAS (confirmed lebih dulu), bukan
  // sebagai penyaring.
  //
  // WAJIB paginasi. PostgREST memotong hasil di 1.000 baris tanpa error,
  // dan rentang ini bisa memuat ribuan booking. Truncation di sini tidak
  // sekadar membuat transaksi gagal dicocokkan — jauh lebih berbahaya: satu
  // kasus yang sebenarnya AMBIGU bisa tampak pasti karena booking
  // pembandingnya kebetulan tidak ikut terambil, lalu cabangnya ditulis
  // dengan yakin ke data keuangan. Persis itu yang terjadi pada `elisa`
  // (dua booking hari sama, Jebres & Tlogosari) sebelum paginasi dipasang.
  const yeobo = createClient(yUrl, yKey);
  type BookingRow = {
    branch_id?: string;
    name?: string;
    booking_date?: string;
    status?: string;
    provider_payload?: { data?: Record<string, unknown> };
  };
  const bookings: BookingRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await yeobo
      .from("bookings")
      .select("branch_id, name, booking_date, status, provider_payload")
      .gte("booking_date", from)
      .lte("booking_date", to)
      .order("booking_date", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`baca bookings yeobospace: ${error.message}`);
    const rows = (data ?? []) as unknown as BookingRow[];
    bookings.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Tiga index, dipakai berjenjang dari yang paling meyakinkan:
  //   exact      nama + bruto + tanggal BAYAR   (booking online)
  //   byPayDate  nama + tanggal BAYAR           (top-up di booking online)
  //   byBookDate nama + tanggal SESI            (top-up di booking voucher/cash)
  // Tiap index dibuat dua kali: satu hanya dari booking `confirmed`, satu
  // dari SEMUA status. Yang confirmed selalu dicoba lebih dulu, sehingga
  // booking expired/cancelled hanya dipakai kalau tidak ada bukti yang
  // lebih kuat — persis seperti `melly dwi`, yang punya satu booking
  // confirmed di Tembalang dan satu expired di Tlogosari.
  type Idx = {
    exact: Map<string, Set<string>>;
    byPayDate: Map<string, Set<string>>;
    byBookDate: Map<string, Set<string>>;
  };
  const mk = (): Idx => ({
    exact: new Map(),
    byPayDate: new Map(),
    byBookDate: new Map(),
  });
  const confirmedIdx = mk();
  const anyIdx = mk();

  const add = (map: Map<string, Set<string>>, key: string, branch: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(branch);
    map.set(key, set);
  };

  for (const row of bookings) {
    const branch = BRANCH_MAP[norm(row.branch_id)];
    if (!branch) continue;
    const targets: Idx[] =
      norm(row.status) === "confirmed" ? [confirmedIdx, anyIdx] : [anyIdx];

    // Nama pemesan selalu ada, termasuk pada booking non-online.
    const bookingName = norm(row.name);
    if (bookingName && row.booking_date) {
      for (const t of targets) {
        add(t.byBookDate, `${bookingName}|${row.booking_date}`, branch);
      }
    }

    // Nama & waktu dari payload pembayaran — hanya ada di booking online,
    // tapi paling akurat karena mencerminkan kapan uangnya benar-benar masuk.
    const payload = row.provider_payload?.data;
    if (!payload) continue;
    const payName = norm(payload.customerName as string);
    const amount = Number(payload.amount);
    const createdAt = payload.createdAt as string | undefined;
    if (!payName || !createdAt) continue;
    const day = wibDate(createdAt);
    for (const t of targets) {
      if (Number.isFinite(amount)) {
        add(t.exact, `${payName}|${amount}|${day}`, branch);
      }
      add(t.byPayDate, `${payName}|${day}`, branch);
    }
  }

  /** Kumpulkan cabang dari satu index dalam jendela ±`window` hari. */
  const lookup = (
    map: Map<string, Set<string>>,
    key: (day: string) => string,
    date: string,
    window: number
  ): Set<string> => {
    const out = new Set<string>();
    for (let d = -window; d <= window; d++) {
      for (const b of map.get(key(shiftDate(date, d))) ?? []) out.add(b);
    }
    return out;
  };

  const updates: Array<{ id: string; branch: string }> = [];
  for (const tx of pending) {
    // Berjenjang dari bukti terkuat ke terlemah; berhenti di tingkat
    // pertama yang menghasilkan tepat satu cabang. Urutannya penting:
    // booking confirmed selalu dihabiskan dulu sebelum menyentuh yang
    // expired/cancelled, dan pencocokan bernominal sebelum yang tanpa.
    const tiers: Array<() => Set<string>> = [
      () => lookup(confirmedIdx.exact, (d) => `${tx.name}|${tx.gross}|${d}`, tx.date, DAY_WINDOW),
      () => lookup(confirmedIdx.byPayDate, (d) => `${tx.name}|${d}`, tx.date, FALLBACK_DAY_WINDOW),
      () => lookup(confirmedIdx.byBookDate, (d) => `${tx.name}|${d}`, tx.date, FALLBACK_DAY_WINDOW),
      () => lookup(anyIdx.exact, (d) => `${tx.name}|${tx.gross}|${d}`, tx.date, DAY_WINDOW),
      () => lookup(anyIdx.byPayDate, (d) => `${tx.name}|${d}`, tx.date, FALLBACK_DAY_WINDOW),
      () => lookup(anyIdx.byBookDate, (d) => `${tx.name}|${d}`, tx.date, FALLBACK_DAY_WINDOW),
      // Pamungkas: nama saja, jendela lebar, apa pun statusnya.
      () => lookup(anyIdx.byBookDate, (d) => `${tx.name}|${d}`, tx.date, LAST_RESORT_DAY_WINDOW),
      () => lookup(anyIdx.byPayDate, (d) => `${tx.name}|${d}`, tx.date, LAST_RESORT_DAY_WINDOW),
    ];
    let found = new Set<string>();
    for (const tier of tiers) {
      const hit = tier();
      // Tepat satu cabang = pasti. Lebih dari satu = tingkat ini ambigu,
      // tapi tingkat berikutnya lebih longgar sehingga tak akan menolong —
      // hentikan dan laporkan sebagai bentrok.
      if (hit.size === 1) { found = hit; break; }
      if (hit.size > 1) { found = hit; break; }
    }
    if (found.size === 1) {
      const branch = [...found][0];
      updates.push({ id: tx.id, branch });
      result.assigned += 1;
      result.perBranch[branch] = (result.perBranch[branch] ?? 0) + 1;
    } else {
      const reason = found.size === 0 ? "tanpa booking cocok" : "cabang berbeda";
      if (found.size === 0) result.unmatched += 1;
      else result.conflicting += 1;
      if (result.samples.length < 20) {
        result.samples.push({
          date: tx.date,
          name: tx.name,
          gross: tx.gross!,
          reason,
        });
      }
    }
  }

  if (dryRun || updates.length === 0) return result;

  // Satu UPDATE per cabang, bukan per transaksi — 3 query alih-alih ratusan.
  for (const branch of new Set(updates.map((u) => u.branch))) {
    const ids = updates.filter((u) => u.branch === branch).map((u) => u.id);
    const { error: upErr } = await admin
      .from("cashflow_transactions")
      .update({ branch })
      .in("id", ids);
    if (upErr) throw new Error(`set cabang ${branch}: ${upErr.message}`);
  }

  return result;
}
