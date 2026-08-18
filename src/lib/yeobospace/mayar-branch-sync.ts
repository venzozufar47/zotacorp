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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { yeoboAdminClient } from "@/lib/supabase/yeobo-admin";

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
  /**
   * Tidak ketemu lewat booking, lalu ditetapkan mengikuti proporsi Mayar
   * bulan itu sendiri (lihat `assignByMonthlyProportion`). Angka ini
   * sengaja dipisah dari `assigned` supaya taksiran tidak menyamar
   * sebagai kepastian saat dibaca di log cron.
   */
  proportional: number;
  /** Benar-benar dibiarkan "All": bulan itu belum punya dasar proporsi. */
  leftAll: number;
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

/** "18:06" → 1086 (menit sejak tengah malam). Null kalau bukan HH:mm. */
function hhmmToMinute(hhmm: string | null | undefined): number | null {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(v) ? v : null;
}

/** Timestamp ISO → menit-dalam-hari menurut WIB. */
function wibMinute(iso: string): number {
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Toleransi menit saat mencocokkan jam bayar.
 *
 * `paid_at` di booking dan `transaction_time` di laporan Mayar berasal dari
 * sistem berbeda; pembulatan dan jeda pencatatan bisa menggeser semenit-dua.
 * Terbukti pada `melly dwi`: paid_at 18:06:44 vs laporan Mayar 18:06.
 */
const MINUTE_TOLERANCE = 2;

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
    proportional: 0,
    leftAll: 0,
    perBranch: {},
    samples: [],
  };

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
    .select(
      "id, transaction_date, transaction_time, source_destination, notes, credit"
    )
    .in("statement_id", stmtIds)
    .gt("credit", 0)
    .eq("branch", "All");

  const pending = (txs ?? [])
    .map((t) => ({
      id: t.id,
      date: t.transaction_date,
      minute: hhmmToMinute(t.transaction_time),
      name: norm(t.source_destination),
      gross: parseGross(t.notes),
      net: Number(t.credit) || 0,
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
  const yeobo = yeoboAdminClient();
  type BookingRow = {
    branch_id?: string;
    name?: string;
    booking_date?: string;
    status?: string;
    paid_at?: string | null;
    start_min?: number | null;
    duration_min?: number | null;
    provider_payload?: { data?: Record<string, unknown> };
  };
  const bookings: BookingRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await yeobo
      .from("bookings")
      .select(
        "branch_id, name, booking_date, status, paid_at, start_min, duration_min, provider_payload"
      )
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
    /** nama|tanggal|menit-bayar — bukti terkuat, lihat catatan di bawah. */
    byPaidMinute: Map<string, Set<string>>;
    exact: Map<string, Set<string>>;
    byPayDate: Map<string, Set<string>>;
    byBookDate: Map<string, Set<string>>;
    /** nama|tanggal-sesi → jendela waktu sesi tiap cabang. */
    sessions: Map<string, Array<{ branch: string; from: number; to: number }>>;
  };
  const mk = (): Idx => ({
    byPaidMinute: new Map(),
    exact: new Map(),
    byPayDate: new Map(),
    byBookDate: new Map(),
    sessions: new Map(),
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

    // JAM PEMBAYARAN — bukti terkuat yang tersedia.
    //
    // `paid_at` di booking dan `transaction_time` di laporan Mayar merujuk
    // peristiwa yang sama: detik uang diterima. Cocok sampai ke menit dan
    // kebal terhadap nama kembar — satu-satunya sumber ambiguitas yang
    // tersisa di tingkat lain.
    //
    // Terbukti pada `elisa` 28 Juli: DUA pelanggan berbeda dengan nama
    // sama, sesi 11:00 di Tlogosari dan 15:00 di Jebres. Semua tingkat
    // berbasis tanggal menyerah; jam bayar 11:01 langsung menunjuk
    // Tlogosari tanpa ragu.
    if (bookingName && row.paid_at) {
      const day = wibDate(row.paid_at);
      const minute = wibMinute(row.paid_at);
      for (const t of targets) {
        add(t.byPaidMinute, `${bookingName}|${day}|${minute}`, branch);
      }
    }

    // JENDELA SESI — untuk top-up pada booking yang dibayar cash/voucher.
    //
    // Booking seperti itu `paid_at`-nya kosong, jadi tingkat jam-bayar tidak
    // menolong. Tapi pembayaran tambahan (tambah cetak/waktu) terjadi SAAT
    // sesi berlangsung, jadi jam bayar Mayar jatuh di dalam rentang sesi.
    //
    // Inilah yang memisahkan dua `elisa` pada 28 Juli: sesi 11:00 di
    // Tlogosari dan 15:00 di Jebres, top-up dibayar 11:01.
    if (bookingName && row.booking_date && row.start_min != null) {
      const start = row.start_min;
      const dur = row.duration_min ?? 60;
      const key = `${bookingName}|${row.booking_date}`;
      for (const t of targets) {
        const list = t.sessions.get(key) ?? [];
        // Sedikit longgar di kedua ujung: top-up bisa dibayar tepat sebelum
        // mulai atau beberapa saat setelah sesi selesai.
        list.push({ branch, from: start - 15, to: start + dur + 45 });
        t.sessions.set(key, list);
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
  /** Yang gagal dicocokkan ke booking — ditangani proporsional di bawah. */
  const leftovers: Array<{ id: string; date: string; net: number }> = [];
  for (const tx of pending) {
    // Berjenjang dari bukti terkuat ke terlemah; berhenti di tingkat
    // pertama yang menghasilkan tepat satu cabang. Urutannya penting:
    // booking confirmed selalu dihabiskan dulu sebelum menyentuh yang
    // expired/cancelled, dan pencocokan bernominal sebelum yang tanpa.
    /** Jam bayar: cocokkan menit persis, dengan toleransi kecil. */
    const byMinute = (idx: Idx): Set<string> => {
      const out = new Set<string>();
      if (tx.minute === null) return out;
      for (let dd = -1; dd <= 1; dd++) {
        const day = shiftDate(tx.date, dd);
        for (let m = -MINUTE_TOLERANCE; m <= MINUTE_TOLERANCE; m++) {
          for (const b of idx.byPaidMinute.get(
            `${tx.name}|${day}|${tx.minute + m}`
          ) ?? []) {
            out.add(b);
          }
        }
      }
      return out;
    };

    /** Jam bayar jatuh di dalam rentang sesi mana? */
    const bySession = (idx: Idx): Set<string> => {
      const out = new Set<string>();
      if (tx.minute === null) return out;
      for (let dd = -1; dd <= 1; dd++) {
        const key = `${tx.name}|${shiftDate(tx.date, dd)}`;
        for (const s of idx.sessions.get(key) ?? []) {
          if (tx.minute >= s.from && tx.minute <= s.to) out.add(s.branch);
        }
      }
      return out;
    };

    const tiers: Array<() => Set<string>> = [
      // Jam pembayaran lebih dulu dari apa pun — hanya ini yang bisa
      // memisahkan dua pelanggan bernama sama di hari yang sama.
      () => byMinute(confirmedIdx),
      () => byMinute(anyIdx),
      () => bySession(confirmedIdx),
      () => bySession(anyIdx),
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
      leftovers.push({ id: tx.id, date: tx.date, net: tx.net });
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

  // ── Cadangan terakhir: ikut proporsi Mayar bulan itu sendiri ──────────
  //
  // Perilaku lama membiarkan yang tak cocok tetap "All", yang berarti ia
  // ikut dibagi rata 1/3 bersama revenue rekening lain. Itu keputusan yang
  // masuk akal ketika Mayar memang belum punya cabang sama sekali; setelah
  // 98% transaksinya ter-cabang, menyisakan sebagian kecil di pot bagi-rata
  // justru mencampur dua mekanisme dan membuat panel alokasi memuat angka
  // Mayar yang seharusnya sudah selesai.
  //
  // Dasarnya proporsi Mayar BULAN ITU yang berhasil dicocokkan — bukan 1/3
  // rata, dan bukan tebakan dari luar data.
  //
  // BATAS YANG JUJUR: satu baris transaksi hanya punya SATU kolom `branch`;
  // tidak ada sentinel untuk proporsi kustom. Jadi nominalnya tidak benar-
  // benar dipecah — tiap baris jatuh utuh ke cabang yang saat itu paling
  // jauh di bawah target proporsinya. Untuk banyak baris hasilnya menuju
  // proporsi; untuk satu baris ia hanya mendekati. Nilainya kecil
  // (Juli 2026: Rp61.617 dari Rp48,6 juta) sehingga selisihnya tidak
  // material, tapi ini taksiran dan dihitung terpisah di `proportional`.
  if (leftovers.length > 0) {
    const basis = new Map<string, Map<string, number>>(); // bulan → cabang → nominal
    const { data: assignedRows } = await admin
      .from("cashflow_transactions")
      .select("transaction_date, branch, credit")
      .in("statement_id", stmtIds)
      .gt("credit", 0)
      .in("branch", Object.values(BRANCH_MAP));
    for (const r of assignedRows ?? []) {
      const key = (r.transaction_date as string).slice(0, 7);
      const m = basis.get(key) ?? new Map<string, number>();
      m.set(r.branch as string, (m.get(r.branch as string) ?? 0) + Number(r.credit || 0));
      basis.set(key, m);
    }

    // Terbesar dulu: baris besar paling menentukan bentuk akhirnya.
    for (const lo of [...leftovers].sort((a, b) => b.net - a.net)) {
      const monthKey = lo.date.slice(0, 7);
      const running = basis.get(monthKey);
      const total = [...(running?.values() ?? [])].reduce((s, v) => s + v, 0);
      if (!running || total <= 0) {
        // Bulan itu belum punya satu pun Mayar ber-cabang — tidak ada dasar
        // apa pun. Dibiarkan "All" (terlihat, bisa dikoreksi) daripada
        // ditebak dari bulan lain.
        result.leftAll += 1;
        continue;
      }
      // Cabang yang paling tertinggal dari target proporsinya.
      let pick: string | null = null;
      let worst = -Infinity;
      for (const [branch, amount] of running) {
        const share = amount / total;
        const deficit = share * (total + lo.net) - amount;
        if (deficit > worst) {
          worst = deficit;
          pick = branch;
        }
      }
      if (!pick) {
        result.leftAll += 1;
        continue;
      }
      updates.push({ id: lo.id, branch: pick });
      running.set(pick, (running.get(pick) ?? 0) + lo.net);
      result.proportional += 1;
      result.perBranch[pick] = (result.perBranch[pick] ?? 0) + 1;
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
