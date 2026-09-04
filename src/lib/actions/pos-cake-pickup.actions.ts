"use server";

/**
 * Pengambilan custom cake ditandai kasir POS cabang.
 *
 * Kenapa ada: yang tahu kue benar-benar diserahkan adalah orang yang
 * berhadapan dengan customer. Sebelumnya yang menandai justru staf cake
 * yang tinggal di kota lain, dan itu sumber miskom yang berulang.
 *
 * Board staf sudah tidak bisa menandai pickup — lihat tiga lapis kunci
 * di `CakeOrdersBoard` (tombol + drag) dan `setCakeOrderStatus` (server).
 *
 * OTORISASI. Kasir POS TIDAK punya `cake_access_assignments`, jadi RLS
 * `cake_orders` (SELECT butuh baris itu) menolaknya dan
 * `requireCakeOrderAccess` juga menolaknya. Modul ini karena itu
 * memakai service-role SETELAH `requireAdminOrPosAssignee` — pola yang
 * sama dengan `pos-pesanan.actions.ts`.
 *
 * Yang tidak biasa dan disengaja: `markCakePickedUpAtPos` TIDAK
 * menerima `bankAccountId` dari klien. Cabang diambil dari baris
 * order → dipetakan ke akun POS cabang itu → baru digerbang. Dengan
 * begitu klien tidak pernah bisa menunjuk akun mana yang diperiksa,
 * sehingga kasir Semarang mustahil menutup order Pare — bukan karena
 * ada perbandingan yang bisa keliru, tapi karena secara konstruksi
 * tidak ada jalannya.
 *
 * CATATAN: `requireAdminOrPosAssignee` meloloskan `role='admin'`,
 * padahal `requireCakeOrderAccess` sengaja menolak admin. Jadi lewat
 * jalur ini admin BISA menandai pengambilan — satu-satunya tulis cake
 * yang bisa ia lakukan. Ini pilihan sadar (admin berdiri di kasir itu
 * skenario nyata), bukan kelalaian.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import {
  requireAdminOrPosAssignee,
  type ActionResult,
} from "@/lib/actions/_gates";
import { isPickupOption } from "@/lib/cake-orders/helpers";
import { insertCakePaymentLeg } from "@/lib/cake-orders/payment-write";
import {
  summarizeCakePayment,
  type CakePaymentState,
} from "@/lib/cake-orders/payment-summary";
import { CAKE_SETTLEMENT_CASH_CATEGORY } from "@/lib/cashflow/categories";
import { formatRp } from "@/lib/cashflow/format";
import {
  jakartaDateString,
  jakartaDateMinusDays,
  jakartaHHMM,
} from "@/lib/utils/jakarta";
import { jakartaHourIso } from "@/lib/pos/stock-engine";
import { classifyPaymentMethod } from "@/lib/cake-orders/payment-method";
import { CAKE_BRANCH_LABELS, type CakeBranch } from "@/lib/cake-orders/types";
import {
  listAuthorizersFor,
  verifyOperationPin,
} from "@/lib/pos/authorizers";
import type { PosAuthorizerRef } from "@/lib/pos-pin-format";

export interface CakePickupOrder {
  id: string;
  customerName: string;
  customerPhone: string | null;
  scheduledAt: string;
  baseLabel: string;
  shapeLabel: string;
  shapeCustom: string | null;
  dimensionCm: number | null;
  fillingLabel: string | null;
  greetingCard: string | null;
  totalIdr: number;
  /** Sisa tagihan; 0 berarti lunas. Kartu menurunkan tampilannya dari sini. */
  remainingIdr: number;
  paymentState: CakePaymentState;
  freeClaim: boolean;
}

/** Metode bayar yang boleh diterima kasir, sudah tersaring di server. */
export interface CakePickupPaymentMethod {
  id: string;
  label: string;
}

export interface CakePickupBoard {
  pickups: CakePickupOrder[];
  paymentMethods: CakePickupPaymentMethod[];
  /** Siapa saja yang PIN-nya diterima untuk serah terima. Kosong = tanpa
   *  PIN. Ikut di sini, bukan di-fetch terpisah oleh halaman, supaya
   *  tombol dan gerbang server tidak bisa berbeda pendapat. */
  authorizers: PosAuthorizerRef[];
}

export interface MarkPickupInput {
  orderId: string;
  /** Pelunasan opsional yang diterima kasir saat serah-terima. */
  settlement?: {
    amountIdr: number;
    /** id `cake_options` berjenis payment_method (QRIS / Cash). */
    paymentOptionId: string;
    notes?: string | null;
    /** Bukti foto — client mewajibkannya untuk QRIS (tombol disabled
     *  tanpa foto, sama seperti checkout POS). Server SENGAJA tidak
     *  menolak kalau kosong: uang sudah diterima customer, mengunci
     *  kasir gara-gara upload gagal lebih berbahaya daripada satu
     *  pembayaran tanpa lampiran — sama seperti perlakuan
     *  `attachPosQrisReceipt` di checkout POS biasa. */
    proofPath?: string | null;
    proofMimeType?: string | null;
    proofSizeBytes?: number | null;
  } | null;
  /** Wajib true kalau setelah settlement masih ada sisa tagihan. */
  acknowledgeUnpaid?: boolean;
  /**
   * Alasan sisa tagihan dilepas TANPA pelunasan — alternatif dari
   * `acknowledgeUnpaid` generik. Mutually exclusive dengan `settlement`:
   * kalau diisi, seluruh sisa tagihan (`remainingIdr` sebelum panggilan
   * ini) dianggap dilepas, tidak ada payment leg / transaksi kas yang
   * ditulis sama sekali — makanya cake ini otomatis tidak ikut bonus
   * custom cake Admin Haengbocake (basisnya mutasi rekening).
   */
  waiveReason?: {
    kind: "cake_konten" | "lainnya";
    /** Wajib diisi (non-kosong) untuk kind "lainnya". Diabaikan untuk "cake_konten". */
    note?: string | null;
  } | null;
  /** PIN salah satu authorizer `cake_pickup` di rekening POS cabang
   *  pesanan ini. Diabaikan kalau cabangnya tidak punya authorizer. */
  pin?: string;
}

/** `bank_accounts.default_branch` ("Pare") → `cake_orders.branch` ("pare"). */
function posBranchToCakeBranch(v: string | null): CakeBranch | null {
  const s = (v ?? "").trim().toLowerCase();
  return (
    (Object.keys(CAKE_BRANCH_LABELS) as CakeBranch[]).find(
      (b) => CAKE_BRANCH_LABELS[b].toLowerCase() === s
    ) ?? null
  );
}

/**
 * Rekening POS untuk SATU cake order, diturunkan dari `branch` order-nya
 * — BUKAN dari input klien. Sama prinsipnya dengan `markCakePickedUpAtPos`
 * (lihat header file): kasir Semarang mustahil menunjuk rekening Pare
 * secara konstruksi, bukan sekadar karena ada perbandingan yang bisa
 * keliru. Dipakai `uploadCakePickupPaymentProof` di bawah, yang cuma
 * punya `orderId` dari klien.
 */
async function resolveAccountForCakeOrderBranch(
  db: ReturnType<typeof createAdminClient>,
  orderBranch: string
): Promise<{ id: string; default_branch: string | null } | null> {
  const cakeBranch = posBranchToCakeBranch(orderBranch);
  if (!cakeBranch) return null;
  const branchLabel = CAKE_BRANCH_LABELS[cakeBranch];
  const { data } = await db
    .from("bank_accounts")
    .select("id, default_branch")
    .eq("business_unit", "Haengbocake")
    .eq("default_branch", branchLabel)
    .eq("pos_enabled", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (
    (data as { id: string; default_branch: string | null } | null) ?? null
  );
}

/**
 * Rekening POS → cabang cake, dengan pemeriksaan yang sama dipakai di
 * `listCakePickupsForPos` (business_unit Haengbocake, POS aktif). Diambil
 * jadi helper supaya dua fungsi baca-riwayat di bawah tidak menduplikasi
 * tiga baris pemeriksaan yang gampang diam-diam berbeda kalau ditulis
 * ulang.
 */
async function resolveCakeBranch(
  db: ReturnType<typeof createAdminClient>,
  bankAccountId: string
): Promise<CakeBranch | null> {
  const { data } = await db
    .from("bank_accounts")
    .select("business_unit, default_branch, pos_enabled, is_active")
    .eq("id", bankAccountId)
    .maybeSingle();
  const acc = data as unknown as {
    business_unit: string;
    default_branch: string | null;
    pos_enabled: boolean | null;
    is_active: boolean | null;
  } | null;
  if (!acc || acc.business_unit !== "Haengbocake") return null;
  if (!acc.pos_enabled || !acc.is_active) return null;
  return posBranchToCakeBranch(acc.default_branch);
}

/**
 * Metode pembayaran yang boleh diterima kasir saat serah-terima.
 * Bank Jago sengaja TIDAK termasuk — transfer bank tidak terjadi di
 * konter dan pencatatannya tetap lewat staf cake.
 *
 * `classifyPaymentMethod` sendiri sekarang tinggal di
 * `@/lib/cake-orders/payment-method` (dep-free) supaya client
 * (`CakePickupList`) bisa memakai KLASIFIKASI YANG SAMA untuk
 * memutuskan kapan menampilkan verifikasi uang tunai vs bukti foto
 * QRIS — bukan menebak sendiri dan berisiko berbeda dari server.
 */

type OptionRow = {
  id: string;
  kind: string;
  label: string;
  needs_address: boolean;
};

type ListRow = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  scheduled_at: string;
  base_cake_option_id: string | null;
  shape_option_id: string | null;
  shape_custom: string | null;
  dimension_cm: number | null;
  filling_option_id: string | null;
  greeting_card: string | null;
  total_idr: number;
  paid_idr: number;
  refund_idr: number;
  free_claim: boolean;
};

/** Kolom yang benar-benar dibaca jalur penandaan — sengaja lebih sempit
 *  dari ListRow supaya tidak ada field yang "ada di tipe, undefined di
 *  runtime". */
type MarkRow = {
  id: string;
  branch: string;
  customer_name: string;
  status: string;
  delivery_option_id: string | null;
  total_idr: number;
  paid_idr: number;
  refund_idr: number;
  free_claim: boolean;
  picked_up_at: string | null;
};

/**
 * Kue pickup yang siap diambil di cabang rekening POS ini, plus daftar
 * metode bayar yang boleh diterima kasir.
 *
 * Keduanya dikembalikan bersama karena berasal dari tabel `cake_options`
 * yang sama — memisahkannya berarti halaman menarik tabel itu dua kali
 * per render, dan menyisakan dua tempat yang harus sepakat soal metode
 * mana yang boleh.
 *
 * Mengikuti konvensi baca POS: gerbang gagal → hasil kosong, bukan
 * lempar error. Halaman tetap render, sekadar tanpa kartu.
 */
export async function listCakePickupsForPos(
  bankAccountId: string
): Promise<CakePickupBoard> {
  const empty: CakePickupBoard = {
    pickups: [],
    paymentMethods: [],
    authorizers: [],
  };

  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return empty;

  const db = createAdminClient();

  // Rekening, daftar opsi, dan authorizer tidak saling bergantung —
  // ditarik bareng.
  const [accRes, optRes, authorizers] = await Promise.all([
    db
      .from("bank_accounts")
      .select("business_unit, default_branch, pos_enabled, is_active")
      .eq("id", bankAccountId)
      .maybeSingle(),
    db.from("cake_options" as never).select("id, kind, label, needs_address"),
    listAuthorizersFor(bankAccountId, "cake_pickup"),
  ]);

  const acc = accRes.data as unknown as {
    business_unit: string;
    default_branch: string | null;
    pos_enabled: boolean | null;
    is_active: boolean | null;
  } | null;
  if (!acc || acc.business_unit !== "Haengbocake") return empty;
  if (!acc.pos_enabled || !acc.is_active) return empty;
  const branch = posBranchToCakeBranch(acc.default_branch);
  if (!branch) return empty;

  // Semua opsi (termasuk non-aktif): order lama bisa menunjuk opsi yang
  // sudah dinonaktifkan, dan itu tetap harus resolve jadi label.
  const options = (optRes.data ?? []) as unknown as OptionRow[];
  const byId = new Map(options.map((o) => [o.id, o]));
  const pickupIds = options.filter(isPickupOption).map((o) => o.id);

  const paymentMethods: CakePickupPaymentMethod[] = options
    .filter(
      (o) =>
        o.kind === "payment_method" && classifyPaymentMethod(o.label) !== null
    )
    .map((o) => ({ id: o.id, label: o.label }));

  if (pickupIds.length === 0)
    return { pickups: [], paymentMethods, authorizers };

  const { data: rowsRaw } = await db
    .from("cake_orders" as never)
    .select(
      "id, customer_name, customer_phone, scheduled_at, base_cake_option_id, shape_option_id, shape_custom, dimension_cm, filling_option_id, greeting_card, total_idr, paid_idr, refund_idr, free_claim"
    )
    .eq("branch", branch)
    .eq("status", "ready")
    .is("archived_at", null)
    .in("delivery_option_id", pickupIds)
    .order("scheduled_at", { ascending: true });

  const labelOf = (id: string | null) => (id && byId.get(id)?.label) || null;
  const rows = (rowsRaw ?? []) as unknown as ListRow[];

  const pickups = rows.map((r) => {
    const pay = summarizeCakePayment({
      totalIdr: r.total_idr,
      netPaidIdr: r.paid_idr,
      refundIdr: r.refund_idr,
      freeClaim: r.free_claim,
    });
    return {
      id: r.id,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      scheduledAt: r.scheduled_at,
      baseLabel: labelOf(r.base_cake_option_id) ?? "—",
      shapeLabel: labelOf(r.shape_option_id) ?? "—",
      shapeCustom: r.shape_custom,
      dimensionCm: r.dimension_cm,
      fillingLabel: labelOf(r.filling_option_id),
      greetingCard: r.greeting_card,
      totalIdr: r.total_idr,
      remainingIdr: pay.remaining,
      paymentState: pay.state,
      freeClaim: r.free_claim,
    };
  });

  return { pickups, paymentMethods, authorizers };
}

// ─────────────────────────────────────────────────────────────────────
//  Riwayat — pengambilan kue muncul di timeline harian POS (2026-08-20)
// ─────────────────────────────────────────────────────────────────────
//
// SEBELUM INI: `markCakePickedUpAtPos` sudah menulis `picked_up_at` +
// `picked_up_via='pos'` ke `cake_orders` sejak migrasi 125, tapi tidak
// ada satu pun halaman yang membacanya balik — jadi kasir/admin tidak
// bisa menelusuri "kue apa saja yang keluar hari ini" dari Riwayat.
// Datanya sudah lengkap sejak hari pertama fitur ini jalan; yang dua
// fungsi di bawah lakukan murni MEMBACA yang sudah ada. Tidak ada baris
// baru ditulis, tidak ada migrasi backfill — begitu halaman Riwayat
// memanggilnya, seluruh riwayat lama otomatis "muncul kembali".
//
// SENGAJA TIDAK masuk ke `dayTotal`/`activeCount` di KPI penjualan
// Riwayat: uang pelunasan cake (kalau cash) sudah tercatat terpisah di
// `cashflow_transactions` kategori non-operasional (lihat
// `recordCakeCashSettlement`), dan pendapatannya sudah diakui via akrual
// cake dari `scheduled_at`. Menambahkannya ke total penjualan POS akan
// menghitung omset yang sama dua kali di dua tempat berbeda.

export interface CakePickupHistoryRow {
  id: string;
  /** ISO. Dipakai halaman untuk urutan kronologis gabungan dengan sale. */
  pickedUpAt: string;
  customerName: string;
  /** "Base · Bentuk · Filling", bagian yang kosong dibuang. */
  spec: string;
  totalIdr: number;
  freeClaim: boolean;
  /** Label siap tampil dari `summarizeCakePayment` — "Lunas" / "DP Rp …"
   *  / dst. Satu sumber kebenaran yang sama dipakai board & detail. */
  paymentLabel: string;
  hasOutstanding: boolean;
  /** Pelunasan yang tercatat PAS saat pickup ini (window ±5 menit dari
   *  `picked_up_at`), bukan DP lama atau pelunasan lain di hari yang
   *  sama. Null kalau order sudah lunas/gratis sebelum diambil. */
  settlement: {
    amountIdr: number;
    method: "cash" | "qris" | null;
    /** Authorizer yang PIN-nya lolos — null untuk pickup dari sebelum
     *  migrasi 133, atau cabang tanpa authorizer `cake_pickup`. */
    recordedByName: string | null;
  } | null;
}

/**
 * Tanggal (WIB) yang punya pengambilan kue via kasir POS di rekening
 * ini. Digabung dengan `listPosSaleDates` di halaman Riwayat supaya
 * navigasi tanggal juga menjangkau hari yang cuma ada pickup kue tanpa
 * penjualan reguler.
 */
export async function listCakePickupHistoryDates(
  bankAccountId: string
): Promise<string[]> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const db = createAdminClient();
  const branch = await resolveCakeBranch(db, bankAccountId);
  if (!branch) return [];

  const dates = new Set<string>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from("cake_orders" as never)
      .select("picked_up_at")
      .eq("branch", branch)
      .eq("picked_up_via", "pos")
      .not("picked_up_at", "is", null)
      .order("picked_up_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return [];
    const batch = (data ?? []) as unknown as { picked_up_at: string }[];
    for (const r of batch) dates.add(jakartaDateString(new Date(r.picked_up_at)));
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return [...dates].sort().reverse();
}

/**
 * Pengambilan kue via kasir POS pada satu tanggal WIB, untuk digabung
 * ke timeline Riwayat.
 */
export async function listCakePickupHistory(
  bankAccountId: string,
  date: string
): Promise<CakePickupHistoryRow[]> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return [];
  const db = createAdminClient();
  const branch = await resolveCakeBranch(db, bankAccountId);
  if (!branch) return [];

  const fromIso = jakartaHourIso(date, 0);
  const toIso = jakartaHourIso(jakartaDateMinusDays(date, -1), 0);

  const { data: rowsRaw } = await db
    .from("cake_orders" as never)
    .select(
      "id, customer_name, base_cake_option_id, shape_option_id, shape_custom, filling_option_id, total_idr, paid_idr, refund_idr, free_claim, picked_up_at"
    )
    .eq("branch", branch)
    .eq("picked_up_via", "pos")
    .gte("picked_up_at", fromIso)
    .lt("picked_up_at", toIso)
    .order("picked_up_at", { ascending: false });

  type Row = {
    id: string;
    customer_name: string;
    base_cake_option_id: string | null;
    shape_option_id: string | null;
    shape_custom: string | null;
    filling_option_id: string | null;
    total_idr: number;
    paid_idr: number;
    refund_idr: number;
    free_claim: boolean;
    picked_up_at: string;
  };
  const rows = (rowsRaw ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  // Label spec: satu query cake_options untuk base/bentuk/filling.
  const optionIds = new Set<string>();
  for (const r of rows) {
    if (r.base_cake_option_id) optionIds.add(r.base_cake_option_id);
    if (r.shape_option_id) optionIds.add(r.shape_option_id);
    if (r.filling_option_id) optionIds.add(r.filling_option_id);
  }
  const { data: specOptRaw } =
    optionIds.size > 0
      ? await db
          .from("cake_options" as never)
          .select("id, label")
          .in("id", [...optionIds])
      : { data: [] };
  const specLabelOf = new Map(
    ((specOptRaw ?? []) as unknown as { id: string; label: string }[]).map(
      (o) => [o.id, o.label]
    )
  );

  // Pelunasan pas pickup: window ±5 menit dari `picked_up_at` — jendela
  // rapat yang cocok dengan penulisan sinkron di `markCakePickedUpAtPos`
  // (payment leg ditulis tepat sebelum status di-set), sekaligus
  // mengecualikan DP lama atau pelunasan yang dicatat staf cake di jam
  // lain hari yang sama.
  const { data: payRaw } = await db
    .from("cake_order_payments" as never)
    .select(
      "cake_order_id, amount_idr, payment_option_id, recorded_by_name, paid_at"
    )
    .in(
      "cake_order_id",
      rows.map((r) => r.id)
    )
    .eq("kind", "pelunasan");
  type PayRow = {
    cake_order_id: string;
    amount_idr: number;
    payment_option_id: string;
    recorded_by_name: string | null;
    paid_at: string;
  };
  const payments = (payRaw ?? []) as unknown as PayRow[];

  const methodOptionIds = new Set(payments.map((p) => p.payment_option_id));
  const { data: methodOptRaw } =
    methodOptionIds.size > 0
      ? await db
          .from("cake_options" as never)
          .select("id, label")
          .in("id", [...methodOptionIds])
      : { data: [] };
  const methodLabelOf = new Map(
    ((methodOptRaw ?? []) as unknown as { id: string; label: string }[]).map(
      (o) => [o.id, o.label]
    )
  );

  const FIVE_MIN_MS = 5 * 60 * 1000;
  const settlementFor = (r: Row) => {
    const pickedMs = new Date(r.picked_up_at).getTime();
    const leg = payments.find(
      (p) =>
        p.cake_order_id === r.id &&
        Math.abs(new Date(p.paid_at).getTime() - pickedMs) <= FIVE_MIN_MS
    );
    if (!leg) return null;
    return {
      amountIdr: leg.amount_idr,
      method: classifyPaymentMethod(methodLabelOf.get(leg.payment_option_id) ?? ""),
      recordedByName: leg.recorded_by_name,
    };
  };

  return rows.map((r) => {
    const pay = summarizeCakePayment({
      totalIdr: r.total_idr,
      netPaidIdr: r.paid_idr,
      refundIdr: r.refund_idr,
      freeClaim: r.free_claim,
    });
    const spec = [
      r.base_cake_option_id ? specLabelOf.get(r.base_cake_option_id) : null,
      r.shape_custom?.trim() ||
        (r.shape_option_id ? specLabelOf.get(r.shape_option_id) : null),
      r.filling_option_id ? specLabelOf.get(r.filling_option_id) : null,
    ]
      .filter((v): v is string => !!v)
      .join(" · ");
    return {
      id: r.id,
      pickedUpAt: r.picked_up_at,
      customerName: r.customer_name,
      spec,
      totalIdr: r.total_idr,
      freeClaim: r.free_claim,
      paymentLabel: pay.label,
      hasOutstanding: pay.hasOutstanding,
      settlement: settlementFor(r),
    };
  });
}

const PICKUP_PROOF_BUCKET = "cake-order-attachments";
const PICKUP_PROOF_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const PICKUP_PROOF_MAX_SIZE = 5 * 1024 * 1024; // 5 MB — sama dengan /api/cake-orders/upload.
const PICKUP_PROOF_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Upload bukti foto pelunasan (QRIS/cash) SAAT serah-terima kue di
 * kasir POS — permintaan eksplisit supaya kasir tidak "asal tekan"
 * metode bayar, meniru pola nota QRIS wajib di checkout POS biasa
 * (`attachPosQrisReceipt`).
 *
 * KENAPA ACTION TERPISAH, BUKAN `/api/cake-orders/upload`. Endpoint itu
 * digerbang `cake_access_assignments` (staf cake) — kasir POS TIDAK
 * punya baris itu, jadi request mereka akan 403 persis seperti
 * `requireCakeOrderAccess` menolak mereka di jalur lain (lihat header
 * file). Gerbangnya di sini `requireAdminOrPosAssignee`, dan rekening
 * yang diperiksa diturunkan dari `orderId` → cabang order, bukan dari
 * klien — pola yang sama dengan `markCakePickedUpAtPos`.
 *
 * Return path saja (belum ditautkan ke payment leg manapun) — client
 * meneruskannya sebagai `settlement.proofPath` ke `markCakePickedUpAtPos`,
 * yang baru menautkannya lewat `insertCakePaymentLeg`. Dua langkah
 * (upload dulu, tautkan belakangan) supaya form besar (foto) tidak ikut
 * naik di request submit utama.
 */
export async function uploadCakePickupPaymentProof(
  formData: FormData
): Promise<
  ActionResult<{ path: string; mimeType: string; sizeBytes: number }>
> {
  const orderId = formData.get("orderId");
  const file = formData.get("file");
  if (typeof orderId !== "string" || !orderId)
    return { ok: false, error: "orderId wajib" };
  if (!(file instanceof File)) return { ok: false, error: "File wajib" };
  if (!PICKUP_PROOF_ALLOWED_TYPES.includes(file.type))
    return { ok: false, error: "Hanya JPG / PNG / WEBP / HEIC" };
  if (file.size > PICKUP_PROOF_MAX_SIZE)
    return { ok: false, error: "Ukuran file maks 5 MB" };

  const db = createAdminClient();
  const { data: orderRaw } = await db
    .from("cake_orders" as never)
    .select("branch")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderRaw as unknown as { branch: string } | null;
  if (!order) return { ok: false, error: "Pesanan tidak ditemukan" };

  const account = await resolveAccountForCakeOrderBranch(db, order.branch);
  if (!account)
    return { ok: false, error: "Rekening POS cabang ini belum disiapkan" };

  const gate = await requireAdminOrPosAssignee(account.id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const ext = PICKUP_PROOF_MIME_EXT[file.type] ?? "bin";
  const path = `payment-proof/${orderId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage
    .from(PICKUP_PROOF_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  return {
    ok: true,
    data: { path, mimeType: file.type, sizeBytes: file.size },
  };
}

export async function markCakePickedUpAtPos(
  input: MarkPickupInput
): Promise<
  ActionResult<{
    orderId: string;
    recordedIdr: number;
    remainingIdr: number;
    /** true kalau perangkat lain sudah menandai lebih dulu. */
    alreadyPickedUp: boolean;
  }>
> {
  if (!input?.orderId) return { ok: false, error: "orderId wajib" };
  const db = createAdminClient();

  const { data: rowRaw } = await db
    .from("cake_orders" as never)
    .select(
      "id, branch, customer_name, status, delivery_option_id, total_idr, paid_idr, refund_idr, free_claim, picked_up_at"
    )
    .eq("id", input.orderId)
    .maybeSingle();
  const order = rowRaw as unknown as MarkRow | null;
  if (!order) return { ok: false, error: "Pesanan tidak ditemukan" };

  // Hanya dua opsi yang relevan di jalur ini — jangan tarik seluruh tabel.
  const wantedOptionIds = [
    order.delivery_option_id,
    input.settlement?.paymentOptionId ?? null,
  ].filter((v): v is string => !!v);
  const { data: optRaw } = await db
    .from("cake_options" as never)
    .select("id, kind, label, needs_address")
    .in("id", wantedOptionIds);
  const options = (optRaw ?? []) as unknown as OptionRow[];

  if (!isPickupOption(options.find((o) => o.id === order.delivery_option_id))) {
    return { ok: false, error: "Pesanan ini pengiriman, bukan pickup" };
  }

  const cakeBranch = posBranchToCakeBranch(order.branch);
  if (!cakeBranch) return { ok: false, error: "Cabang pesanan tidak dikenal" };
  const branchLabel = CAKE_BRANCH_LABELS[cakeBranch];

  // Akun POS diturunkan dari cabang order — BUKAN dari klien.
  const { data: accRaw } = await db
    .from("bank_accounts")
    .select("id, default_branch")
    .eq("business_unit", "Haengbocake")
    .eq("default_branch", branchLabel)
    .eq("pos_enabled", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const account = accRaw as unknown as {
    id: string;
    default_branch: string | null;
  } | null;
  if (!account) {
    return { ok: false, error: "Rekening POS cabang ini belum disiapkan" };
  }

  const gate = await requireAdminOrPosAssignee(account.id);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Status: pesan spesifik supaya kasir tahu harus berbuat apa.
  if (order.picked_up_at || order.status === "done") {
    return { ok: false, error: "Pesanan sudah ditandai diambil" };
  }
  if (order.status !== "ready") {
    if (order.status === "cancelled" || order.status === "discarded")
      return { ok: false, error: "Pesanan sudah dibatalkan" };
    return { ok: false, error: "Kue belum ditandai siap oleh bagian produksi" };
  }

  const before = summarizeCakePayment({
    totalIdr: order.total_idr,
    netPaidIdr: order.paid_idr,
    refundIdr: order.refund_idr,
    freeClaim: order.free_claim,
  });

  if (input.settlement && input.waiveReason) {
    return {
      ok: false,
      error: "Tidak bisa menerima pelunasan sekaligus melepas tanpa tagihan",
    };
  }

  let waiveReason: "cake_konten" | "lainnya" | null = null;
  let waiveNote: string | null = null;
  if (input.waiveReason) {
    if (input.waiveReason.kind !== "cake_konten" && input.waiveReason.kind !== "lainnya") {
      return { ok: false, error: "Alasan tidak valid" };
    }
    waiveReason = input.waiveReason.kind;
    if (waiveReason === "lainnya") {
      const note = (input.waiveReason.note ?? "").trim();
      if (!note) return { ok: false, error: "Alasan wajib diisi untuk Lainnya" };
      waiveNote = note;
    }
  }

  let recordedIdr = 0;
  let settleMethod: "cash" | "qris" | null = null;

  if (input.settlement) {
    const amount = Math.round(input.settlement.amountIdr || 0);
    if (amount <= 0) return { ok: false, error: "Nominal pelunasan harus > 0" };
    if (amount > before.remaining) {
      return {
        ok: false,
        error: `Nominal melebihi sisa tagihan ${formatRp(before.remaining)}`,
      };
    }
    const opt = options.find(
      (o) =>
        o.id === input.settlement!.paymentOptionId &&
        o.kind === "payment_method"
    );
    if (!opt) return { ok: false, error: "Metode pembayaran tidak valid" };
    settleMethod = classifyPaymentMethod(opt.label);
    if (!settleMethod) {
      return {
        ok: false,
        error: `Metode "${opt.label}" tidak bisa diterima di kasir — pakai QRIS atau Tunai`,
      };
    }
    recordedIdr = amount;
  }

  // Waive: seluruh sisa tagihan dianggap dilepas — bukan payment,
  // jadi tidak ada leg/transaksi kas yang ditulis untuk sisa itu.
  const remainingAfter = waiveReason
    ? 0
    : Math.max(0, before.remaining - recordedIdr);
  if (remainingAfter > 0 && !waiveReason && !input.acknowledgeUnpaid) {
    return {
      ok: false,
      error: `Masih kurang ${formatRp(remainingAfter)} — centang konfirmasi dulu`,
    };
  }

  // PIN diverifikasi di sini: setelah SEMUA validasi (supaya authorizer
  // tidak dipanggil ke tablet untuk pesanan yang ternyata sudah diambil
  // atau nominalnya salah), tapi sebelum tulisan pertama. Rekeningnya
  // yang diperiksa adalah `account.id` — hasil turunan dari cabang
  // pesanan, bukan dari klien — jadi kasir Semarang tidak bisa memakai
  // authorizer Pare untuk melepas kue Pare.
  const auth = await verifyOperationPin(account.id, "cake_pickup", input.pin);
  if (!auth.ok) return { ok: false, error: auth.error };

  // Pembayaran DULU, status BELAKANGAN. Kalau status berhasil lalu
  // pembayaran gagal, uang riil hilang catatan. Urutan sebaliknya
  // jinak: pembayaran tercatat tapi status belum pindah, dan kasir
  // bisa mengulang tanpa kehilangan apa pun.
  if (input.settlement && recordedIdr > 0) {
    const res = await insertCakePaymentLeg(
      db,
      {
        orderId: order.id,
        kind: "pelunasan",
        amountIdr: recordedIdr,
        paymentOptionId: input.settlement.paymentOptionId,
        label: `Pelunasan (Kasir ${branchLabel})`,
        notes: input.settlement.notes?.trim() || null,
        // Nama diambil dari PIN yang barusan lolos, tidak pernah dari
        // klien. Null kalau cabang ini belum punya authorizer
        // `cake_pickup` — lihat migrasi 133.
        recordedByName: auth.authorizerName,
        proofPath: input.settlement.proofPath ?? null,
        proofMimeType: input.settlement.proofMimeType ?? null,
        proofSizeBytes: input.settlement.proofSizeBytes ?? null,
      },
      gate.userId
    );
    if (!res.ok) return { ok: false, error: res.error };

    // Tunai masuk laci fisik → wajib tercatat di kas cabang, kalau
    // tidak tutup shift selalu selisih lebih. QRIS TIDAK menulis baris
    // kas: uangnya tidak pernah menyentuh laci. Asimetri ini disengaja.
    if (settleMethod === "cash") {
      const cashRes = await recordCakeCashSettlement({
        bankAccountId: account.id,
        branchLabel: account.default_branch ?? branchLabel,
        amountIdr: recordedIdr,
        customerName: order.customer_name,
        orderId: order.id,
        paymentId: res.paymentId,
        userId: gate.userId,
        authorizerName: auth.authorizerName,
      });
      if (!cashRes.ok) {
        // Pembayaran cake sudah tercatat; yang gagal cuma cermin
        // kasnya. Dilaporkan supaya bisa dibetulkan manual, TIDAK
        // di-rollback — menghapus leg pembayaran yang sah lebih
        // berbahaya daripada satu baris kas yang hilang. Kasir JANGAN
        // mengulang: pengulangan akan menggandakan pembayaran.
        return {
          ok: false,
          error: `Pelunasan tercatat, tapi gagal menulis kas cabang: ${cashRes.error}. Jangan ulangi — catat manual di rekening kas.`,
        };
      }
    }
  }

  // Guard konkuren: dua tablet kasir bisa menekan bersamaan.
  const { data: updatedRaw } = await db
    .from("cake_orders" as never)
    .update({
      status: "done",
      picked_up_at: new Date().toISOString(),
      picked_up_by: gate.userId,
      picked_up_via: "pos",
      pickup_waive_reason: waiveReason,
      pickup_waive_note: waiveNote,
    } as never)
    .eq("id", order.id)
    .eq("status", "ready")
    .is("picked_up_at", null)
    .select("id");
  const alreadyPickedUp = ((updatedRaw ?? []) as unknown[]).length === 0;

  revalidatePath("/pos", "layout");
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");

  return {
    ok: true,
    data: {
      orderId: order.id,
      recordedIdr,
      remainingIdr: remainingAfter,
      alreadyPickedUp,
    },
  };
}

/**
 * Cermin pelunasan tunai ke rekening kas cabang.
 *
 * Kategorinya non-operasional supaya TIDAK dobel di PnL (pendapatannya
 * sudah diakui lewat akrual cake dari scheduled_at). Klasifikasi bonus
 * cake mengenali kategori ini sendiri — lihat `isNonSalesCategory` dan
 * `autoIncludeRule` di custom-cake-bonus.actions.ts — jadi baris ini
 * TIDAK perlu menumpang kolom override `custom_cake_included`, yang
 * memang disediakan untuk keputusan manual manusia.
 *
 * Statement bulanan find-or-create: bulan yang ada pelunasan tapi
 * belum ada transaksi kas lain belum tentu punya statement.
 */
async function recordCakeCashSettlement(args: {
  bankAccountId: string;
  branchLabel: string;
  amountIdr: number;
  customerName: string;
  orderId: string;
  paymentId: string;
  userId: string;
  /** Authorizer yang PIN-nya lolos; null kalau cabang tanpa authorizer. */
  authorizerName: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const now = new Date();
  const date = jakartaDateString(now);
  const [yStr, mStr] = date.split("-");
  const periodYear = Number(yStr);
  const periodMonth = Number(mStr);

  const { data: existing } = await supabase
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", args.bankAccountId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  let statementId: string;
  if (existing) {
    statementId = existing.id;
  } else {
    const { data: created, error: stmtErr } = await supabase
      .from("cashflow_statements")
      .insert({
        bank_account_id: args.bankAccountId,
        period_month: periodMonth,
        period_year: periodYear,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: args.userId,
      })
      .select("id")
      .single();
    if (stmtErr || !created)
      return { ok: false, error: stmtErr?.message ?? "gagal membuat statement" };
    statementId = created.id;
  }

  const { data: maxRow } = await supabase
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: txErr } = await supabase.from("cashflow_transactions").insert({
    statement_id: statementId,
    transaction_date: date,
    transaction_time: jakartaHHMM(now),
    description: `Pelunasan cake — ${args.customerName}`,
    debit: 0,
    credit: args.amountIdr,
    running_balance: null,
    category: CAKE_SETTLEMENT_CASH_CATEGORY,
    branch: args.branchLabel,
    // Penanda telusur kalau nanti perlu rekonsiliasi manual. Nama
    // authorizer ikut di sini, bukan di `description`: deskripsi dibaca
    // aturan kategorisasi kas, dan menyisipkan nama orang ke dalamnya
    // bisa mengubah kategori baris secara tak sengaja.
    notes: `Pelunasan custom cake diterima kasir${
      args.authorizerName ? ` · otorisasi ${args.authorizerName}` : ""
    } · cake:${args.orderId}:${args.paymentId}`,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  });
  if (txErr) return { ok: false, error: txErr.message };

  revalidatePath("/admin/finance", "layout");
  return { ok: true };
}
