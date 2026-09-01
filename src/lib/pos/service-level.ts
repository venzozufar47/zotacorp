import {
  jakartaHourIso,
  loadBaselineAt,
  loadStockEventStream,
  sampleReadiness,
  skuKey,
  type PosDbClient,
  type SkuKey,
} from "./stock-engine";

/**
 * Metrik Service Level POS — berapa persen produk ready stock,
 * dirata-rata sepanjang jam buka. Target per outlet (`service_level_target`
 * di migrasi 135) — default 100%, Pare 80%.
 *
 * Modul biasa (bukan "use server") supaya dipakai DUA jalur: server
 * action ber-gate dan cron tanpa sesi. Lihat header stock-engine.ts.
 *
 * DEFINISI
 *   SL = ( Σ_hari Σ_jam SKU_ready(t) ) / ( Σ_hari SKU_dihitung × K_hari )
 *
 * Pooled, BUKAN rata-rata dari persentase harian: hari ini yang baru
 * berjalan 3 jam tidak boleh berbobot sama dengan hari penuh — dan itu
 * justru angka yang dilihat orang sepanjang siang.
 *
 * GRANULARITAS mengikuti deklarasi katalog (`stock_aggregate_variants`),
 * bukan pandangan ideal: produk yang stoknya dihitung di level produk
 * masuk sebagai SATU SKU. Alasannya koherensi — `computeStockData` di
 * layar kasir memakai aturan yang sama, jadi metrik mengukur tepat apa
 * yang ditegakkan sistem. Kalau metrik melaporkan "varian X habis"
 * sementara kasir tetap boleh menjualnya, penanggung jawab metrik
 * mengejar masalah yang tak terlihat siapa pun di toko.
 *
 * KETERBATASAN yang harus ditampilkan di UI: grid per jam tidak
 * mendeteksi kekosongan yang muncul dan teratasi di antara dua jam
 * bulat. Metrik ini mengukur kekosongan yang BERTAHAN.
 */

export interface ServiceLevelConfig {
  enabled: boolean;
  openHour: number;
  /** Eksklusif: sampel = [openHour, closeHour). */
  closeHour: number;
  /** Pecahan 0-1 (mis. 0.8 = 80%). Per outlet — lihat migrasi 135. */
  target: number;
}

export const SERVICE_LEVEL_DEFAULTS: ServiceLevelConfig = {
  enabled: false,
  openHour: 9,
  closeHour: 21,
  target: 1,
};

export type ServiceLevelTone = "success" | "warning" | "destructive" | "muted";

/**
 * Ambang warna RELATIF terhadap target outlet, bukan konstanta 95/85.
 * Gap-nya (5pt / 15pt di bawah target) dipertahankan dari desain lama
 * yang mengasumsikan target 100% — cuma jangkarnya yang sekarang ikut
 * target, supaya outlet dengan target 80% tidak selalu tampak merah.
 */
export function serviceLevelTone(pct: number | null, target: number): ServiceLevelTone {
  if (pct === null) return "muted";
  if (pct >= target - 0.05) return "success";
  if (pct >= target - 0.15) return "warning";
  return "destructive";
}

export interface ServiceLevelDay {
  /** YYYY-MM-DD WIB. */
  date: string;
  /** Jumlah sampel yang benar-benar diambil (menyusut di hari berjalan). */
  sampleCount: number;
  /** SKU yang dihitung hari itu — setelah pengecualian ber-tanggal. */
  trackedSkus: number;
  readySum: number;
  /** null = hari tidak dihitung (lihat alasan di flag di bawah). */
  percent: number | null;
  hadActivity: boolean;
  /** False = belum ada opname sebelum jam buka → bukan 0%, tapi "tak ada data". */
  hasBaseline: boolean;
  /** Opname hari itu menyebut lebih sedikit SKU daripada yang dihitung. */
  partialOpname: boolean;
  /** SKU ready per jam — untuk drill-down dan verifikasi tangan. */
  hourly: number[];
}

export interface ServiceLevelWorstSku {
  productId: string;
  variantId: string | null;
  label: string;
  unavailableSamples: number;
  /** Persen waktu SKU ini habis, dari sampel di mana ia dihitung. */
  percentOut: number;
}

export interface ServiceLevelResult {
  bankAccountId: string;
  fromDate: string;
  toDate: string;
  openHour: number;
  closeHour: number;
  /** Pecahan 0-1. Diteruskan dari config, bukan dihitung — lihat migrasi 135. */
  target: number;
  /** Pooled. null kalau tidak ada satu pun hari yang dihitung. */
  percent: number | null;
  readySum: number;
  /** Penyebut penuh = Σ_hari (trackedSkus × sampleCount). */
  totalSkuSamples: number;
  /** Jumlah sampel waktu (bukan SKU-jam). */
  totalSamples: number;
  lostSkuHours: number;
  days: ServiceLevelDay[];
  excludedDates: string[];
  worstSkus: ServiceLevelWorstSku[];
  computedAtIso: string;
}

interface ExclusionRow {
  product_id: string;
  variant_id: string | null;
  excluded_from: string;
  excluded_until: string | null;
}

/** Baca jam operasi + saklar satu outlet. */
export async function loadServiceLevelConfig(
  db: PosDbClient,
  bankAccountId: string
): Promise<ServiceLevelConfig> {
  const { data } = await db
    .from("bank_accounts")
    .select(
      "service_level_enabled, service_level_open_hour, service_level_close_hour, service_level_target"
    )
    .eq("id", bankAccountId)
    .maybeSingle();
  if (!data) return { ...SERVICE_LEVEL_DEFAULTS };
  return {
    enabled: data.service_level_enabled ?? false,
    openHour: data.service_level_open_hour ?? SERVICE_LEVEL_DEFAULTS.openHour,
    closeHour: data.service_level_close_hour ?? SERVICE_LEVEL_DEFAULTS.closeHour,
    target: data.service_level_target ?? SERVICE_LEVEL_DEFAULTS.target,
  };
}

/** Tanggal WIB (YYYY-MM-DD) dari sebuah timestamp ISO. */
function jakartaDateOfIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Tambah `n` hari ke tanggal YYYY-MM-DD. Aritmetika UTC murni. */
function addDays(ymd: string, n: number): string {
  const dt = new Date(ymd + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function dateRange(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > 400) break; // jaring pengaman
  }
  return out;
}

/**
 * Hitung Service Level untuk satu outlet pada rentang tanggal WIB.
 *
 * Satu muatan event untuk SELURUH jendela, satu lintasan sampling, lalu
 * hasilnya dibagi per hari — bukan 30 sweep terpisah.
 */
export async function computeServiceLevel(
  db: PosDbClient,
  bankAccountId: string,
  opts: {
    fromDate: string;
    toDate: string;
    config?: ServiceLevelConfig;
    nowIso?: string;
  }
): Promise<ServiceLevelResult> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const config = opts.config ?? (await loadServiceLevelConfig(db, bankAccountId));
  const { openHour, closeHour, target } = config;
  const dates = dateRange(opts.fromDate, opts.toDate);

  const empty = (): ServiceLevelResult => ({
    bankAccountId,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    openHour,
    closeHour,
    target,
    percent: null,
    readySum: 0,
    totalSkuSamples: 0,
    totalSamples: 0,
    lostSkuHours: 0,
    days: [],
    excludedDates: dates,
    worstSkus: [],
    computedAtIso: nowIso,
  });

  // Grid menaik. Sampel di masa depan dibuang (`<=` supaya sampel tepat
  // di jam bulat saat ini ikut terhitung).
  const grid: Array<{ date: string; atIso: string }> = [];
  for (const date of dates) {
    for (let h = openHour; h < closeHour; h += 1) {
      const atIso = jakartaHourIso(date, h);
      if (atIso <= nowIso) grid.push({ date, atIso });
    }
  }
  if (grid.length === 0) return empty();

  // Jangkar ke opname terakhir sebelum sampel paling awal — tanpa ini
  // seluruh riwayat rekening ikut termuat (8 detik vs 3 detik di Pare).
  const anchor = await loadBaselineAt(db, bankAccountId, grid[0].atIso);
  const stream = await loadStockEventStream(db, bankAccountId, {
    anchorIso: anchor.cutoffIso,
    toIso: grid[grid.length - 1].atIso,
  });

  if (stream.skuKeys.length === 0) return empty();

  const { readyMask } = sampleReadiness(
    stream,
    grid.map((g) => g.atIso)
  );

  // Pengecualian SKU ber-tanggal-berlaku. Sebuah SKU tidak dihitung pada
  // tanggal D bila ada baris dengan from <= D <= (until ?? ∞).
  const { data: exclusionsRaw } = await db
    .from("pos_service_level_exclusions")
    .select("product_id, variant_id, excluded_from, excluded_until")
    .eq("bank_account_id", bankAccountId);
  const exclusions = (exclusionsRaw ?? []) as ExclusionRow[];
  const excludedOn = (date: string): Set<SkuKey> => {
    const s = new Set<SkuKey>();
    for (const e of exclusions) {
      if (e.excluded_from > date) continue;
      if (e.excluded_until !== null && e.excluded_until < date) continue;
      s.add(skuKey(e.product_id, e.variant_id));
    }
    return s;
  };

  // Tanggal WIB sebuah SKU mulai ADA. `listActiveSkus` membaca katalog
  // SAAT INI dan memproyeksikannya mundur, jadi tanpa batas ini setiap
  // produk yang baru ditambahkan akan terhitung "habis" untuk seluruh
  // periode sebelum ia dibuat — menekan angka historis secara palsu dan
  // menaruhnya di puncak daftar penyebab terbesar.
  //
  // Ini pasangan alami pengecualian ber-tanggal: `created_at` membatasi
  // AWAL hidup SKU, `excluded_from` membatasi akhirnya.
  const bornOn = new Map<SkuKey, string>();
  for (const s of stream.skus) {
    bornOn.set(
      skuKey(s.productId, s.variantId),
      jakartaDateOfIso(s.createdAt)
    );
  }

  // Indeks sampel per tanggal.
  const idxByDate = new Map<string, number[]>();
  grid.forEach((g, i) => {
    const arr = idxByDate.get(g.date) ?? [];
    arr.push(i);
    idxByDate.set(g.date, arr);
  });

  // Berapa kali tiap SKU habis, hanya pada sampel di mana ia dihitung.
  const outByKey = new Map<SkuKey, number>();
  const countedByKey = new Map<SkuKey, number>();
  for (const k of stream.skuKeys) {
    outByKey.set(k, 0);
    countedByKey.set(k, 0);
  }

  const days: ServiceLevelDay[] = [];
  const excludedDates: string[] = [];
  let readySum = 0;
  let totalSkuSamples = 0;
  let totalSamples = 0;

  for (const date of dates) {
    const idxs = idxByDate.get(date) ?? [];
    const dayOpenIso = jakartaHourIso(date, openHour);
    const dayEndIso = jakartaHourIso(date, closeHour - 1);

    const excluded = excludedOn(date);
    const countedIdx: number[] = [];
    stream.skuKeys.forEach((k, j) => {
      if (excluded.has(k)) return;
      // Belum ada di katalog pada tanggal itu → belum boleh dihitung.
      const born = bornOn.get(k);
      if (born && born > date) return;
      countedIdx.push(j);
    });
    const trackedSkus = countedIdx.length;

    // Baseline: ada opname pada atau sebelum jam buka hari itu?
    const hasBaseline =
      (anchor.cutoffIso !== null && anchor.cutoffIso <= dayOpenIso) ||
      stream.opnames.some((o) => o.createdAt <= dayOpenIso);

    const opnamesToday = stream.opnames.filter(
      (o) => o.createdAt >= dayOpenIso && o.createdAt <= dayEndIso
    );
    const hadActivity =
      opnamesToday.length > 0 ||
      stream.deltas.some(
        (d) => d.createdAt >= dayOpenIso && d.createdAt <= dayEndIso
      );
    const partialOpname = opnamesToday.some((o) => o.itemCount < trackedSkus);

    let dayReady = 0;
    const hourly: number[] = [];
    for (const i of idxs) {
      let n = 0;
      for (const j of countedIdx) if (readyMask[i][j]) n += 1;
      hourly.push(n);
      dayReady += n;
    }

    const counted =
      idxs.length > 0 && trackedSkus > 0 && hasBaseline && hadActivity;

    if (counted) {
      readySum += dayReady;
      totalSkuSamples += trackedSkus * idxs.length;
      totalSamples += idxs.length;
      for (const i of idxs) {
        for (const j of countedIdx) {
          const k = stream.skuKeys[j];
          countedByKey.set(k, (countedByKey.get(k) ?? 0) + 1);
          if (!readyMask[i][j]) outByKey.set(k, (outByKey.get(k) ?? 0) + 1);
        }
      }
    } else {
      excludedDates.push(date);
    }

    days.push({
      date,
      sampleCount: idxs.length,
      trackedSkus,
      readySum: dayReady,
      percent:
        counted && trackedSkus > 0 && idxs.length > 0
          ? dayReady / (trackedSkus * idxs.length)
          : null,
      hadActivity,
      hasBaseline,
      partialOpname,
      hourly,
    });
  }

  const byKey = new Map(
    stream.skus.map((s) => [skuKey(s.productId, s.variantId), s])
  );
  const worstSkus: ServiceLevelWorstSku[] = stream.skuKeys
    .map((k) => {
      const s = byKey.get(k)!;
      const out = outByKey.get(k) ?? 0;
      const counted = countedByKey.get(k) ?? 0;
      return {
        productId: s.productId,
        variantId: s.variantId,
        label: s.productName + (s.variantName ? ` — ${s.variantName}` : ""),
        unavailableSamples: out,
        percentOut: counted > 0 ? out / counted : 0,
      };
    })
    .filter((w) => w.unavailableSamples > 0)
    .sort((a, b) => b.unavailableSamples - a.unavailableSamples);

  return {
    bankAccountId,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    openHour,
    closeHour,
    target,
    percent: totalSkuSamples > 0 ? readySum / totalSkuSamples : null,
    readySum,
    totalSkuSamples,
    totalSamples,
    lostSkuHours: totalSkuSamples - readySum,
    days,
    excludedDates,
    worstSkus,
    computedAtIso: nowIso,
  };
}
